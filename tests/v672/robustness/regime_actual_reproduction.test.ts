import { describe, it, expect } from 'vitest';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';
import { RegimeRobustnessEngine } from '../../../src/server/services/research/RegimeRobustnessEngine.js';

describe('V672 Track G — 2D Market Regime Actual Reproduction Tests', () => {
  const base = new V65BaselineReproducer().loadCanonicalBaseline();
  const engine = new RegimeRobustnessEngine();

  it('verifies positive expectancy across all 9 Trend x Volatility quadrants', () => {
    const report = engine.evaluateRegimes(base.trades);
    expect(report.totalQuadrants).toBe(9);
    expect(report.populatedQuadrantsCount).toBe(9);
    expect(report.robustnessSummary.positiveExpectancyInAllPopulatedCells).toBe(true);

    for (const q of report.quadrants) {
      expect(q.status).toBe('POPULATED');
      expect(q.expectancyR).toBeGreaterThan(0);
      expect(q.tradeCount).toBeGreaterThan(50);
    }
  });
});
