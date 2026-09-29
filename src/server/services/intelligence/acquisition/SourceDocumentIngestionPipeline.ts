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
 */

import crypto from 'crypto';
import { getDB, dbRun } from '../../../database.js';
import {
  SourceDocument,
  SourceDocumentType,
  IngestionResult,
} from '../contracts/SourceDocument.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { SourceDocumentRepository } from '../core/SourceDocumentRepository.js';
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
    const db = getDB();

    // 2. Financial Normalization (if metrics provided or if financial results document)
    if (payload.financialMetrics) {
      const normalizer = FinancialResultNormalizer.getInstance();
      const facts = normalizer.normalize(sourceDoc, payload.identity, payload.financialMetrics);

      const insertFactSql = `
        INSERT OR REPLACE INTO company_facts (
          factId, companyId, symbol, isin, metric, value, unit, periodType,
          periodEnd, asOfDate, reportedAt, availableAt, factType, sourceType,
          scope, provider, verificationStatus, sourceDocumentId, sourceUrl,
          evidenceText, calculationMethod, fetchedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const f of facts) {
        await dbRun(db, insertFactSql, [
          f.factId,
          f.companyId,
          f.symbol,
          f.isin,
          f.metric,
          f.value,
          f.unit,
          f.periodType,
          f.periodEnd,
          f.asOfDate,
          f.reportedAt,
          f.availableAt,
          f.factType,
          f.sourceType,
          f.scope,
          f.provider,
          f.verificationStatus,
          f.sourceDocumentId,
          f.sourceUrl,
          f.evidenceText,
          f.calculationMethod,
          new Date().toISOString(),
        ]);
        factsCreated++;
      }
    }

    // 3. Corporate Event Classification & Ingestion
    const classifier = EventClassifier.getInstance();
    const classified = classifier.classify(payload.title, payload.rawContent);

    const eventPreimage = `${isin}|${classified.eventType}|${payload.publishedAt}|${payload.title.toLowerCase().trim()}`;
    const eventId = `ev_${crypto.createHash('sha256').update(eventPreimage).digest('hex').substring(0, 16)}`;

    const insertEventSql = `
      INSERT OR REPLACE INTO company_events (
        eventId, securityId, isin, symbol, eventType, occurredAt, availableAt,
        materiality, title, description, sourceUrl, evidenceRefs, affectedDomains, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();
    await dbRun(db, insertEventSql, [
      eventId,
      isin,
      isin,
      symbol,
      classified.eventType,
      payload.publishedAt,
      payload.availableAt,
      classified.significance,
      payload.title,
      classified.summary,
      payload.sourceUrl || '',
      JSON.stringify([{ evidenceId: `ev_${eventId}`, sourceUrl: payload.sourceUrl || null }]),
      JSON.stringify(['FUNDAMENTALS', 'MANAGEMENT']),
      now,
    ]);
    eventsCreated++;

    // 4. Management Forward-Looking Commitment Extraction
    if (payload.forwardLookingStatements && payload.forwardLookingStatements.length > 0) {
      const extractor = CommitmentExtractor.getInstance();
      const commitments = extractor.extractCommitments(sourceDoc, payload.forwardLookingStatements);

      const insertCommitmentSql = `
        INSERT OR REPLACE INTO management_commitments (
          commitment_id, security_id, symbol, statement_date, speaker,
          source_document_id, original_statement, category, commitment_type,
          metric_key, target_value, target_min, target_max, target_unit,
          target_period, status, evaluation_explanation, evidence_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const comm of commitments) {
        await dbRun(db, insertCommitmentSql, [
          comm.commitmentId,
          comm.securityId,
          symbol,
          comm.statementDate,
          comm.speaker || 'Management',
          sourceDoc.documentId,
          comm.originalStatement,
          comm.category,
          comm.commitmentType,
          comm.metricMapping?.canonicalMetric || null,
          comm.targetValue || null,
          comm.targetMin || null,
          comm.targetMax || null,
          comm.targetUnit || null,
          comm.targetPeriod || null,
          comm.status,
          comm.evaluationExplanation || '',
          `ev_${comm.commitmentId}`,
          new Date().toISOString(),
        ]);
        commitmentsCreated++;
      }
    }

    // Mark document as successfully parsed
    await docRepo.updateParseStatus(doc.documentId, 'PARSED', 'VERIFIED');

    // 5. Trigger Dependency-Selective Refresh in RefreshCoordinator
    let triggerType: 'FINANCIAL_RESULTS' | 'CORPORATE_ANNOUNCEMENT' | 'EARNINGS_TRANSCRIPT' = 'CORPORATE_ANNOUNCEMENT';
    if (payload.sourceType === 'FINANCIAL_RESULTS' || factsCreated > 0) {
      triggerType = 'FINANCIAL_RESULTS';
    } else if (payload.sourceType === 'TRANSCRIPT' || commitmentsCreated > 0) {
      triggerType = 'EARNINGS_TRANSCRIPT';
    }

    const coordinator = CompanyRefreshCoordinator.getInstance();
    const { affected } = coordinator.resolveAffectedModules(triggerType);

    // Run selective refresh through coordinator
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
