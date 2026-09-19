import { describe, it, expect } from 'vitest';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';

describe('V67 Track B — v6.5 Baseline Reproduction Tests', () => {
  const reproducer = new V65BaselineReproducer();
  const baseline = reproducer.loadCanonicalBaseline();

  it('1. v6.5 exact reproduction: produces bit-for-bit identical results', () => {
    const result = reproducer.reproduceAndAssert();
    expect(result.exact).toBe(true);
    expect(result.validation.independentReplayReproduction.passed).toBe(true);
  });

  it('2. ledger identity: 4,506 authentic trades with matched hashes', () => {
    expect(baseline.trades.length).toBe(4506);
    expect(baseline.hashes.canonicalLedger).toBe('f2177c218c0fee5e139d563fff3f43f2b9a2ad75cdae4c96ff9228cb71a1fec3');
  });

  it('17. producer/auditor accounting equality: trade metrics reconcile', () => {
    const result = reproducer.runLedgerReconciliation(baseline);
    expect(result.passed).toBe(true);
    expect(baseline.metrics.expectancyR).toBeCloseTo(-0.11, 1);
    expect(baseline.metrics.maxDrawdownPct).toBeCloseTo(78.35, 1);
  });

  it('18. cost reconciliation: itemized transaction costs reconcile to net P&L', () => {
    for (const t of baseline.trades.slice(0, 100)) {
      const computedNet = t.grossPnL - t.totalCosts;
      expect(Math.abs(computedNet - t.netPnL)).toBeLessThanOrEqual(0.02);
    }
  });
});
