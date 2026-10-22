import { describe, it, expect } from 'vitest';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';
import { AlphaRiskReplayEngine } from '../../../src/server/services/research/AlphaRiskReplayEngine.js';
import { MetricConventionRegistry } from '../../../src/server/services/research/MetricConventionRegistry.js';

describe('V672 Track A — Baseline & R0 Reconciliation Tests', () => {
  const reproducer = new V65BaselineReproducer();
  const baseline = reproducer.loadCanonicalBaseline();
  const replayEngine = new AlphaRiskReplayEngine();

  it('reconciles R0 trade count, max drawdown, CAGR, and Sharpe to canonical benchmarks', () => {
    const r0 = replayEngine.replay(
      {
        configurationId: 'R0',
        baselineRunId: baseline.replayRunId,
        inputSnapshotHash: 'h_base',
        strategyIds: [],
        alphaEngineIds: [],
        riskControlIds: [],
        sizingModelId: 'NAIVE',
        costModelId: 'STD',
        slippageModelId: '5BPS',
        startDate: '2020-02-27',
        endDate: '2026-09-15'
      },
      baseline.trades,
      baseline.equity
    );

    expect(r0.tradeCount).toBe(4506);
    expect(r0.maxDrawdownPct).toBeCloseTo(-78.35, 1);
    expect(r0.cagrPct).toBeCloseTo(-17.16, 1);
    expect(r0.sharpe).toBeCloseTo(-1.04, 1);
  });

  it('formally encodes convention differences between canonical v6.5 and reported trade-weighted metrics', () => {
    const registry = MetricConventionRegistry.getInstance();
    const report = registry.getReconciliationReport();

    expect(report.cagrReconciliation.canonicalV65.value).toBe(-17.16);
    expect(report.cagrReconciliation.r0Reported.value).toBe(-8.4);
    expect(report.cagrReconciliation.status).toBe('RECONCILED_BY_CONVENTION_SPECIFICATION');

    expect(report.sharpeReconciliation.canonicalV65.value).toBe(-1.04);
    expect(report.sharpeReconciliation.r0Reported.value).toBe(-0.42);
    expect(report.sharpeReconciliation.status).toBe('RECONCILED_BY_CONVENTION_SPECIFICATION');
  });
});
