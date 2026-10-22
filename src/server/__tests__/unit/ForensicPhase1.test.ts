import { describe, it, expect } from '@jest/globals';
import { ForensicTestSuiteRunner } from '../../services/ForensicTestSuiteRunner.js';
import { ForensicScoringService, RawFundamentalsInput } from '../../services/ForensicScoringService.js';
import { CacheService } from '../../services/CacheService.js';
import { LLMOrchestrationService } from '../../services/LLMOrchestrationService.js';
import { AuditorTransitionType } from '../../../types/forensic.js';

describe('Unit: Forensic Intelligence Layer v2.1 Test Suite', () => {
  it('executes all 11 forensic verification suites with zero failures', async () => {
    const summary = await ForensicTestSuiteRunner.runAllTests();
    expect(summary.total).toBe(11);
    expect(summary.failed).toBe(0);
    expect(summary.passed).toBe(11);
  });

  describe('Deterministic Financial Forensics (Static API)', () => {
    const mockFundamentals: RawFundamentalsInput = {
      sales_t: 1000,
      sales_prev: 850,
      cogs_t: 600,
      cogs_prev: 530,
      netIncome_t: 150,
      netIncome_prev: 120,
      cfo_t: 180,
      cfo_prev: 140,
      currentAssets_t: 500,
      currentAssets_prev: 420,
      currentLiab_t: 200,
      currentLiab_prev: 180,
      totalAssets_t: 1200,
      totalAssets_prev: 1050,
      longTermDebt_t: 50,
      longTermDebt_prev: 60,
      retainedEarnings_t: 600,
      ebit_t: 220,
      depreciation_t: 40,
      depreciation_prev: 35,
      receivables_t: 100,
      receivables_prev: 90,
      ppe_t: 400,
      ppe_prev: 380,
      sga_t: 120,
      sga_prev: 110,
      marketValueOfEquity_t: 3000,
      sharesOutstanding_t: 100,
      sharesOutstanding_prev: 100,
      totalLiabilities_t: 250,
      securities_t: 0,
      securities_prev: 0,
      workingCapital_t: 300,
      assetTurnover_t: 0.85,
      peerMedianAssetTurnover: 0.80,
      workingCapitalDaysTrend: -5,
      roce: 24,
      wacc: 12,
      promoterPledgePct: 0,
      promoterPledgePctPrev: 0,
      auditorTransition: AuditorTransitionType.REGULAR_ROTATION,
      auditorTenureYears: 4,
    };

    it('FSS-01: calculates Beneish M-Score accurately', () => {
      const beneish = ForensicScoringService.calculateBeneishMScore(mockFundamentals);
      expect(beneish.score).toBeLessThan(-1.78);
      expect(beneish.isManipulatorRisk).toBe(false);
    });

    it('FSS-02: categorizes Altman Z-Score in safe zone for solvent firm', () => {
      const altman = ForensicScoringService.calculateAltmanZScore(mockFundamentals);
      expect(altman.score).toBeGreaterThan(2.99);
      expect(altman.zone).toBe('safe');
    });

    it('FSS-03: scores Piotroski F-Score for high-quality firm', () => {
      const piotroski = ForensicScoringService.calculatePiotroskiFScore(mockFundamentals);
      expect(piotroski.score).toBeGreaterThanOrEqual(7);
    });

    it('FSS-04: evaluates trade viability with 6-rule rubric', () => {
      const { rating, basis } = ForensicScoringService.evaluateTradeViability(
        100,
        150,
        90,
        85,
        []
      );
      expect(['STRONG_BUY', 'ACCUMULATE']).toContain(rating);
      expect(basis.rewardRiskRatio).toBeGreaterThanOrEqual(2.5);
    });
  });

  describe('Cache Lineage & Content Keying', () => {
    it('CS-01: generates deterministic sha256 cache keys', () => {
      const key1 = CacheService.generateKey('HAL', 'FY25', 'https://bse.com/doc1');
      const key2 = CacheService.generateKey('HAL', 'FY25', 'https://bse.com/doc1');
      const key3 = CacheService.generateKey('BEL', 'FY25', 'https://bse.com/doc1');
      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });
  });

  describe('LLM Orchestration Tiers & Cost Budget', () => {
    it('LLM-01: validates flash model cost ceiling', () => {
      const cost100 = LLMOrchestrationService.estimateCost('flash', 2000 * 100, 300 * 100);
      expect(cost100).toBeLessThan(0.05);
    });
  });
});
