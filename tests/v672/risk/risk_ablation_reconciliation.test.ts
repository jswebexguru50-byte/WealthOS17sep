import { describe, it, expect } from 'vitest';
import { RiskAblationEngine } from '../../../src/server/services/research/RiskAblationEngine.js';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';

describe('V672-R1 — Risk Ablation & Efficiency Frontier Reconciliation Tests', () => {
  const engine = new RiskAblationEngine();
  const base = new V65BaselineReproducer().loadCanonicalBaseline();

  it('reproduces R0 to R3 ablation sequence and evaluates full risk efficiency frontier', () => {
    const report = engine.runAblations(base.trades);

    expect(report.baselineComposite).toBeDefined();
    expect(report.baselineComposite.expectancyR).toBe(0.38);
    expect(report.baselineComposite.cagrPct).toBe(28.4);
    expect(report.baselineComposite.maxDrawdownPct).toBe(-11.2);
    expect(report.baselineComposite.sharpe).toBe(1.68);
    expect(report.baselineComposite.sortino).toBe(2.42);
    expect(report.baselineComposite.calmar).toBe(2.54);

    expect(report.ablations.length).toBe(7);
    for (const abl of report.ablations) {
      expect(abl.tradeCount).toBeGreaterThan(2000);
      expect(abl.maxDrawdownPct).toBeLessThan(report.baselineComposite.maxDrawdownPct);
    }
  });
});
