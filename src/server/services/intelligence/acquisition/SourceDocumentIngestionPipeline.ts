/**
 * SourceDocumentIngestionPipeline.ts — Wave B Master Ingestion Pipeline
 * WealthOS V2 (Live Data and Evidence Ingestion)
 *
 * Implements the complete autonomous ingestion loop:
 * SOURCE → SourceDocument → Evidence → CanonicalFact / CompanyEvent / ManagementCommitment
 *   → Selective Invalidation → Snapshot B → Delta A→B → Watch Evaluation → What Changed
 *
 * Strict Invariants:
 * 1. Content-hash idempotency (downloading same announcement twice produces zero duplicate records).
 * 2. Zero company-specific hardcoded branches.
 * 3. Strict Point-in-Time (PIT) metadata propagation.
 * 4. Zero runtime DDL.
 * 5. ZERO direct database writes — all persistence delegated to repository layer.
 *    company_facts   → CanonicalFactRepository.persistFact()
 *    company_events  → CompanyEventRepository.persistEvent()
 *    management_commitments → ManagementCommitmentRepository.persistCommitment()
 */

import crypto from 'crypto';
import {
  SourceDocument,
  SourceDocumentType,
  IngestionResult,
} from '../contracts/SourceDocument.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { SourceDocumentRepository } from '../core/SourceDocumentRepository.js';
import { CanonicalFactRepository } from '../core/CanonicalFactRepository.js';
import { CompanyEventRepository } from '../core/CompanyEventRepository.js';
import { ManagementCommitmentRepository } from '../core/ManagementCommitmentRepository.js';
import { EventClassifier } from './EventClassifier.js';
import {
  FinancialResultNormalizer,
  RawFinancialDisclosure,
} from './FinancialResultNormalizer.js';
import {
  CommitmentExtractor,
  RawStatementCandidate,
} from './CommitmentExtractor.js';
import { CompanyRefreshCoordinator } from '../coordinator/CompanyRefreshCoordinator.js';

export interface IngestionPayload {
  identity: SecurityIdentity;
  sourceType: SourceDocumentType;
  sourceAuthority: string;
  title: string;
  sourceUrl?: string | null;
  publishedAt: string; // ISO date string
  availableAt: string; // ISO date string
  rawContent: string; // Raw text or body used for SHA-256 idempotency hash
  financialMetrics?: RawFinancialDisclosure;
  forwardLookingStatements?: RawStatementCandidate[];
}

export class SourceDocumentIngestionPipeline {
  private static instance: SourceDocumentIngestionPipeline;

  private constructor() {}

  public static getInstance(): SourceDocumentIngestionPipeline {
    if (!SourceDocumentIngestionPipeline.instance) {
      SourceDocumentIngestionPipeline.instance = new SourceDocumentIngestionPipeline();
    }
    return SourceDocumentIngestionPipeline.instance;
  }

  public computeContentHash(content: string): string {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
  }

  public async ingestDisclosure(payload: IngestionPayload): Promise<IngestionResult> {
    const docRepo = SourceDocumentRepository.getInstance();
    const factRepo = CanonicalFactRepository.getInstance();
    const eventRepo = CompanyEventRepository.getInstance();
    const commitmentRepo = ManagementCommitmentRepository.getInstance();

    const contentHash = this.computeContentHash(payload.rawContent);
    const isin = payload.identity.isin;
    const symbol = payload.identity.nseSymbol || payload.identity.bseCode || '';

    const documentId = `doc_${isin}_${contentHash.substring(0, 16)}`;

    const sourceDoc: SourceDocument = {
      documentId,
      securityId: isin,
      symbol,
      sourceType: payload.sourceType,
      sourceAuthority: payload.sourceAuthority,
      title: payload.title,
      sourceUrl: payload.sourceUrl || null,
      publishedAt: payload.publishedAt,
      availableAt: payload.availableAt,
      fetchedAt: new Date().toISOString(),
      contentHash,
      localPath: null,
      parseStatus: 'PENDING',
      verificationStatus: 'VERIFIED',
    };

    // 1. Idempotent SourceDocument Persistence
    const { doc, isNew } = await docRepo.saveDocument(sourceDoc);
    if (!isNew) {
      return {
        document: doc,
        isDuplicate: true,
        factsCreated: 0,
        eventsCreated: 0,
        commitmentsCreated: 0,
        affectedModules: [],
      };
    }

    let factsCreated = 0;
    let eventsCreated = 0;
    let commitmentsCreated = 0;

    // 2. Financial Normalization → CanonicalFactRepository (single write authority)
    if (payload.financialMetrics) {
      const normalizer = FinancialResultNormalizer.getInstance();
      const facts = normalizer.normalize(doc, payload.identity, payload.financialMetrics);

      for (const f of facts) {
        await factRepo.persistFact(f);
        factsCreated++;
      }
    }

    // 3. Corporate Event Classification → CompanyEventRepository (single write authority)
    const classifier = EventClassifier.getInstance();
    const classified = classifier.classify(payload.title, payload.rawContent);

    const eventPreimage = `${isin}|${classified.eventType}|${payload.publishedAt}|${payload.title.toLowerCase().trim()}`;
    const eventId = `ev_${crypto.createHash('sha256').update(eventPreimage).digest('hex').substring(0, 16)}`;

    await eventRepo.persistEvent({
      eventId,
      isin,
      symbol,
      eventType: classified.eventType,
      occurredAt: payload.publishedAt,
      availableAt: payload.availableAt,
      materiality: classified.significance,
      title: payload.title,
      description: classified.summary,
      sourceUrl: payload.sourceUrl || null,
      evidenceRefs: [{ evidenceId: `ev_${eventId}`, sourceUrl: payload.sourceUrl || null }],
      affectedDomains: ['FUNDAMENTALS', 'MANAGEMENT'],
    });
    eventsCreated++;

    // 4. Management Forward-Looking Commitment Extraction → ManagementCommitmentRepository
    if (payload.forwardLookingStatements && payload.forwardLookingStatements.length > 0) {
      const extractor = CommitmentExtractor.getInstance();
      const commitments = extractor.extractCommitments(doc, payload.forwardLookingStatements);

      for (const comm of commitments) {
        await commitmentRepo.persistCommitment(comm, symbol);
        commitmentsCreated++;
      }
    }

    // Mark document as successfully parsed
    await docRepo.updateParseStatus(doc.documentId, 'PARSED', 'VERIFIED');

    // 5. Trigger Dependency-Selective Refresh via RefreshCoordinator
    let triggerType: 'FINANCIAL_RESULTS' | 'CORPORATE_ANNOUNCEMENT' | 'EARNINGS_TRANSCRIPT' = 'CORPORATE_ANNOUNCEMENT';
    if (payload.sourceType === 'FINANCIAL_RESULTS' || factsCreated > 0) {
      triggerType = 'FINANCIAL_RESULTS';
    } else if (payload.sourceType === 'TRANSCRIPT' || commitmentsCreated > 0) {
      triggerType = 'EARNINGS_TRANSCRIPT';
    }

    const coordinator = CompanyRefreshCoordinator.getInstance();
    const { affected } = coordinator.resolveAffectedModules(triggerType);

    try {
      await coordinator.refreshCompany(
        payload.identity,
        triggerType,
        undefined,
        payload.availableAt
      );
    } catch (refreshErr) {
      console.warn('[SourceDocumentIngestionPipeline] refreshCompany warning:', refreshErr);
    }

    return {
      document: doc,
      isDuplicate: false,
      factsCreated,
      eventsCreated,
      commitmentsCreated,
      affectedModules: affected,
    };
  }
}
