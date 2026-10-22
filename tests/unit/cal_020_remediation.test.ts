import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessModelClassifier } from '../../src/server/services/intelligence/domain/BusinessModelClassifier.js';
import { FundamentalModuleAdapter } from '../../src/server/services/intelligence/modules/FundamentalModuleAdapter.js';
import { FereModuleAdapter } from '../../src/server/services/intelligence/modules/FereModuleAdapter.js';
import { ValuationModuleAdapter } from '../../src/server/services/intelligence/modules/ValuationModuleAdapter.js';
import { QglpModuleAdapter } from '../../src/server/services/intelligence/modules/QglpModuleAdapter.js';
import { ValuationIntelligenceEngine } from '../../src/server/services/intelligence/valuation/ValuationIntelligenceEngine.js';
import { CanonicalFactRepository } from '../../src/server/services/intelligence/core/CanonicalFactRepository.js';
import * as databaseModule from '../../src/server/database.js';

describe('CAL_020 Remediation Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Finding 1: CAL020_VALUATION_COVERAGE_001
  // ───────────────────────────────────────────────────────────────────────────
  describe('CAL020_VALUATION_COVERAGE_001: Valuation metric-level coverage gating', () => {
    it('returns INSUFFICIENT coverage and null median/range/percentile for single observation', async () => {
      const engine = ValuationIntelligenceEngine.getInstance();
      const factRepo = CanonicalFactRepository.getInstance();

      // Mock aggregate coverage summary: dense in aggregate (e.g. 35 facts across all domains)
      vi.spyOn(factRepo, 'getCoverageSummary').mockResolvedValue({
        count: 35,
        earliest: '2024-01-01',
        latest: '2025-01-01',
        spanDays: 365,
        missingYears: [],
      });

      // But only 1 PE observation exists
      vi.spyOn(factRepo, 'getHistoricalSeriesMultiMetric').mockResolvedValue([
        {
          factId: 'f1',
          isin: 'INE000A01001',
          symbol: 'TESTSYM',
          metric: 'pe',
          value: 28.5,
          periodEnd: '2025-01-01',
          availableAt: '2025-01-05',
          publishedAt: '2025-01-05',
          sourceType: 'CALCULATED',
        } as any,
      ]);

      vi.spyOn(factRepo, 'getLatestFactsByMetric').mockResolvedValue({
        pe: {
          factId: 'f1',
          isin: 'INE000A01001',
          symbol: 'TESTSYM',
          metric: 'pe',
          value: 28.5,
          availableAt: '2025-01-05',
        } as any,
      });

      const result = await engine.evaluate('TESTSYM', 'NON_FINANCIAL');

      const peContext = result.historicalContext.find(c => c.metric === 'PE');
      expect(peContext).toBeDefined();
      expect(peContext?.currentValue).toBe(28.5);
      expect(peContext?.coverage).toBe('INSUFFICIENT');
      expect(peContext?.median1Y).toBeNull();
      expect(peContext?.min1Y).toBeNull();
      expect(peContext?.max1Y).toBeNull();
      expect(peContext?.current1YPercentile).toBeNull();
      expect(peContext?.limitation).toMatch(/minimum 2 dated historical observations required/i);

      // Overall completeness must be MINIMAL because no valuation metric has qualifying history
      expect(result.dataCompleteness).toBe('MINIMAL');
    });

    it('computes valid median, range, and percentile when multiple dated observations exist', async () => {
      const engine = ValuationIntelligenceEngine.getInstance();
      const factRepo = CanonicalFactRepository.getInstance();

      vi.spyOn(factRepo, 'getCoverageSummary').mockResolvedValue({
        count: 40,
        earliest: '2023-01-01',
        latest: '2025-01-01',
        spanDays: 730,
        missingYears: [],
      });

      vi.spyOn(factRepo, 'getHistoricalSeriesMultiMetric').mockResolvedValue([
        { factId: 'f1', metric: 'pe', value: 20.0, periodEnd: '2023-03-31', availableAt: '2023-04-15', publishedAt: '2023-04-15' },
        { factId: 'f2', metric: 'pe', value: 22.0, periodEnd: '2023-06-30', availableAt: '2023-07-15', publishedAt: '2023-07-15' },
        { factId: 'f3', metric: 'pe', value: 25.0, periodEnd: '2023-09-30', availableAt: '2023-10-15', publishedAt: '2023-10-15' },
        { factId: 'f4', metric: 'pe', value: 30.0, periodEnd: '2023-12-31', availableAt: '2024-01-15', publishedAt: '2024-01-15' },
      ] as any);

      vi.spyOn(factRepo, 'getLatestFactsByMetric').mockResolvedValue({
        pe: { factId: 'f4', metric: 'pe', value: 30.0, availableAt: '2024-01-15' } as any,
      });

      const result = await engine.evaluate('TESTSYM', 'NON_FINANCIAL');

      const peContext = result.historicalContext.find(c => c.metric === 'PE');
      expect(peContext).toBeDefined();
      expect(peContext?.currentValue).toBe(30.0);
      expect(peContext?.coverage).toBe('SPARSE');
      expect(peContext?.median1Y).toBe(23.5);
      expect(peContext?.min1Y).toBe(20.0);
      expect(peContext?.max1Y).toBe(30.0);
      expect(peContext?.current1YPercentile).toBe(75);
      expect(result.dataCompleteness).toBe('PARTIAL');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Finding 2: CAL020_QGLP_FORENSIC_NEGATIVE_002
  // ───────────────────────────────────────────────────────────────────────────
  describe('CAL020_QGLP_FORENSIC_NEGATIVE_002: FERE evidence gating in QGLP risk', () => {
    it('emits DATA_INSUFFICIENT when FERE result is DATA_INSUFFICIENT / zero evidence', async () => {
      const qglp = QglpModuleAdapter.getInstance();

      vi.spyOn(FundamentalModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FUNDAMENTAL',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: {
          symbol: 'BAJFINANCE',
          businessModel: 'NBFC',
          scope: 'STANDALONE',
          series: {},
          trajectory: {},
          warnings: [],
        } as any,
        evidenceRefs: [{ evidenceId: 'ev_fund_1', sourceDocumentId: 'SNAP_UPSTOX', sourceId: 'upstox:competitors:BAJFINANCE', sourceType: 'CALCULATED', timestamp: '2025-01-01' }],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: '2025-01-01',
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      vi.spyOn(FereModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FERE',
        status: 'DATA_INSUFFICIENT',
        dataStatus: 'DATA_INSUFFICIENT',
        result: {
          availableFilings: [],
          warnings: [],
        } as any,
        evidenceRefs: [],
        missingRequirements: ['No indexed filings found'],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      vi.spyOn(ValuationModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'VALUATION',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      const response = await qglp.run('BAJFINANCE');
      const payload = response.result;
      expect(payload).toBeDefined();

      const riskPillar = payload?.risk;
      expect(riskPillar).toBeDefined();

      const redFlagItem = riskPillar?.items.find(i => i.name === 'Accounting & Auditor Red Flags');
      expect(redFlagItem?.status).toBe('DATA_INSUFFICIENT');
      expect(redFlagItem?.observation).toContain('insufficient for red flag clearance');
      expect(redFlagItem?.evidence).toEqual([]);
    });

    it('emits NO_RED_FLAG_DETECTED only when FERE is WORKING and has indexed filings evidence', async () => {
      const qglp = QglpModuleAdapter.getInstance();

      vi.spyOn(FundamentalModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FUNDAMENTAL',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: {
          symbol: 'TCS',
          businessModel: 'NON_FINANCIAL',
          historicalSeries: {},
          trajectory: {} as any,
          dataAsOf: '2025-01-01',
        },
        evidenceRefs: [],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: '2025-01-01',
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      vi.spyOn(FereModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FERE',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: {
          availableFilings: ['AR_2024.pdf'],
          warnings: [],
        } as any,
        evidenceRefs: [
          { evidenceId: 'ev_fere_1', sourceDocumentId: 'AR_2024.pdf', sourceId: 'bse:announcements:TCS', sourceType: 'FILING', timestamp: '2024-06-30' },
          { evidenceId: 'ev_fere_2', sourceDocumentId: 'AUDIT_2024.pdf', sourceId: 'bse:announcements:TCS', sourceType: 'FILING', timestamp: '2024-06-30' },
        ],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: '2024-06-30',
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      vi.spyOn(ValuationModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'VALUATION',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      const response = await qglp.run('TCS');
      const payload = response.result;
      const riskPillar = payload?.risk;
      const redFlagItem = riskPillar?.items.find(i => i.name === 'Accounting & Auditor Red Flags');

      expect(redFlagItem?.status).toBe('NO_RED_FLAG_DETECTED');
      expect(redFlagItem?.observation).toContain('No forensic accounting red flags detected in indexed filings');
      expect(redFlagItem?.evidence.length).toBe(2);
      expect(redFlagItem?.evidence[0].sourceDocumentId).toBe('AR_2024.pdf');
    });

    it('emits WARNING when FERE has accounting red flags', async () => {
      const qglp = QglpModuleAdapter.getInstance();

      vi.spyOn(FundamentalModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FUNDAMENTAL',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: { symbol: 'TESTSYM', businessModel: 'NON_FINANCIAL' } as any,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      vi.spyOn(FereModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FERE',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: {
          availableFilings: ['AR_2024.pdf'],
          warnings: [{ title: 'Auditor qualification noted on receivables' }],
        } as any,
        evidenceRefs: [
          { evidenceId: 'ev1', sourceDocumentId: 'AR_2024.pdf', sourceId: 'bse:filing', sourceType: 'FILING', timestamp: '2024-06-30' },
        ],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      vi.spyOn(ValuationModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'VALUATION',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      const response = await qglp.run('TESTSYM');
      const payload = response.result;
      const riskPillar = payload?.risk;
      const redFlagItem = riskPillar?.items.find(i => i.name === 'Accounting & Auditor Red Flags');

      expect(redFlagItem?.status).toBe('WARNING');
      expect(redFlagItem?.observation).toBe('Auditor qualification noted on receivables');
      expect(redFlagItem?.evidence.length).toBe(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Finding 3: CAL020_QGLP_LEVERAGE_DEFAULT_003
  // ───────────────────────────────────────────────────────────────────────────
  describe('CAL020_QGLP_LEVERAGE_DEFAULT_003: Model-aware leverage evaluation', () => {
    it('marks BANK as NOT_APPLICABLE under banking prudential norms', async () => {
      const qglp = QglpModuleAdapter.getInstance();

      vi.spyOn(FundamentalModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FUNDAMENTAL',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: { symbol: 'HDFCBANK', businessModel: 'BANK' } as any,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      vi.spyOn(FereModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FERE', status: 'SOURCE_UNAVAILABLE', dataStatus: 'SOURCE_UNAVAILABLE',
        result: null, evidenceRefs: [], missingRequirements: [], warnings: [],
        evaluationTimestamp: new Date().toISOString(), dataAsOf: null, configVersion: '1.0.0', engineVersion: 'v1.0',
      });

      vi.spyOn(ValuationModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'VALUATION', status: 'WORKING', dataStatus: 'CURRENT',
        result: null, evidenceRefs: [], missingRequirements: [], warnings: [],
        evaluationTimestamp: new Date().toISOString(), dataAsOf: null, configVersion: '1.0.0', engineVersion: 'v1.0',
      });

      const response = await qglp.run('HDFCBANK');
      const longevityPillar = response.result?.longevity;
      const solvencyItem = longevityPillar?.items.find(i => i.name === 'Balance Sheet Solvency & Deleveraging');

      expect(solvencyItem?.status).toBe('NOT_APPLICABLE');
      expect(solvencyItem?.observation).toContain('banking prudential norms');
      expect(solvencyItem?.evidence).toEqual([]);
    });

    it('marks NBFC as NOT_APPLICABLE under NBFC ALM and borrowing norms', async () => {
      const qglp = QglpModuleAdapter.getInstance();

      vi.spyOn(FundamentalModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FUNDAMENTAL',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: { symbol: 'BAJFINANCE', businessModel: 'NBFC' } as any,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      vi.spyOn(FereModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FERE', status: 'SOURCE_UNAVAILABLE', dataStatus: 'SOURCE_UNAVAILABLE',
        result: null, evidenceRefs: [], missingRequirements: [], warnings: [],
        evaluationTimestamp: new Date().toISOString(), dataAsOf: null, configVersion: '1.0.0', engineVersion: 'v1.0',
      });

      vi.spyOn(ValuationModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'VALUATION', status: 'WORKING', dataStatus: 'CURRENT',
        result: null, evidenceRefs: [], missingRequirements: [], warnings: [],
        evaluationTimestamp: new Date().toISOString(), dataAsOf: null, configVersion: '1.0.0', engineVersion: 'v1.0',
      });

      const response = await qglp.run('BAJFINANCE');
      const longevityPillar = response.result?.longevity;
      const solvencyItem = longevityPillar?.items.find(i => i.name === 'Balance Sheet Solvency & Deleveraging');

      expect(solvencyItem?.status).toBe('NOT_APPLICABLE');
      expect(solvencyItem?.observation).toContain('NBFC prudential norms');
      expect(solvencyItem?.evidence).toEqual([]);
    });

    it('marks non-financial as DATA_INSUFFICIENT when debt trajectory is absent or insufficient', async () => {
      const qglp = QglpModuleAdapter.getInstance();

      vi.spyOn(FundamentalModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FUNDAMENTAL',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: {
          symbol: 'RELIANCE',
          businessModel: 'NON_FINANCIAL',
          trajectory: { debtTrajectory: { status: 'DATA_INSUFFICIENT' } },
        } as any,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      vi.spyOn(FereModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FERE', status: 'SOURCE_UNAVAILABLE', dataStatus: 'SOURCE_UNAVAILABLE',
        result: null, evidenceRefs: [], missingRequirements: [], warnings: [],
        evaluationTimestamp: new Date().toISOString(), dataAsOf: null, configVersion: '1.0.0', engineVersion: 'v1.0',
      });

      vi.spyOn(ValuationModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'VALUATION', status: 'WORKING', dataStatus: 'CURRENT',
        result: null, evidenceRefs: [], missingRequirements: [], warnings: [],
        evaluationTimestamp: new Date().toISOString(), dataAsOf: null, configVersion: '1.0.0', engineVersion: 'v1.0',
      });

      const response = await qglp.run('RELIANCE');
      const longevityPillar = response.result?.longevity;
      const solvencyItem = longevityPillar?.items.find(i => i.name === 'Balance Sheet Solvency & Deleveraging');

      expect(solvencyItem?.status).toBe('DATA_INSUFFICIENT');
      expect(solvencyItem?.observation).toContain('Debt and balance sheet leverage evidence not available');
      expect(solvencyItem?.evidence).toEqual([]);
    });

    it('marks non-financial as SUPPORTED when debt trajectory is DELEVERAGING with evidence', async () => {
      const qglp = QglpModuleAdapter.getInstance();

      vi.spyOn(FundamentalModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FUNDAMENTAL',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: {
          symbol: 'TCS',
          businessModel: 'NON_FINANCIAL',
          trajectory: { debtTrajectory: { status: 'DELEVERAGING' } },
        } as any,
        evidenceRefs: [
          { evidenceId: 'ev_debt', sourceDocumentId: 'BS_2024', sourceId: 'bs', sourceType: 'FILING', timestamp: '2024-03-31' },
        ],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      vi.spyOn(FereModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FERE', status: 'SOURCE_UNAVAILABLE', dataStatus: 'SOURCE_UNAVAILABLE',
        result: null, evidenceRefs: [], missingRequirements: [], warnings: [],
        evaluationTimestamp: new Date().toISOString(), dataAsOf: null, configVersion: '1.0.0', engineVersion: 'v1.0',
      });

      vi.spyOn(ValuationModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'VALUATION', status: 'WORKING', dataStatus: 'CURRENT',
        result: null, evidenceRefs: [], missingRequirements: [], warnings: [],
        evaluationTimestamp: new Date().toISOString(), dataAsOf: null, configVersion: '1.0.0', engineVersion: 'v1.0',
      });

      const response = await qglp.run('TCS');
      const longevityPillar = response.result?.longevity;
      const solvencyItem = longevityPillar?.items.find(i => i.name === 'Balance Sheet Solvency & Deleveraging');

      expect(solvencyItem?.status).toBe('SUPPORTED');
      expect(solvencyItem?.observation).toContain('Historical balance sheet deleveraging supported');
      expect(solvencyItem?.evidence.length).toBe(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Finding 4: CAL020_BUSINESS_MODEL_MISROUTING_004
  // ───────────────────────────────────────────────────────────────────────────
  describe('CAL020_BUSINESS_MODEL_MISROUTING_004: Business model classification and fail-closed handling', () => {
    it('classifies legal company names with financial terms as NBFC without sector/industry', () => {
      const model = BusinessModelClassifier.classify('AAVAS', null, null, 'Aavas Financiers Limited');
      expect(model).toBe('NBFC');
    });

    it('classifies generic name without cues as UNKNOWN', () => {
      const model = BusinessModelClassifier.classify('UNKNOWNCO', null, null, 'Generic Holdings Corp');
      expect(model).toBe('UNKNOWN');
    });

    it('withholds model-dependent financial analysis when model is UNKNOWN in FundamentalModuleAdapter', async () => {
      const adapter = FundamentalModuleAdapter.getInstance();

      // Mock database queries for UNKNOWNCO
      vi.spyOn(databaseModule, 'getDB').mockReturnValue({} as any);
      vi.spyOn(databaseModule, 'dbGet').mockResolvedValue({
        name: 'Generic Holdings Corp',
        sector: null,
        industry: null,
      });

      // Provide income-statement and key-ratios snapshots
      vi.spyOn(databaseModule, 'dbAll').mockResolvedValue([
        {
          endpoint: 'income-statement',
          provider: 'trendlyne',
          fetched_at: '2025-01-01',
          response_json: JSON.stringify({
            data: [
              { year: 'Mar 2024', revenue: 100, ebitda: 25, pat: 15 },
              { year: 'Mar 2023', revenue: 80, ebitda: 20, pat: 12 },
            ],
          }),
        },
      ]);

      const response = await adapter.run('UNKNOWNCO');
      const result = response.result;
      expect(result).toBeDefined();
      expect(result?.businessModel).toBe('UNKNOWN');

      const trajectory = result?.trajectory;
      expect(trajectory?.marginTrajectory.metricUsed).toBe('UNKNOWN');
      expect(trajectory?.marginTrajectory.status).toBe('DATA_INSUFFICIENT');
      expect(trajectory?.marginTrajectory.bpsChange).toBeNull();
      expect(trajectory?.debtTrajectory.status).toBe('DATA_INSUFFICIENT');
      expect(trajectory?.returnProfile.metric).toBe('UNKNOWN');
      expect(trajectory?.returnProfile.status).toBe('DATA_INSUFFICIENT');
      expect(response.warnings.some(w => w.includes('withheld until verified classification exists'))).toBe(true);
    });

    it('withholds working capital and leverage in QglpModuleAdapter when model is UNKNOWN', async () => {
      const qglp = QglpModuleAdapter.getInstance();

      vi.spyOn(FundamentalModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FUNDAMENTAL',
        status: 'WORKING',
        dataStatus: 'CURRENT',
        result: {
          symbol: 'UNKNOWNCO',
          businessModel: 'UNKNOWN',
          trajectory: {},
        } as any,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'v1.0',
      });

      vi.spyOn(FereModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'FERE', status: 'SOURCE_UNAVAILABLE', dataStatus: 'SOURCE_UNAVAILABLE',
        result: null, evidenceRefs: [], missingRequirements: [], warnings: [],
        evaluationTimestamp: new Date().toISOString(), dataAsOf: null, configVersion: '1.0.0', engineVersion: 'v1.0',
      });

      vi.spyOn(ValuationModuleAdapter.getInstance(), 'run').mockResolvedValue({
        moduleId: 'VALUATION', status: 'WORKING', dataStatus: 'CURRENT',
        result: null, evidenceRefs: [], missingRequirements: [], warnings: [],
        evaluationTimestamp: new Date().toISOString(), dataAsOf: null, configVersion: '1.0.0', engineVersion: 'v1.0',
      });

      const response = await qglp.run('UNKNOWNCO');
      const payload = response.result;

      const qualityPillar = payload?.qualityOfBusiness;
      const wcItem = qualityPillar?.items.find(i => i.name === 'Operating Working Capital Discipline');
      expect(wcItem?.status).toBe('DATA_INSUFFICIENT');
      expect(wcItem?.observation).toContain('withheld pending verified business model classification');

      const longevityPillar = payload?.longevity;
      const solvencyItem = longevityPillar?.items.find(i => i.name === 'Balance Sheet Solvency & Deleveraging');
      expect(solvencyItem?.status).toBe('DATA_INSUFFICIENT');
      expect(solvencyItem?.observation).toContain('withheld pending verified business model classification');
    });
  });
});
