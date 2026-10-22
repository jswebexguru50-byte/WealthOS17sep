import { describe, it, expect } from 'vitest';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';
import { OpportunitySuppressionEngine } from '../../../src/server/services/research/OpportunitySuppressionEngine.js';

describe('V672 Track F — Opportunity Suppression Recomputed Tests', () => {
  const base = new V65BaselineReproducer().loadCanonicalBaseline();
  const engine = new OpportunitySuppressionEngine();

  it('reconstructs avoided losses and foregone gains strictly from trade-level counterfactual records', () => {
    const summary = engine.evaluateSuppression(base.trades);

    expect(summary.totalEvaluatedTrades).toBe(4506);
    expect(summary.itemizedRecords.length).toBe(4506);
    expect(summary.avoidedLossINR).toBeGreaterThan(0);
    expect(summary.foregoneGainINR).toBeGreaterThan(0);
    expect(summary.netSuppressionValueINR).toBeGreaterThan(0);
    expect(summary.assessment).toBe('GENUINE_LOSS_AVOIDANCE');
  });
});
