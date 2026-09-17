import { describe, it, expect } from '@jest/globals';
import { ForensicTestSuiteRunner } from '../../services/ForensicTestSuiteRunner.js';
import { ForensicScoringService, RawFundamentalsInput } from '../../services/ForensicScoringService.js';
import { CacheService } from '../../services/CacheService.js';
import { LLMOrchestrationService } from '../../services/LLMOrchestrationService.js';

describe('Unit: Forensic Intelligence Layer v2.1 Test Suite', () => {
  it('executes all 11 forensic verification suites with zero failures', async () => {
    const summary = await ForensicTestSuiteRunner.runAllTests();
    expect(summary.total).toBe(11);
    expect(summary.failed).toBe(0);
    expect(summary.passed).toBe(11);
  });

  describe('Deterministic Financial Forensics (Static API)', () => {
    const mockFundamentals: RawFundamentalsInput = {
      sales: 1000,
      salesPrev: 850,
      cogs: 600,
      cogsPrev: 530,
      netIncome: 150,
      netIncomePrev: 120,
      cfo: 180,
      cfoPrev: 140,
      currentAssets: 500,
      currentAssetsPrev: 420,
      currentLiabilities: 200,
      currentLiabilitiesPrev: 180,
      totalAssets: 1200,
      totalAssetsPrev: 1050,
      longTermDebt: 50,
      longTermDebtPrev: 60,
      totalDebt: 80,
      totalDebtPrev: 90,
      retainedEarnings: 600,
      ebit: 220,
      depreciation: 40,
      depreciationPrev: 35,
      receivables: 100,
      receivablesPrev: 90,
      ppe: 400,
      ppePrev: 380,
      sgaExpenses: 120,
      sgaExpensesPrev: 110,
      marketCap: 3000,
      sharesOutstanding: 100,
      sharesOutstandingPrev: 100,
      rocePct: 24,
      netDebtEquityRatio: 0.1,
      workingCapitalDays: 45,
      assetTurnoverRatio: 0.85,
      promoterPledgePct: 0,
      promoterPledgePctPrev: 0,
      auditorTransition: 'REGULAR_ROTATION',
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
