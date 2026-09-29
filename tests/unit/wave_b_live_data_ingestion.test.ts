/**
 * wave_b_live_data_ingestion.test.ts
 *
 * Test suite for WealthOS V2 Wave B (Live Data and Evidence Ingestion):
 * 1. First-class SourceDocument persistence and retrieval via SourceDocumentRepository.
 * 2. Strict content-hash idempotency (duplicate ingestion creates 0 duplicate facts/events).
 * 3. Generic Financial Result Normalizer (canonical facts, derived margins, PIT metadata).
 * 4. Generic Corporate Event Classifier (order wins, expansions, management changes).
 * 5. Generic Management Commitment Extractor (forward-looking guidance, metric mapping).
 * 6. Autonomous End-to-End Ingestion Loop (disclosure → facts + events + commitments → refresh).
 */

import { describe, it, expect } from 'vitest';
import { SourceDocumentRepository } from '../../src/server/services/intelligence/core/SourceDocumentRepository.js';
import { EventClassifier } from '../../src/server/services/intelligence/acquisition/EventClassifier.js';
import { FinancialResultNormalizer } from '../../src/server/services/intelligence/acquisition/FinancialResultNormalizer.js';
import { CommitmentExtractor } from '../../src/server/services/intelligence/acquisition/CommitmentExtractor.js';
import {
  SourceDocumentIngestionPipeline,
  IngestionPayload,
} from '../../src/server/services/intelligence/acquisition/SourceDocumentIngestionPipeline.js';
import { SecurityIdentity } from '../../src/server/services/intelligence/contracts/SecurityIdentity.js';
import { SourceDocument } from '../../src/server/services/intelligence/contracts/SourceDocument.js';
import { getDB, dbAll } from '../../src/server/database.js';

