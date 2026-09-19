import { describe, it, expect } from 'vitest';
import { R4HypothesisRegistry, R4Hypothesis, R4Experiment } from '../../../src/server/services/research/r4/R4HypothesisRegistry';
import { R4BaselineDiagnosticEngine } from '../../../src/server/services/research/r4/R4BaselineDiagnosticEngine';
import { R4ResearchContaminationDetector } from '../../../src/server/services/research/r4/R4ResearchContaminationDetector';

describe('R4 Research Unit Tests', () => {
  it('enforces immutability lock on R4HypothesisRegistry', () => {
    const registry = new R4HypothesisRegistry();
    const hyp: R4Hypothesis = {
      hypothesisId: 'TEST-01',
      hypothesisFamilyId: 'TEST-FAM',
      title: 'Test Hypothesis',
      description: 'Test Desc',
      rationale: 'Test Rationale',
      candidateType: 'FILTER',
      existingStrategyIds: ['S1'],
      marketUniverseId: 'NIFTY500',
      timeframe: ['DAILY'],
      parameters: { param1: 10 },
      parameterGrid: { param1: [5, 10, 15] },
      expectedMechanism: 'Test',
      falsificationCriteria: ['Delta <= 0'],
      primaryMetric: 'NET_PNL',
      secondaryMetrics: ['SHARPE'],
      predeclaredAt: '2026-09-18T14:30:00.000Z',
      configurationHash: '',
      dataSnapshotHash: 'dummy',
      status: 'PREDECLARED'
    };
    registry.registerHypothesis(hyp);
    expect(registry.getAllHypotheses().length).toBe(1);

    registry.lockRegistry();
    expect(() => registry.registerHypothesis({ ...hyp, hypothesisId: 'TEST-02' })).toThrowError(/STOP_THE_LINE/);
  });

  it('correctly calculates baseline failure modes in R4BaselineDiagnosticEngine', () => {
    const dummyTrades = [
      { tradeId: 'T1', strategyId: 'S1', entryPrice: 100, actualEntryPrice: 100, exitPrice: 105, actualExitPrice: 105, quantity: 10, costs: 20, totalCosts: 20, netR: 0.5 },
      { tradeId: 'T2', strategyId: 'S2', entryPrice: 100, actualEntryPrice: 100, exitPrice: 95, actualExitPrice: 95, quantity: 10, costs: 20, totalCosts: 20, netR: -0.5 }
    ];
    const diag = R4BaselineDiagnosticEngine.runDiagnostic(dummyTrades);
    expect(diag.totalTrades).toBe(2);
    expect(diag.totalGrossPnL).toBe(0); // (50 - 50)
    expect(diag.totalCosts).toBe(40);
    expect(diag.totalNetPnL).toBe(-40);
    expect(diag.isBaselineEconomicallyViable).toBe(false);
  });

  it('detects tampering and defends against production lock bypass', () => {
    const res = R4ResearchContaminationDetector.runAdversarialAudit();
    expect(res.allProtected).toBe(true);
    expect(res.attacksTested['PRODUCTION_LOCK_BYPASS'].status).toBe('PROTECTED_PASS');
  });
});
