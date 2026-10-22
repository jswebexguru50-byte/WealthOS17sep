import { describe, it, expect } from 'vitest';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';
import { CostRobustnessEngine } from '../../../src/server/services/research/CostRobustnessEngine.js';

describe('V672 Track G — Cost Friction Actual Reproduction Tests', () => {
  const base = new V65BaselineReproducer().loadCanonicalBaseline();
  const engine = new CostRobustnessEngine();

  it('recalculates trade economics across friction multipliers from 0.75x to 2.00x', () => {
    const report = engine.evaluateFrictionSensitivity(base.trades);

    expect(report.steps.length).toBe(6);
    expect(report.robustnessPassed).toBe(true);
    expect(report.stress2xExpectancyR).toBeGreaterThan(0.15);

    const step1x = report.steps.find(s => s.multiplier === 1.00)!;
    const step2x = report.steps.find(s => s.multiplier === 2.00)!;
    expect(step1x.totalFrictionCostsINR).toBeLessThan(step2x.totalFrictionCostsINR);
  });
});
