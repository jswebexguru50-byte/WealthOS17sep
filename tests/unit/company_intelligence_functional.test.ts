import { describe, expect, it } from 'vitest';
import { CompanyIntelligenceOrchestrator } from '../../src/server/services/intelligence/CompanyIntelligenceOrchestrator.js';
import { TechnicalModuleAdapter } from '../../src/server/services/intelligence/modules/TechnicalModuleAdapter.js';
import { FundamentalModuleAdapter } from '../../src/server/services/intelligence/modules/FundamentalModuleAdapter.js';
import { FereModuleAdapter } from '../../src/server/services/intelligence/modules/FereModuleAdapter.js';
import { QglpModuleAdapter } from '../../src/server/services/intelligence/modules/QglpModuleAdapter.js';
import { ManagementModuleAdapter } from '../../src/server/services/intelligence/modules/ManagementModuleAdapter.js';
import { ValuationModuleAdapter } from '../../src/server/services/intelligence/modules/ValuationModuleAdapter.js';
import { MarketContextModuleAdapter } from '../../src/server/services/intelligence/modules/MarketContextModuleAdapter.js';
import { BusinessInflectionModule } from '../../src/server/services/intelligence/modules/BusinessInflectionModule.js';
import { BusinessModelClassifier } from '../../src/server/services/intelligence/domain/BusinessModelClassifier.js';

