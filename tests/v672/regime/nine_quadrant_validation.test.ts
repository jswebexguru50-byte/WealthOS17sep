import { describe, it, expect } from 'vitest';
import { RegimeRobustnessEngine } from '../../../src/server/services/research/RegimeRobustnessEngine.js';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';

describe('V672-R1 — 2D Market Regime 9-Quadrant Validation Tests', () => {
  const engine = new RegimeRobustnessEngine();
  const base = new V65BaselineReproducer().loadCanonicalBaseline();

  it('verifies all 9 quadrants are populated with explicit trade counts, expectancies, and 95% CIs', () => {
    const report = engine.evaluateRegimes(base.trades);

    expect(report.totalQuadrants).toBe(9);
    expect(report.populatedQuadrantsCount).toBe(9);
    expect(report.quadrants.length).toBe(9);

    for (const cell of report.quadrants) {
      expect(cell.status).toBe('POPULATED');
      expect(cell.tradeCount).toBeGreaterThan(50); // Sufficient sample size
      expect(cell.expectancyR).toBeGreaterThan(0);
      expect(cell.expectancyCI95Low).toBeDefined();
      expect(cell.expectancyCI95High).toBeDefined();
      expect(cell.expectancyCI95High).toBeGreaterThan(cell.expectancyCI95Low);
      expect(cell.cagrPct).toBeGreaterThan(0);
      expect(cell.sharpeRatio).toBeGreaterThan(0);
    }

    expect(report.robustnessSummary.positiveExpectancyInAllPopulatedCells).toBe(true);
  });
});
