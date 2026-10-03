import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Analyze360FieldResolver, FIELD_SOURCE_DEFINITIONS } from '../../src/server/services/Analyze360FieldSourceMap.js';
import * as dbModule from '../../src/server/database.js';
import { Analyze360Service } from '../../src/server/services/Analyze360Service.js';
import * as fere from '../../src/server/services/FereEvidenceService.js';
import { SevenStrategiesCandidateEnrichmentService } from '../../src/server/services/SevenStrategiesCandidateEnrichmentService.js';

vi.mock('../../src/server/database.js', () => ({
  getDB: vi.fn(),
  dbGet: vi.fn(),
  dbAll: vi.fn(),
}));

vi.mock('../../src/server/services/FereEvidenceService.js', () => ({
  readFereEvidence: vi.fn(),
}));

describe('Phase 6 — Analyze360FieldResolver & Field Source Map', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dbModule.getDB as any).mockReturnValue({});
  });

  it('exposes all required deterministic field-source definitions with explicit guardrails', () => {
    const requiredKeys = [
      'salesCagr3yPct',
      'profitCagr3yPct',
      'cfoToPatPct',
      'cfoToOperatingProfitPct',
      'operatingMarginTrend',
      'promoterPledgePct',
      'fiiTrend',
      'diiTrend',
      'profitableQuarterCount',
      'profitableYears',
      'positiveCfoYears',
      'roceConsistency',
      'marginStability',
      'peVsHistory',
      'peVsSector',
      'pegRatio',
      'freeCashFlow',
      'fcfYield',
      'workingCapital',
      'demandOutlook',
      'peerContext',
      'keyRisks',
      'whatToWatchNext',
    ];

    for (const key of requiredKeys) {
      const def = FIELD_SOURCE_DEFINITIONS[key];
      expect(def, `Missing field definition for ${key}`).toBeDefined();
      expect(def.key).toBeDefined();
      expect(def.preferredSource).toBeDefined();
      expect(def.allowedPeriodTypes.length).toBeGreaterThan(0);
      expect(def.missingReason).toBeDefined();
    }
  });

  it('strictly rejects period substitution for 3Y CAGR and requires 4 consecutive annual filings', async () => {
    const def = FIELD_SOURCE_DEFINITIONS['salesCagr3yPct'];
    expect(def.allowedPeriodTypes).toEqual(['ANNUAL']);
    expect(def.missingReason).toBe('NO_TRUE_3Y_CAGR_AVAILABLE');

    (dbModule.dbAll as any).mockResolvedValue([]);
    (dbModule.dbGet as any).mockResolvedValue(null);

    const { fields } = await Analyze360FieldResolver.resolveAllFields('NONEXISTENT_SYMBOL_XYZ', null);
    expect(fields.salesCagr3yPct.value).toBeNull();
    expect(fields.salesCagr3yPct.status).toBe('MISSING');
    expect(fields.salesCagr3yPct.missingReason).toBe('NO_TRUE_3Y_CAGR_AVAILABLE');

    expect(fields.profitCagr3yPct.value).toBeNull();
    expect(fields.profitCagr3yPct.status).toBe('MISSING');
    expect(fields.profitCagr3yPct.missingReason).toBe('NO_TRUE_3Y_CAGR_AVAILABLE');
  });

  it('proves irregular or non-3-year annual facts do not produce 3Y CAGR', async () => {
    // 4 annual points but irregular spans (2018, 2020, 2022, 2024 -> span is 6 years, not 3)
    (dbModule.dbAll as any).mockImplementation((_db: any, query: string) => {
      if (query.includes('FROM company_facts')) {
        return Promise.resolve([
          { factId: 'f1', metric: 'revenue', periodType: 'ANNUAL', periodEnd: '2018-03-31', value: 100, provider: 'TEST_P' },
          { factId: 'f2', metric: 'revenue', periodType: 'ANNUAL', periodEnd: '2020-03-31', value: 120, provider: 'TEST_P' },
          { factId: 'f3', metric: 'revenue', periodType: 'ANNUAL', periodEnd: '2022-03-31', value: 140, provider: 'TEST_P' },
          { factId: 'f4', metric: 'revenue', periodType: 'ANNUAL', periodEnd: '2024-03-31', value: 160, provider: 'TEST_P' },
        ]);
      }
      return Promise.resolve([]);
    });

    const { fields } = await Analyze360FieldResolver.resolveAllFields('TEST', null);
    expect(fields.salesCagr3yPct.value).toBeNull();
    expect(fields.salesCagr3yPct.status).toBe('MISSING');
    expect(fields.salesCagr3yPct.missingReason).toBe('NO_TRUE_3Y_CAGR_AVAILABLE');
  });

  it('proves exactly 4 consecutive annual points spanning exactly 3 years produce CAGR and joined fact IDs', async () => {
    // Exactly 4 consecutive annual periods: 2021, 2022, 2023, 2024 (span = 3)
    (dbModule.dbAll as any).mockImplementation((_db: any, query: string) => {
      if (query.includes('FROM company_facts')) {
        return Promise.resolve([
          { factId: 'fact_2021', metric: 'revenue', periodType: 'ANNUAL', periodEnd: '2021-03-31', value: 100, provider: 'NSE_ANNUAL', availableAt: '2021-05-01' },
          { factId: 'fact_2022', metric: 'revenue', periodType: 'ANNUAL', periodEnd: '2022-03-31', value: 110, provider: 'NSE_ANNUAL', availableAt: '2022-05-01' },
          { factId: 'fact_2023', metric: 'revenue', periodType: 'ANNUAL', periodEnd: '2023-03-31', value: 121, provider: 'NSE_ANNUAL', availableAt: '2023-05-01' },
          { factId: 'fact_2024', metric: 'revenue', periodType: 'ANNUAL', periodEnd: '2024-03-31', value: 133.1, provider: 'NSE_ANNUAL', availableAt: '2024-05-01' },
        ]);
      }
      return Promise.resolve([]);
    });

    const { fields, qglpInputs } = await Analyze360FieldResolver.resolveAllFields('TEST', null);
    expect(fields.salesCagr3yPct.value).toBe(10);
    expect(fields.salesCagr3yPct.status).toBe('AVAILABLE');
    expect(fields.salesCagr3yPct.sourceFactId).toBe('fact_2021+fact_2024');
    expect(fields.salesCagr3yPct.provider).toBe('NSE_ANNUAL');
    expect(fields.salesCagr3yPct.periodEnd).toBe('2021-03-31 to 2024-03-31');
    expect(qglpInputs.salesCagr3yPct).toBe(10);
  });

  it('proves one-period FII/DII data does not produce trend and remains MISSING', async () => {
    (dbModule.dbAll as any).mockImplementation((_db: any, query: string) => {
      if (query.includes('FROM HistoricalShareholdingPattern')) {
        return Promise.resolve([
          { quarter_label: 'Q4 2024', as_of_date: '2024-03-31', fii_pct: 12.5, dii_pct: 8.0 }
        ]);
      }
      return Promise.resolve([]);
    });

    const { fields } = await Analyze360FieldResolver.resolveAllFields('TEST', { fii_pct: 12.5, dii_pct: 8.0 });
    expect(fields.fiiTrend.value).toBeNull();
    expect(fields.fiiTrend.status).toBe('MISSING');
    expect(fields.fiiTrend.missingReason).toBe('NO_FII_HOLDING_TREND');

    expect(fields.diiTrend.value).toBeNull();
    expect(fields.diiTrend.status).toBe('MISSING');
    expect(fields.diiTrend.missingReason).toBe('NO_DII_HOLDING_TREND');
  });

  it('proves two-period FII/DII data produces direction, delta, and note', async () => {
    (dbModule.dbAll as any).mockImplementation((_db: any, query: string) => {
      if (query.includes('FROM HistoricalShareholdingPattern')) {
        return Promise.resolve([
          { quarter_label: 'Q4 2024', as_of_date: '2024-03-31', fii_pct: 15.0, dii_pct: 7.0 },
          { quarter_label: 'Q3 2024', as_of_date: '2023-12-31', fii_pct: 12.5, dii_pct: 8.5 }
        ]);
      }
      return Promise.resolve([]);
    });

    const { fields } = await Analyze360FieldResolver.resolveAllFields('TEST', null);
    expect(fields.fiiTrend.value).toBe('INCREASING');
    expect(fields.fiiTrend.status).toBe('AVAILABLE');
    expect(fields.fiiTrend.note).toContain('+2.5%');

    expect(fields.diiTrend.value).toBe('DECREASING');
    expect(fields.diiTrend.status).toBe('AVAILABLE');
    expect(fields.diiTrend.note).toContain('-1.5%');
  });

  it('proves summarySnapshot.whatToWatchNext uses fundamental.whatToWatchNext', async () => {
    (dbModule.dbGet as any).mockImplementation((_db: any, query: string) => {
      if (query.includes('FROM SecurityDossierSnapshots')) {
        return Promise.resolve({
          full_dossier_json: JSON.stringify({
            thesis: { invalidationTriggers: ['Weekly close below 50 EMA'] }
          })
        });
      }
      return Promise.resolve(null);
    });

    (dbModule.dbAll as any).mockResolvedValue([]);

    const mockFere = fere.readFereEvidence as any;
    mockFere.mockResolvedValue({ status: 'AVAILABLE', verifiedFactCount: 0, verifiedMetricCount: 0, documents: [], missingFields: [] });

    const mockEnrichment = vi.spyOn(SevenStrategiesCandidateEnrichmentService.getInstance(), 'bulkEnrich');
    mockEnrichment.mockResolvedValue(new Map([
      ['TEST', { symbol: 'TEST', latestClose: 100, latestOhlcvDate: '2024-03-31', technicalFreshnessStatus: 'VALID', ohlcvStatus: 'AVAILABLE' } as any]
    ]));

    const service = Analyze360Service.getInstance();
    const result = await service.getAnalyze360View('TEST', 'cand-1', ['sig-1'], '2026-10-01', ['S1a']);

    expect(result.summarySnapshot.whatToWatchNext.value).toBe('Weekly close below 50 EMA');
    expect(result.summarySnapshot.whatToWatchNext.status).toBe('AVAILABLE');
    expect(result.summarySnapshot.whatToWatchNext).toEqual(result.fundamental.whatToWatchNext);
  });

  it('proves CFO/PAT does not use SecurityDossierSnapshots fallback as if fact', async () => {
    (dbModule.dbGet as any).mockImplementation((_db: any, query: string) => {
      if (query.includes('FROM SecurityDossierSnapshots')) {
        return Promise.resolve({
          full_dossier_json: JSON.stringify({
            governanceAndAccounting: { balanceSheetForensics: { cfoPatConversionPct: 135 } }
          })
        });
      }
      return Promise.resolve(null);
    });
    (dbModule.dbAll as any).mockResolvedValue([]);

    const { fields } = await Analyze360FieldResolver.resolveAllFields('TEST', null);
    expect(fields.cfoToPatPct.value).toBeNull();
    expect(fields.cfoToPatPct.status).toBe('MISSING');
    expect(fields.cfoToPatPct.missingReason).toBe('NO_MATCHED_PERIOD_CFO_AND_PAT');
  });

  it('proves CFO/OperatingProfit does not use cfo_to_ebitda_pct as operating profit', async () => {
    (dbModule.dbGet as any).mockImplementation((_db: any, query: string) => {
      if (query.includes('FROM FEREEnrichedLedger')) {
        return Promise.resolve({ cfo_to_ebitda_pct: 88.5 });
      }
      return Promise.resolve(null);
    });
    (dbModule.dbAll as any).mockResolvedValue([]);

    const { fields } = await Analyze360FieldResolver.resolveAllFields('TEST', null);
    expect(fields.cfoToOperatingProfitPct.value).toBeNull();
    expect(fields.cfoToOperatingProfitPct.status).toBe('MISSING');
    expect(fields.cfoToOperatingProfitPct.missingReason).toBe('NO_MATCHED_PERIOD_CFO_AND_OP_PROFIT');
  });

  it('proves QGLP roceConsistencyPct and marginStabilityPct remain null without real multi-period evidence', async () => {
    (dbModule.dbAll as any).mockResolvedValue([]);
    (dbModule.dbGet as any).mockResolvedValue(null);

    // Provide single latest ROCE (25%) and single quarterly OPM
    const { qglpInputs } = await Analyze360FieldResolver.resolveAllFields('TEST', { roce_pct: 25.0 });
    expect(qglpInputs.roceConsistencyPct).toBeNull();
    expect(qglpInputs.marginStabilityPct).toBeNull();
  });

  it('proves working capital note does not default missing DSO/DIO/DPO to 0', async () => {
    (dbModule.dbGet as any).mockImplementation((_db: any, query: string) => {
      if (query.includes('FROM FEREEnrichedLedger')) {
        return Promise.resolve({
          cash_conversion_cycle: 65,
          dso: null,
          dio: null,
          dpo: null
        });
      }
      return Promise.resolve(null);
    });
    (dbModule.dbAll as any).mockResolvedValue([]);

    const { fields } = await Analyze360FieldResolver.resolveAllFields('TEST', null);
    expect(fields.workingCapital.value).toBe(65);
    expect(fields.workingCapital.note).toContain('DSO: N/A');
    expect(fields.workingCapital.note).toContain('DIO: N/A');
    expect(fields.workingCapital.note).toContain('DPO: N/A');
    expect(fields.workingCapital.note).not.toContain('DSO: 0');
  });
  describe('Phase 6B — Free Cash Flow and FCF Yield', () => {
    it('calculates FCF when real matched CFO and real capex outflow exist', async () => {
      (dbModule.dbAll as any).mockImplementation((_db: any, query: string) => {
        if (query.includes('FROM company_facts')) {
          return Promise.resolve([
            { factId: 'cfo_1', metric: 'cfo', periodType: 'ANNUAL', periodEnd: '2024-03-31', value: 250.0, provider: 'TEST_P', availableAt: '2024-05-01' },
            { factId: 'capex_1', metric: 'capex_cash_outflow', periodType: 'ANNUAL', periodEnd: '2024-03-31', value: 75.0, provider: 'TEST_P', availableAt: '2024-05-01' }
          ]);
        }
        return Promise.resolve([]);
      });

      const { fields, qglpInputs } = await Analyze360FieldResolver.resolveAllFields('TEST', { market_cap_cr: 3500 });
      expect(fields.freeCashFlow.value).toBe(175.0);
      expect(fields.freeCashFlow.status).toBe('AVAILABLE');
      expect(fields.freeCashFlow.sourceFactId).toBe('cfo_1+capex_1');
      expect(fields.freeCashFlow.periodEnd).toBe('2024-03-31');

      // FCF Yield with market cap
      expect(fields.fcfYield.value).toBe(5.0); // 175 / 3500 * 100 = 5.0%
      expect(fields.fcfYield.status).toBe('AVAILABLE');
      expect(qglpInputs.fcfYieldPct).toBe(5.0);
    });

    it('leaves FCF missing when CFO exists without real capex', async () => {
      (dbModule.dbAll as any).mockImplementation((_db: any, query: string) => {
        if (query.includes('FROM company_facts')) {
          return Promise.resolve([
            { factId: 'cfo_1', metric: 'cfo', periodType: 'ANNUAL', periodEnd: '2024-03-31', value: 250.0, provider: 'TEST_P' }
          ]);
        }
        return Promise.resolve([]);
      });

      const { fields } = await Analyze360FieldResolver.resolveAllFields('TEST', { market_cap_cr: 3500 });
      expect(fields.freeCashFlow.value).toBeNull();
      expect(fields.freeCashFlow.status).toBe('MISSING');
      expect(fields.freeCashFlow.missingReason).toBe('NO_MATCHED_CFO_AND_CAPEX');

      expect(fields.fcfYield.value).toBeNull();
      expect(fields.fcfYield.status).toBe('MISSING');
      expect(fields.fcfYield.missingReason).toBe('NO_MATCHED_CFO_AND_CAPEX');
    });

    it('leaves FCF yield missing when FCF exists but market cap is missing', async () => {
      (dbModule.dbAll as any).mockImplementation((_db: any, query: string) => {
        if (query.includes('FROM company_facts')) {
          return Promise.resolve([
            { factId: 'cfo_1', metric: 'cfo', periodType: 'ANNUAL', periodEnd: '2024-03-31', value: 250.0, provider: 'TEST_P' },
            { factId: 'capex_1', metric: 'capex_cash_outflow', periodType: 'ANNUAL', periodEnd: '2024-03-31', value: 75.0, provider: 'TEST_P' }
          ]);
        }
        return Promise.resolve([]);
      });

      const { fields } = await Analyze360FieldResolver.resolveAllFields('TEST', null); // no masterRow/market cap
      expect(fields.freeCashFlow.value).toBe(175.0);
      expect(fields.freeCashFlow.status).toBe('AVAILABLE');

      expect(fields.fcfYield.value).toBeNull();
      expect(fields.fcfYield.status).toBe('MISSING');
      expect(fields.fcfYield.missingReason).toBe('NO_MARKET_CAP_FOR_FCF_YIELD');
    });

    it('does not accept total investing cash flow as capex', async () => {
      (dbModule.dbAll as any).mockImplementation((_db: any, query: string) => {
        if (query.includes('FROM company_facts')) {
          return Promise.resolve([
            { factId: 'cfo_1', metric: 'cfo', periodType: 'ANNUAL', periodEnd: '2024-03-31', value: 250.0, provider: 'TEST_P' },
            { factId: 'cfi_1', metric: 'cash_flow_investing', periodType: 'ANNUAL', periodEnd: '2024-03-31', value: -120.0, provider: 'TEST_P' },
            { factId: 'cfi_2', metric: 'total_investing_activities', periodType: 'ANNUAL', periodEnd: '2024-03-31', value: -120.0, provider: 'TEST_P' }
          ]);
        }
        return Promise.resolve([]);
      });

      const { fields } = await Analyze360FieldResolver.resolveAllFields('TEST', { market_cap_cr: 3500 });
      expect(fields.freeCashFlow.value).toBeNull();
      expect(fields.freeCashFlow.status).toBe('MISSING');
      expect(fields.freeCashFlow.missingReason).toBe('NO_MATCHED_CFO_AND_CAPEX');
    });

    it('surfaces freeCashFlow and fcfYield under fundamental.cashFlow in Analyze360Service and records them in missingDataChecklist', async () => {
      (dbModule.dbAll as any).mockResolvedValue([]);
      (dbModule.dbGet as any).mockResolvedValue(null);

      const mockFere = fere.readFereEvidence as any;
      mockFere.mockResolvedValue({ status: 'AVAILABLE', verifiedFactCount: 0, verifiedMetricCount: 0, documents: [], missingFields: [] });

      const mockEnrichment = vi.spyOn(SevenStrategiesCandidateEnrichmentService.getInstance(), 'bulkEnrich');
      mockEnrichment.mockResolvedValue(new Map([
        ['TEST', { symbol: 'TEST', latestClose: 100, latestOhlcvDate: '2024-03-31', technicalFreshnessStatus: 'VALID', ohlcvStatus: 'AVAILABLE' } as any]
      ]));

      const service = Analyze360Service.getInstance();
      const result = await service.getAnalyze360View('TEST', 'cand-1', ['sig-1'], '2026-10-01', ['S1a']);

      expect(result.fundamental.cashFlow.freeCashFlow).toBeDefined();
      expect(result.fundamental.cashFlow.freeCashFlow.status).toBe('MISSING');
      expect(result.fundamental.cashFlow.fcfYield).toBeDefined();
      expect(result.fundamental.cashFlow.fcfYield.status).toBe('MISSING');

      // Verify inclusion in missingDataChecklist
      const fcfMissing = result.missingDataChecklist.find(m => m.field === 'cashFlow.freeCashFlow');
      const fcfYieldMissing = result.missingDataChecklist.find(m => m.field === 'cashFlow.fcfYield');
      expect(fcfMissing).toBeDefined();
      expect(fcfMissing?.reason).toBe('NO_MATCHED_CFO_AND_CAPEX');
      expect(fcfYieldMissing).toBeDefined();
    });
  });
});