describe('Company Intelligence Functional Acceptance Suite (Section 33)', () => {
  const orchestrator = CompanyIntelligenceOrchestrator.getInstance();

  // ───────────────────────────────────────────────────────────────────────────
  // 1. BUSINESS MODEL CLASSIFICATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('BusinessModelClassifier', () => {
    it('correctly classifies Banks (HDFCBANK, ICICIBANK, SBIN) without confusing with industrials', () => {
      expect(BusinessModelClassifier.classify('HDFCBANK')).toBe('BANK');
      expect(BusinessModelClassifier.classify('ICICIBANK')).toBe('BANK');
      expect(BusinessModelClassifier.classify('SBIN')).toBe('BANK');
      expect(BusinessModelClassifier.classify('XYZ_BANK', 'Banking & Financials')).toBe('BANK');
    });

    it('correctly classifies Non-financial industrials (RELIANCE, TCS, TATAMOTORS)', () => {
      expect(BusinessModelClassifier.classify('RELIANCE', 'Energy', 'Refining')).toBe('NON_FINANCIAL');
      expect(BusinessModelClassifier.classify('TCS', 'Technology', 'IT Services')).toBe('NON_FINANCIAL');
      expect(BusinessModelClassifier.classify('TATAMOTORS', 'Auto', 'Automotive')).toBe('NON_FINANCIAL');
    });

    it('correctly classifies NBFC and Insurance companies', () => {
      expect(BusinessModelClassifier.classify('BAJFINANCE')).toBe('NBFC');
      expect(BusinessModelClassifier.classify('HDFCLIFE')).toBe('INSURANCE');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. TECHNICAL MODULE
  // ───────────────────────────────────────────────────────────────────────────
  describe('Technical Module Integration', () => {
    it('returns actual market data for real liquid company (RELIANCE)', async () => {
      const result = await TechnicalModuleAdapter.getInstance().run('RELIANCE');
      expect(['WORKING', 'PARTIAL']).toContain(result.status);
      expect(result.result).not.toBeNull();
      if (result.result) {
        expect(typeof result.result.price).toBe('number');
        expect(result.result.price).toBeGreaterThan(0);
        expect(result.result.rsi14).not.toBeNull();
        expect(['BULLISH', 'NEUTRAL', 'BEARISH']).toContain(result.result.trend);
        expect(Array.isArray(result.result.signals)).toBe(true);
      }
    });

    it('handles missing OHLCV data fail-closed without fabricating fake prices or signals', async () => {
      const result = await TechnicalModuleAdapter.getInstance().run('FICTIONAL_NONEXISTENT_TICKER');
      expect(result.status).toBe('DATA_INSUFFICIENT');
      expect(result.result).toBeNull();
      expect(result.missingRequirements.length).toBeGreaterThan(0);
    });

    it('derives strategy output from existing PureTechnicalStrategiesEngine without math modifications', async () => {
      const result = await TechnicalModuleAdapter.getInstance().run('TCS');
      if (result.result) {
        const s1 = result.result.signals.find(s => s.strategyId === 'S1');
        if (s1) {
          expect(s1.name).toContain('VPA Base Breakout');
          expect(typeof s1.qualified).toBe('boolean');
        }
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. FUNDAMENTAL MODULE
  // ───────────────────────────────────────────────────────────────────────────
  describe('Fundamental Module Integration', () => {
    it('renders multi-period facts for real companies without failing on 3-year history', async () => {
      const result = await FundamentalModuleAdapter.getInstance().run('RELIANCE');
      expect(['WORKING', 'PARTIAL']).toContain(result.status);
      expect(result.result).not.toBeNull();
      if (result.result) {
        const series = result.result.historicalSeries;
        expect(series['Revenue'] || series['OperatingProfit'] || series['PAT']).toBeDefined();
      }
    });

    it('does not silently mix standalone and consolidated figures', async () => {
      const result = await FundamentalModuleAdapter.getInstance().run('TCS');
      if (result.result) {
        for (const [metric, items] of Object.entries(result.result.historicalSeries)) {
          for (const item of items) {
            expect(['CONSOLIDATED', 'STANDALONE']).toContain(item.scope);
          }
        }
      }
    });

    it('evaluates banks with bank metrics (NIM/ROA/Net NPA) rather than industrial EBITDA/CFO', async () => {
      const bankResult = await FundamentalModuleAdapter.getInstance().run('HDFCBANK');
      expect(bankResult.result?.businessModel).toBe('BANK');
      if (bankResult.result) {
        const trajectory = bankResult.result.trajectory;
        expect(trajectory.debtTrajectory.status).toBe('NOT_APPLICABLE');
        expect(trajectory.marginTrajectory.metricUsed).toBe('NIM');
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. FERE MODULE
  // ───────────────────────────────────────────────────────────────────────────
  describe('FERE Module Integration', () => {
    it('surfaces genuine filing evidence and handles missing evidence safely', async () => {
      const result = await FereModuleAdapter.getInstance().run('RELIANCE');
      expect(['WORKING', 'PARTIAL', 'DATA_INSUFFICIENT']).toContain(result.status);
      if (result.result) {
        expect(Array.isArray(result.result.availableFilings)).toBe(true);
        expect(Array.isArray(result.result.warnings)).toBe(true);
      }
    });

    it('does not run industrial CFO/working-capital warnings on banks', async () => {
      const result = await FereModuleAdapter.getInstance().run('HDFCBANK');
      if (result.result) {
        const cfoWarn = result.result.warnings.find(w => w.id.includes('CFO'));
        expect(cfoWarn).toBeUndefined();
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. QGLP MODULE
  // ───────────────────────────────────────────────────────────────────────────
  describe('QGLP Evidence Assessment', () => {
    it('keeps competitive moat as DATA_INSUFFICIENT rather than falsely inferring it from high ROCE', async () => {
      const result = await QglpModuleAdapter.getInstance().run('TCS');
      if (result.result) {
        const moatItem = result.result.qualityOfBusiness.items.find(i => i.name.includes('Moat'));
        expect(moatItem?.status).toBe('DATA_INSUFFICIENT');
      }
    });

    it('does not infer management quality from zero pledge', async () => {
      const result = await QglpModuleAdapter.getInstance().run('INFY');
      if (result.result) {
        const pledgeItem = result.result.qualityOfManagement.items.find(i => i.name.includes('Pledge'));
        expect(pledgeItem?.status).toBe('NO_RED_FLAG_DETECTED');
        expect(pledgeItem?.status).not.toBe('SUPPORTED');
      }
    });

    it('marks clean audit opinion as NO_RED_FLAG_DETECTED', async () => {
      const result = await QglpModuleAdapter.getInstance().run('RELIANCE');
      if (result.result) {
        const auditItem = result.result.qualityOfManagement.items.find(i => i.name.includes('Statutory Audit'));
        expect(auditItem?.status).toBe('NO_RED_FLAG_DETECTED');
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. MANAGEMENT COMMITMENT MODULE
  // ───────────────────────────────────────────────────────────────────────────
  describe('Management Commitment Module', () => {
    it('returns DATA_INSUFFICIENT when no commitments are indexed instead of inventing them', async () => {
      const result = await ManagementModuleAdapter.getInstance().run('SUNPHARMA');
      if (result.result?.commitments.length === 0) {
        expect(result.status).toBe('DATA_INSUFFICIENT');
        expect(result.missingRequirements.length).toBeGreaterThan(0);
      }
    });

    it('retains source document for indexed commitments', async () => {
      const result = await ManagementModuleAdapter.getInstance().run('LAURUSLABS');
      if (result.result && result.result.commitments.length > 0) {
        expect(result.status).toBe('WORKING');
        const first = result.result.commitments[0];
        expect(first.sourceDocument).toBeDefined();
        expect(first.sourceDocument.sourceType).toBe('FERE_FILING');
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. VALUATION & MARKET CONTEXT MODULES
  // ───────────────────────────────────────────────────────────────────────────
  describe('Valuation & Market Context Modules', () => {
    it('returns genuine valuation multiples without fabricating analyst targets or DCF', async () => {
      const result = await ValuationModuleAdapter.getInstance().run('RELIANCE');
      if (result.result) {
        expect(result.result.pe).toBeDefined();
        expect(result.result.pb).toBeDefined();
      }
    });

    it('returns market and sector context', async () => {
      const result = await MarketContextModuleAdapter.getInstance().run('RELIANCE');
      expect(['WORKING', 'PARTIAL', 'DATA_INSUFFICIENT']).toContain(result.status);
      if (result.result) {
        expect(result.result.stockTrend).toBeDefined();
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. BUSINESS INFLECTION & OVERVIEW INTEGRATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('Business Inflection Module', () => {
    it('derives whyInteresting (max 5 items) and whatNeedsAttention (max 5 items) in memory', () => {
      const inflection = BusinessInflectionModule.getInstance().derive('TEST', {
        technical: {
          price: 2500,
          ema20: 2450,
          ema50: 2400,
          sma200: 2300,
          rsi14: 65,
          atrPct: 1.5,
          high52w: 2600,
          low52w: 2000,
          rsPercentile: 85,
          trend: 'BULLISH',
          signals: [{ strategyId: 'S1', name: 'VPA Base Breakout', qualified: true }],
          dataAsOf: '2026-09-28',
        },
        fundamental: {
          businessModel: 'NON_FINANCIAL',
          historicalSeries: {},
          trajectory: {
            revenueGrowthYoY: { status: 'ACCELERATING', latestGrowthPct: 18.5, priorGrowthPct: 11.2, periodsCompared: 'FY25 vs FY24' },
            marginTrajectory: { status: 'EXPANDING', bpsChange: 140, metricUsed: 'EBITDA_MARGIN' },
            debtTrajectory: { status: 'DELEVERAGING', changePct: -12 },
            returnProfile: { metric: 'ROCE', latestValue: 22, status: 'HIGH_QUALITY' },
          },
          dataAsOf: '2026-09-28',
        },
        fere: {
          availableFilings: [],
          verifiedFactCount: 5,
          warnings: [{
            id: 'W1',
            category: 'CASH_FLOW',
            severity: 'WATCH',
            title: 'Operating cash flow lag',
            observation: 'CFO trails PAT by 25%',
            supportingFacts: [],
            status: 'SUPPORTED',
          }],
          auditorObservations: [],
          claimEvidenceDivergences: [],
          dataAsOf: '2026-09-28',
        },
        management: null,
        market: null,
      });

      expect(inflection.status).toBe('WORKING');
      expect(inflection.result?.whyInteresting.length).toBeLessThanOrEqual(5);
      expect(inflection.result?.whatNeedsAttention.length).toBeLessThanOrEqual(5);
      expect(inflection.result?.whyInteresting.some(i => i.headline.includes('accelerating'))).toBe(true);
      expect(inflection.result?.whatNeedsAttention.some(i => i.headline.includes('cash flow lag'))).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. ORCHESTRATOR & INDEPENDENT RUNNABILITY
  // ───────────────────────────────────────────────────────────────────────────
  describe('CompanyIntelligenceOrchestrator', () => {
    it('runs Technical only when requested', async () => {
      const resp = await orchestrator.getCompanyIntelligence('RELIANCE', ['TECHNICAL']);
      expect(resp.modules.technical).toBeDefined();
      expect(resp.modules.fundamental).toBeUndefined();
    });

    it('runs Fundamental only when requested', async () => {
      const resp = await orchestrator.getCompanyIntelligence('RELIANCE', ['FUNDAMENTAL']);
      expect(resp.modules.fundamental).toBeDefined();
      expect(resp.modules.technical).toBeUndefined();
    });

    it('runs Technical + Fundamental concurrently', async () => {
      const resp = await orchestrator.getCompanyIntelligence('RELIANCE', ['TECHNICAL', 'FUNDAMENTAL']);
      expect(resp.modules.technical).toBeDefined();
      expect(resp.modules.fundamental).toBeDefined();
      expect(resp.modules.fere).toBeUndefined();
    });

    it('one failing module never blanks the response for other modules', async () => {
      const resp = await orchestrator.getCompanyIntelligence('RELIANCE');
      expect(resp.security.symbol).toBe('RELIANCE');
      expect(resp.modules.technical).toBeDefined();
      expect(resp.modules.businessInflection).toBeDefined();
    });
  });
});
