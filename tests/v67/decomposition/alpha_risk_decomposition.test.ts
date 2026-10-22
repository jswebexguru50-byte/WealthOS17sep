import { describe, it, expect } from 'vitest';
import { AlphaRiskDecomposition } from '../../../src/server/services/research/AlphaRiskDecomposition.js';

describe('V67.1 Alpha vs Risk Decomposition & Exposure Guard Tests', () => {
  const decomp = new AlphaRiskDecomposition();
  const report = decomp.computeDecomposition();

  it('1. delta decomposition contains 9 sequential increments', () => {
    expect(report.deltaDecomposition.length).toBe(9);
    const totalExpDelta = report.deltaDecomposition.reduce((acc, cur) => acc + cur.expectancyDeltaR, 0);
    expect(totalExpDelta).toBeCloseTo(0.49, 1); // C01 (-0.11R) -> C12 (+0.38R)
  });

  it('2. four portfolios (R0, R1, R2, R3) isolate alpha vs risk contributions', () => {
    const { r0_technicalBaseline, r1_alphaWithoutRisk, r2_riskWithoutAlpha, r3_fullC12 } = report.portfolios;
    expect(r0_technicalBaseline.expectancyR).toBeCloseTo(-0.11, 2);
    expect(r1_alphaWithoutRisk.expectancyR).toBeCloseTo(0.14, 2);
    expect(r2_riskWithoutAlpha.expectancyR).toBeCloseTo(0.08, 2);
    expect(r3_fullC12.expectancyR).toBeCloseTo(0.38, 2);

    // MaxDD checks
    expect(r0_technicalBaseline.maxDrawdownPct).toBeCloseTo(78.35, 1);
    expect(r2_riskWithoutAlpha.maxDrawdownPct).toBeLessThan(20.0);
    expect(r3_fullC12.maxDrawdownPct).toBeCloseTo(11.2, 1);
  });

  it('3. exposure collapse guard verifies capital utilization', () => {
    const guard = report.exposureCollapseGuard;
    expect(guard.exposureCollapsePass).toBe(true);
    expect(guard.capitalStarvationDetected).toBe(false);
    expect(guard.averageExposurePct).toBeGreaterThanOrEqual(40.0);
    expect(guard.tradeCount).toBeGreaterThanOrEqual(1000);
  });
});
