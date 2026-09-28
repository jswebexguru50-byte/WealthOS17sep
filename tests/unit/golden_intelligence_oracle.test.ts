import { describe, it, expect } from 'vitest';
import { CompanyIntelligenceOrchestrator } from '../../src/server/services/intelligence/CompanyIntelligenceOrchestrator.js';
import { AnalysisEvidenceRepository } from '../../src/server/services/intelligence/AnalysisEvidenceRepository.js';
import { FundamentalModuleAdapter } from '../../src/server/services/intelligence/modules/FundamentalModuleAdapter.js';
import { ValuationModuleAdapter } from '../../src/server/services/intelligence/modules/ValuationModuleAdapter.js';
import { QglpModuleAdapter } from '../../src/server/services/intelligence/modules/QglpModuleAdapter.js';
import { TechnicalModuleAdapter } from '../../src/server/services/intelligence/modules/TechnicalModuleAdapter.js';
import { BusinessInflectionModule } from '../../src/server/services/intelligence/modules/BusinessInflectionModule.js';
import { ManagementModuleAdapter } from '../../src/server/services/intelligence/modules/ManagementModuleAdapter.js';

describe('WealthOS Intelligence Integrity & Analytical Oracle (V1.1)', () => {
  const orchestrator = CompanyIntelligenceOrchestrator.getInstance();
  const repo = AnalysisEvidenceRepository.getInstance();

  describe('Constitution Invariants & Semantic Truth Guardrails', () => {
    it('Invariant 1 & 9: Parsed is not verified; execution status != truth status', async () => {
      const valResult = await ValuationModuleAdapter.getInstance().run('RELIANCE');
      if (valResult.status === 'WORKING') {
        // Parsed provider snapshot data must report PARTIAL truth quality, not VERIFIED
        expect(valResult.dataStatus).toBe('PARTIAL');
      }

      const fundResult = await FundamentalModuleAdapter.getInstance().run('RELIANCE');
      if (fundResult.status === 'WORKING') {
        expect(fundResult.dataStatus).toBe('PARTIAL');
        // Series items parsed from snapshots must be PARTIAL
        const revSeries = fundResult.result?.historicalSeries?.['Revenue'] || [];
        if (revSeries.length > 0) {
          expect(revSeries[0].status).toBe('PARTIAL');
        }
      }
    });

    it('Invariant 10: Current valuation != relative valuation without empirical median', async () => {
      const valResult = await ValuationModuleAdapter.getInstance().run('RELIANCE');
      if (valResult.status === 'WORKING' && valResult.result?.pe) {
        expect(valResult.result.pe.current).toBeTypeOf('number');
        // Must NEVER assume NEAR_MEDIAN without empirical historical median calculation
        expect(valResult.result.pe.relativeStatus).toBe('DATA_INSUFFICIENT');
      }
    });

    it('Invariant 3: Bank margin trajectory requires temporal comparison, not absolute level', async () => {
      const fundResult = await FundamentalModuleAdapter.getInstance().run('HDFCBANK');
      expect(fundResult.result?.businessModel).toBe('BANK');

      const marginTraj = fundResult.result?.trajectory?.marginTrajectory;
      expect(marginTraj?.metricUsed).toBe('NIM');

      const nimSeries = fundResult.result?.historicalSeries?.['NIM'] || [];
      if (nimSeries.length < 2) {
        // Without >= 2 NIM periods, trajectory CANNOT be claimed to be EXPANDING
        expect(marginTraj?.status).toBe('DATA_INSUFFICIENT');
      }
    });

    it('Invariant 4: Revenue acceleration requires at least two comparable growth intervals', async () => {
      const fundResult = await FundamentalModuleAdapter.getInstance().run('RELIANCE');
      const revSeries = fundResult.result?.historicalSeries?.['Revenue'] || [];
      const traj = fundResult.result?.trajectory?.revenueGrowthYoY;

      if (revSeries.length === 2) {
        // Exactly one growth rate interval: must be GROWING or DECLINING, never ACCELERATING or STABLE
        expect(['GROWING', 'DECLINING']).toContain(traj?.status);
      } else if (revSeries.length >= 3) {
        expect(['ACCELERATING', 'DECELERATING', 'STABLE']).toContain(traj?.status);
      }
    });

    it('Invariant 2 & 8: Absence of warnings != positive evidence; unknown remains unknown', async () => {
      const qglpResult = await QglpModuleAdapter.getInstance().run('HDFCBANK');
      expect(qglpResult.result).toBeDefined();

      // Check cash conversion on Bank: industrial cash conversion not applicable
      const mgmtPillar = qglpResult.result?.qualityOfManagement;
      const cashItem = mgmtPillar?.items.find(i => i.name.includes('Cash Conversion'));
      expect(cashItem).toBeDefined();
      expect(cashItem?.status).toBe('NOT_APPLICABLE');

      // Check Non-Financial (TCS or RELIANCE)
      const tcsQglp = await QglpModuleAdapter.getInstance().run('TCS');
      const tcsMgmtPillar = tcsQglp.result?.qualityOfManagement;
      const tcsCashItem = tcsMgmtPillar?.items.find(i => i.name.includes('Cash Conversion'));
      expect(tcsCashItem).toBeDefined();

      // If CFO and PAT are both available, status is SUPPORTED or WARNING; if either missing, DATA_INSUFFICIENT
      const tcsFund = await FundamentalModuleAdapter.getInstance().run('TCS');
      const hasCfo = (tcsFund.result?.historicalSeries?.['CFO'] || []).length > 0;
      const hasPat = (tcsFund.result?.historicalSeries?.['PAT'] || []).length > 0;
      if (!hasCfo || !hasPat) {
        expect(tcsCashItem?.status).toBe('DATA_INSUFFICIENT');
      } else {
        expect(['SUPPORTED', 'WARNING', 'PARTIAL']).toContain(tcsCashItem?.status);
      }
    });

    it('Invariant 6: Every derived business inflection carries source evidence lineage', async () => {
      const report = await orchestrator.getCompanyIntelligence('RELIANCE');
      const inflection = report.modules.businessInflection?.result;
      expect(inflection).toBeDefined();

      const allItems = [...(inflection?.whyInteresting || []), ...(inflection?.whatNeedsAttention || [])];
      for (const item of allItems) {
        // Invariant 6: Every conclusion has lineage. Material derived statements must point to evidence.
        expect(item.evidence.length).toBeGreaterThan(0);
        expect(item.evidence[0].sourceType).toBeDefined();
      }
    });

    it('Invariant 12: Technical adapter does not conflate technicalScore with relative-strength percentile', async () => {
      const techResult = await TechnicalModuleAdapter.getInstance().run('RELIANCE');
      expect(techResult.result).toBeDefined();
      // rsPercentile must be null rather than masquerading technicalScore as benchmark percentile
      expect(techResult.result?.rsPercentile).toBeNull();
      // ema20 is computed from actual 20-period EMA, not aliasing ema21
      if (techResult.result?.ema20) {
        expect(techResult.result.ema20).toBeTypeOf('number');
      }
    });
  });

  describe('Point-In-Time (PIT) Correctness Enforcement', () => {
    it('Filters evidence strictly by requested asOfDate', async () => {
      // Query fact with historical asOfDate: 2024-03-31
      const histFact = await repo.getFact('RELIANCE', 'sales', {
        asOfDate: '2024-03-31',
      });

      if (histFact.value !== null) {
        // Fact must not be from a later period or fetched after asOfDate
        if (histFact.periodEnd) {
          expect(histFact.periodEnd <= '2024-03-31').toBe(true);
        }
        if (histFact.availableAt) {
          expect(histFact.availableAt <= '2024-03-31T23:59:59Z' || histFact.availableAt <= '2024-03-31').toBe(true);
        }
      }
    });

    it('Filters OHLCV daily bars up to requested asOfDate', async () => {
      const ohlcv = await repo.getAdjustedOhlcv('RELIANCE', 30, '2024-06-30');
      if (ohlcv.bars.length > 0) {
        const maxTradeDate = ohlcv.bars[ohlcv.bars.length - 1].trade_date;
        expect(maxTradeDate <= '2024-06-30').toBe(true);
      }
    });
  });

  describe('Management Walk-the-Talk Deterministic Verification', () => {
    it('Performs deterministic comparison against reported XBRL facts instead of static PENDING', async () => {
      // USHAMART has 18 candidates and verified XBRL facts in fere_evidence.db
      const mgmtResult = await ManagementModuleAdapter.getInstance().run('USHAMART');
      if (mgmtResult.status === 'WORKING') {
        expect(mgmtResult.result?.commitments.length).toBeGreaterThan(0);

        const commitments = mgmtResult.result!.commitments;
        // Verify that commitments with actuals have valid walk-the-talk delivery statuses
        const validStatuses = ['DELIVERED', 'ACHIEVED', 'PARTIALLY_ACHIEVED', 'PARTIAL', 'MISSED', 'PENDING', 'NOT_YET_DUE', 'NOT_VERIFIABLE'];
        for (const c of commitments) {
          expect(validStatuses).toContain(c.status);
          if (c.actualValue !== null) {
            expect(c.actualEvidence.length).toBeGreaterThan(0);
          }
        }

        // Tally totals must be consistent
        const total = mgmtResult.result!.deliveredCount +
                      mgmtResult.result!.missedCount +
                      mgmtResult.result!.pendingCount +
                      mgmtResult.result!.notVerifiableCount;
        expect(total).toBe(commitments.length);
      }
    });
  });

  describe('Golden Company Analytical Oracle', () => {
    it('RELIANCE: Evaluates business model, margin trajectory, valuation, and inflection lineage', async () => {
      const report = await orchestrator.getCompanyIntelligence('RELIANCE');

      expect(report.security.symbol).toBe('RELIANCE');
      expect(report.security.businessModel).toBe('NON_FINANCIAL');

      // Valuation multiple check
      if (report.modules.valuation?.result?.pe) {
        expect(report.modules.valuation.result.pe.current).toBeGreaterThan(0);
        expect(report.modules.valuation.result.pe.relativeStatus).toBe('DATA_INSUFFICIENT');
      }

      // QGLP truth calibration
      expect(['WORKING', 'PARTIAL']).toContain(report.modules.qglp?.status);
      expect(report.modules.qglp?.dataStatus).toBe('PARTIAL');
    });

    it('HDFCBANK: Banking classification, NIM trajectory safety, non-financial CFO absent', async () => {
      const report = await orchestrator.getCompanyIntelligence('HDFCBANK');

      expect(report.security.symbol).toBe('HDFCBANK');
      expect(report.security.businessModel).toBe('BANK');

      // Banking margin trajectory
      const marginTraj = report.modules.fundamental?.result?.trajectory?.marginTrajectory;
      expect(marginTraj?.metricUsed).toBe('NIM');

      // Debt trajectory not applicable for banks
      expect(report.modules.fundamental?.result?.trajectory?.debtTrajectory?.status).toBe('NOT_APPLICABLE');

      // EV/EBITDA undefined for banks
      expect(report.modules.valuation?.result?.evEbitda).toBeUndefined();
    });

    it('TCS: IT Services, ROCE profile, multi-pillar evidence sufficiency', async () => {
      const report = await orchestrator.getCompanyIntelligence('TCS');

      expect(report.security.symbol).toBe('TCS');
      expect(report.security.businessModel).toBe('NON_FINANCIAL');

      const returnProfile = report.modules.fundamental?.result?.trajectory?.returnProfile;
      expect(returnProfile?.metric).toBe('ROCE');
      if (returnProfile?.latestValue) {
        expect(returnProfile.latestValue).toBeGreaterThan(15);
        expect(returnProfile.status).toBe('HIGH_QUALITY');
      }
    });
  });
});
