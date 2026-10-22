import { describe, it, expect } from 'vitest';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';
import { RiskAblationEngine } from '../../../src/server/services/research/RiskAblationEngine.js';

describe('V672 Track F — Component Delta Ledger Tests', () => {
  const base = new V65BaselineReproducer().loadCanonicalBaseline();
  const ablationEngine = new RiskAblationEngine();

  it('reconstructs itemized delta contributions across all 8 risk control layers', () => {
    const report = ablationEngine.runAblations(base.trades);
    expect(report.ablations.length).toBe(7);
    expect(report.baselineComposite.expectancyR).toBe(0.38);
    expect(report.baselineComposite.maxDrawdownPct).toBe(-11.2);

    for (const abl of report.ablations) {
      expect(abl.tradeCount).toBeGreaterThan(2000);
      expect(abl.maxDrawdownPct).toBeLessThan(report.baselineComposite.maxDrawdownPct); // Worsens without control
    }
  });
});
