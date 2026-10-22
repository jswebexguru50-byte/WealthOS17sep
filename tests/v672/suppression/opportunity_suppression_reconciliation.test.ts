import { describe, it, expect } from 'vitest';
import { OpportunitySuppressionEngine } from '../../../src/server/services/research/OpportunitySuppressionEngine.js';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';

describe('V672-R1 — Opportunity Suppression Counterfactual Cost Decomposition Tests', () => {
  const engine = new OpportunitySuppressionEngine();
  const base = new V65BaselineReproducer().loadCanonicalBaseline();

  it('decomposes opportunity suppression into gross avoided, foregone gains, and costs', () => {
    const report = engine.evaluateSuppression(base.trades);

    expect(report.totalEvaluatedTrades).toBe(4506);
    expect(report.grossAvoidedLossesINR).toBeGreaterThan(0);
    expect(report.grossForegoneGainsINR).toBeGreaterThan(0);
    expect(report.transactionCostsAvoidedINR).toBeGreaterThan(0);
    expect(report.netCounterfactualValueINR).toBeGreaterThan(0);
    expect(report.assessment).toBe('GENUINE_LOSS_AVOIDANCE');

    // Itemized record assertions
    const sample = report.itemizedRecords[0];
    expect(sample.counterfactualGrossPnL).toBeDefined();
    expect(sample.actualGrossPnL).toBeDefined();
    expect(sample.grossDelta).toBeDefined();
    expect(sample.counterfactualCosts).toBeDefined();
    expect(sample.actualCosts).toBeDefined();
    expect(sample.suppressionDelta).toBeDefined();
    expect(sample.classification).toBeDefined();
  });
});