describe('Wave B — Live Data and Evidence Ingestion', () => {
  const docRepo = SourceDocumentRepository.getInstance();
  const testSecId = `SEC_WAVE_B_${Date.now()}`;
  const testIsin = `IN_TEST_WAVEB_${Date.now()}`;
  const testIdentity: SecurityIdentity = {
    companyId: testSecId,
    isin: testIsin,
    nseSymbol: 'WAVEBTEST',
    bseCode: '777777',
    companyName: 'Wave B Test Corp',
  };

  describe('1. First-Class SourceDocument Model & Persistence', () => {
    it('persists and retrieves a SourceDocument with strict content hash', async () => {
      const content = `Quarterly financial disclosure and investor update Q1 FY26 ${Date.now()}`;
      const pipeline = SourceDocumentIngestionPipeline.getInstance();
      const contentHash = pipeline.computeContentHash(content);
      const docId = `doc_${testIsin}_001`;

      const doc: SourceDocument = {
        documentId: docId,
        securityId: testIsin,
        symbol: 'WAVEBTEST',
        sourceType: 'FINANCIAL_RESULTS',
        sourceAuthority: 'NSE',
        title: 'Q1 FY26 Unaudited Financial Results',
        sourceUrl: 'https://nsearchives.nseindia.com/results_q1.pdf',
        publishedAt: '2026-07-20T14:30:00Z',
        availableAt: '2026-07-20T14:30:00Z',
        fetchedAt: new Date().toISOString(),
        contentHash,
        localPath: null,
        parseStatus: 'PENDING',
        verificationStatus: 'VERIFIED',
      };

      const { doc: saved, isNew } = await docRepo.saveDocument(doc);
      expect(isNew).toBe(true);
      expect(saved.documentId).toBe(docId);

      const fetchedByHash = await docRepo.findByContentHash(contentHash);
      expect(fetchedByHash).toBeDefined();
      expect(fetchedByHash?.title).toBe('Q1 FY26 Unaudited Financial Results');
      expect(fetchedByHash?.sourceAuthority).toBe('NSE');

      const fetchedById = await docRepo.findByDocumentId(docId);
      expect(fetchedById).toBeDefined();
      expect(fetchedById?.contentHash).toBe(contentHash);
    });
  });

  describe('2. Strict Idempotency Verification', () => {
    it('downloading/ingesting the exact same announcement twice creates ZERO duplicate records', async () => {
      const pipeline = SourceDocumentIngestionPipeline.getInstance();
      const rawContent = `EXCHANGE DISCLOSURE IDEMPOTENCY TEST CONTENT ${Date.now()}`;

      const payload: IngestionPayload = {
        identity: testIdentity,
        sourceType: 'FINANCIAL_RESULTS',
        sourceAuthority: 'BSE',
        title: 'Q2 FY26 Earnings Release',
        publishedAt: '2026-10-25T16:00:00Z',
        availableAt: '2026-10-25T16:00:00Z',
        rawContent,
        financialMetrics: {
          periodEnd: '2026-09-30',
          periodType: 'QUARTERLY',
          metrics: {
            revenue: 2500,
            ebitda: 500,
            pat: 350,
          },
        },
      };

      // Ingestion 1: First time -> new document, creates facts
      const result1 = await pipeline.ingestDisclosure(payload);
      expect(result1.isDuplicate).toBe(false);
      expect(result1.factsCreated).toBeGreaterThan(0);
      expect(result1.eventsCreated).toBe(1);

      // Ingestion 2: Exact same content -> duplicate detected, 0 new facts/events
      const result2 = await pipeline.ingestDisclosure(payload);
      expect(result2.isDuplicate).toBe(true);
      expect(result2.factsCreated).toBe(0);
      expect(result2.eventsCreated).toBe(0);
      expect(result2.commitmentsCreated).toBe(0);
    });
  });

  describe('3. Generic Financial Result Normalization', () => {
    it('normalizes raw metric keys, auto-derives margins, and attaches strict PIT timestamps', () => {
      const normalizer = FinancialResultNormalizer.getInstance();
      const mockDoc: SourceDocument = {
        documentId: 'doc_norm_001',
        securityId: testIsin,
        symbol: 'WAVEBTEST',
        sourceType: 'FINANCIAL_RESULTS',
        sourceAuthority: 'NSE',
        title: 'Audited Results for period ended 2026-03-31',
        sourceUrl: null,
        publishedAt: '2026-05-10T18:00:00Z',
        availableAt: '2026-05-10T18:00:00Z',
        fetchedAt: '2026-05-10T18:05:00Z',
        contentHash: 'hash_norm_001',
        localPath: null,
        parseStatus: 'PARSED',
        verificationStatus: 'VERIFIED',
      };

      const facts = normalizer.normalize(mockDoc, testIdentity, {
        periodEnd: '2026-03-31',
        periodType: 'ANNUAL',
        scope: 'CONSOLIDATED',
        metrics: {
          Sales: 10000,
          operating_profit: 2000,
          profit_after_tax: 1200,
          order_book: 15000,
          capacity_utilization: 82.5,
        },
      });

      expect(facts.length).toBeGreaterThanOrEqual(5);

      const rev = facts.find(f => f.metric === 'revenue_cr');
      expect(rev).toBeDefined();
      expect(rev?.value).toBe(10000);
      expect(rev?.unit).toBe('Cr');
      expect(rev?.availableAt).toBe('2026-05-10T18:00:00Z');

      const ebitda = facts.find(f => f.metric === 'ebitda_cr');
      expect(ebitda?.value).toBe(2000);

      // Verify derived margins
      const ebitdaMargin = facts.find(f => f.metric === 'ebitda_margin_pct');
      expect(ebitdaMargin).toBeDefined();
      expect(ebitdaMargin?.value).toBe(20); // (2000 / 10000) * 100

      const patMargin = facts.find(f => f.metric === 'pat_margin_pct');
      expect(patMargin).toBeDefined();
      expect(patMargin?.value).toBe(12); // (1200 / 10000) * 100

      const ob = facts.find(f => f.metric === 'order_book_cr');
      expect(ob?.value).toBe(15000);

      const cap = facts.find(f => f.metric === 'capacity_utilization_pct');
      expect(cap?.value).toBe(82.5);
    });
  });

  describe('4. Generic Corporate Event Classification', () => {
    const classifier = EventClassifier.getInstance();

    it('classifies commercial order wins generically', () => {
      const ev = classifier.classify('Award of contract worth Rs 450 Cr from Indian Railways');
      expect(ev.eventType).toBe('ORDER_WIN');
      expect(ev.significance).toBe('MATERIAL');
    });

    it('classifies capacity expansion announcements generically', () => {
      const ev = classifier.classify('Commissioning of new manufacturing plant at Dahej, Gujarat');
      expect(ev.eventType).toBe('CAPACITY_EXPANSION');
      expect(ev.significance).toBe('MATERIAL');
    });

    it('classifies leadership changes generically', () => {
      const ev = classifier.classify('Appointment of Mr. Rajesh Verma as Chief Financial Officer');
      expect(ev.eventType).toBe('MANAGEMENT_CHANGE');
      expect(ev.significance).toBe('MATERIAL');
    });

    it('classifies financial results disclosures generically', () => {
      const ev = classifier.classify('Outcome of Board Meeting - Unaudited Financial Results for Q3');
      expect(ev.eventType).toBe('FINANCIAL_RESULTS');
      expect(ev.significance).toBe('CRITICAL');
    });

    it('classifies corporate actions and dividends generically', () => {
      const ev = classifier.classify('Declaration of Interim Dividend of Rs. 5 per share');
      expect(ev.eventType).toBe('DIVIDEND_ANNOUNCEMENT');
    });
  });

  describe('5. Generic Management Commitment Extraction', () => {
    const extractor = CommitmentExtractor.getInstance();
    const mockDoc: SourceDocument = {
      documentId: 'doc_comm_001',
      securityId: testIsin,
      symbol: 'WAVEBTEST',
      sourceType: 'INVESTOR_PRESENTATION',
      sourceAuthority: 'COMPANY_IR',
      title: 'Investor Presentation Q4 FY25',
      sourceUrl: null,
      publishedAt: '2025-05-15T10:00:00Z',
      availableAt: '2025-05-15T10:00:00Z',
      fetchedAt: '2025-05-15T10:05:00Z',
      contentHash: 'hash_comm_001',
      localPath: null,
      parseStatus: 'PARSED',
      verificationStatus: 'VERIFIED',
    };

    it('extracts revenue target with metric mapping and target period', () => {
      const commitments = extractor.extractCommitments(mockDoc, [
        { quote: 'We are targeting revenue of ₹5,000 Cr by FY27 through organic expansion.' },
      ]);

      expect(commitments.length).toBe(1);
      const c = commitments[0];
      expect(c.category).toBe('REVENUE');
      expect(c.commitmentType).toBe('NUMERIC_TARGET');
      expect(c.targetValue).toBe(5000);
      expect(c.targetUnit).toBe('Cr');
      expect(c.targetPeriod).toBe('2027-03-31');
      expect(c.metricMapping?.canonicalMetric).toBe('revenue_cr');
      expect(c.status).toBe('NOT_YET_DUE');
    });

    it('extracts EBITDA margin range guidance', () => {
      const commitments = extractor.extractCommitments(mockDoc, [
        { quote: 'Management expects EBITDA margin of 18-20% for FY26.' },
      ]);

      expect(commitments.length).toBe(1);
      const c = commitments[0];
      expect(c.category).toBe('MARGIN');
      expect(c.commitmentType).toBe('RANGE');
      expect(c.targetMin).toBe(18);
      expect(c.targetMax).toBe(20);
      expect(c.targetUnit).toBe('%');
      expect(c.metricMapping?.canonicalMetric).toBe('ebitda_margin_pct');
    });

    it('extracts capex plans and deleveraging commitments', () => {
      const commitments = extractor.extractCommitments(mockDoc, [
        { quote: 'We have planned capex of ₹800 Cr over the next 2 years in FY26.' },
        { quote: 'Our target is to become net debt free by FY26.' },
      ]);

      expect(commitments.length).toBe(2);

      const capex = commitments.find(c => c.category === 'CAPEX');
      expect(capex).toBeDefined();
      expect(capex?.targetValue).toBe(800);
      expect(capex?.metricMapping?.canonicalMetric).toBe('capex_cr');

      const debt = commitments.find(c => c.category === 'DELEVERAGING');
      expect(debt).toBeDefined();
      expect(debt?.targetValue).toBe(0);
      expect(debt?.metricMapping?.canonicalMetric).toBe('net_debt_cr');
    });
  });

  describe('6. Autonomous End-to-End Ingestion Loop without Manual DB Edits', () => {
    it('turns an external disclosure into persisted facts, events, and commitments, and triggers refresh', async () => {
      const pipeline = SourceDocumentIngestionPipeline.getInstance();
      const uniqueTimestamp = Date.now();
      const content = `Full Disclosure Ingestion Test ${uniqueTimestamp} for ${testIsin}`;

      const payload: IngestionPayload = {
        identity: testIdentity,
        sourceType: 'FINANCIAL_RESULTS',
        sourceAuthority: 'NSE',
        title: `Q3 FY26 Audited Results Announcement ${uniqueTimestamp}`,
        publishedAt: '2026-01-20T15:00:00Z',
        availableAt: '2026-01-20T15:00:00Z',
        rawContent: content,
        financialMetrics: {
          periodEnd: '2025-12-31',
          periodType: 'QUARTERLY',
          metrics: {
            revenue: 3200,
            ebitda: 640,
            pat: 400,
            eps: 12.5,
          },
        },
        forwardLookingStatements: [
          { quote: 'We expect EBITDA margin of 19-21% in FY27 as Dahej plant ramps up.' },
        ],
      };

      const result = await pipeline.ingestDisclosure(payload);
      expect(result.isDuplicate).toBe(false);
      expect(result.factsCreated).toBeGreaterThanOrEqual(4); // rev, ebitda, pat, eps + margins
      expect(result.eventsCreated).toBe(1);
      expect(result.commitmentsCreated).toBe(1);
      expect(result.affectedModules).toContain('fundamental');
      expect(result.affectedModules).toContain('valuation');

      // Verify facts are in portfolio.db
      const db = getDB();
      const factsInDb = await dbAll<any>(
        db,
        'SELECT * FROM company_facts WHERE isin = ? AND periodEnd = ?',
        [testIsin, '2025-12-31']
      );
      expect(factsInDb.length).toBeGreaterThanOrEqual(4);
      expect(factsInDb.some(f => f.metric === 'revenue_cr' && Number(f.value) === 3200)).toBe(true);

      // Verify events are in portfolio.db
      const eventsInDb = await dbAll<any>(
        db,
        'SELECT * FROM company_events WHERE isin = ?',
        [testIsin]
      );
      expect(eventsInDb.length).toBeGreaterThanOrEqual(1);
      expect(eventsInDb.some(e => e.eventType === 'FINANCIAL_RESULTS')).toBe(true);

      // Verify commitments are in portfolio.db
      const commsInDb = await dbAll<any>(
        db,
        'SELECT * FROM management_commitments WHERE security_id = ?',
        [testIsin]
      );
      expect(commsInDb.length).toBeGreaterThanOrEqual(1);
      expect(commsInDb.some(c => c.category === 'MARGIN')).toBe(true);
    });
  });
});
