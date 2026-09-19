import { describe, it, expect } from 'vitest';

export interface DrawdownMetrics {
  runningPeak: number;
  trough: number;
  absoluteRupeeLoss: number;
  lossVsInitialCapitalPct: number;
  conventionalPeakToTroughPct: number;
  unconstrainedNegativeEquityPct: number;
}

export function calculateMultiDefinitionDrawdowns(
  initialCapital: number,
  equitySeries: number[]
): DrawdownMetrics {
  let peak = initialCapital;
  let trough = initialCapital;
  let maxLossINR = 0;
  let haltedAtZero = false;
  let peakAtHalt = initialCapital;

  for (const eq of equitySeries) {
    if (!haltedAtZero) {
      if (eq > peak) peak = eq;
      if (eq < trough) trough = eq;
      const loss = peak - eq;
      if (loss > maxLossINR) maxLossINR = loss;
      if (eq <= 0) {
        haltedAtZero = true;
        peakAtHalt = peak;
      }
    } else {
      // In unconstrained series, trough can continue downward into negative equity
      if (eq < trough) trough = eq;
      const loss = peak - eq;
      if (loss > maxLossINR) maxLossINR = loss;
    }
  }

  const lossVsInitialCapitalPct = (maxLossINR / initialCapital) * 100;
  const unconstrainedNegativeEquityPct = peak > 0 ? (maxLossINR / peak) * 100 : 0;
  const conventionalPeakToTroughPct = haltedAtZero ? 100.00 : (maxLossINR / peak) * 100;

  return {
    runningPeak: peak,
    trough,
    absoluteRupeeLoss: maxLossINR,
    lossVsInitialCapitalPct,
    conventionalPeakToTroughPct,
    unconstrainedNegativeEquityPct
  };
}

describe('R3.1 Drawdown Forensic Regression Tests', () => {
  it('correctly computes 100 -> 80 -> 50 as 50% conventional drawdown', () => {
    const series = [100, 80, 50];
    const res = calculateMultiDefinitionDrawdowns(100, series);

    expect(res.runningPeak).toBe(100);
    expect(res.trough).toBe(50);
    expect(res.absoluteRupeeLoss).toBe(50);
    expect(res.conventionalPeakToTroughPct).toBe(50);
    expect(res.lossVsInitialCapitalPct).toBe(50);
  });

  it('correctly computes 100 -> 0 as 100% conventional drawdown (insolvency)', () => {
    const series = [100, 80, 40, 0];
    const res = calculateMultiDefinitionDrawdowns(100, series);

    expect(res.runningPeak).toBe(100);
    expect(res.trough).toBe(0);
    expect(res.conventionalPeakToTroughPct).toBe(100);
    expect(res.lossVsInitialCapitalPct).toBe(100);
  });

  it('prohibits silent reporting of >100% as conventional drawdown when negative equity occurs', () => {
    // 100 -> 120 (peak) -> 0 -> -20 (negative equity)
    const series = [100, 120, 50, 0, -20];
    const res = calculateMultiDefinitionDrawdowns(100, series);

    // Conventional long-only drawdown must cap at 100.00% upon bankruptcy
    expect(res.conventionalPeakToTroughPct).toBe(100.00);

    // Unconstrained leverage/debt metrics explicitly recorded separately
    expect(res.absoluteRupeeLoss).toBe(140); // 120 - (-20)
    expect(res.lossVsInitialCapitalPct).toBe(140.00); // 140 / 100
    expect(res.unconstrainedNegativeEquityPct).toBeCloseTo(116.67, 1); // 140 / 120 = 116.67%

    // Mathematical invariant: conventional drawdown cannot exceed 100%
    expect(res.conventionalPeakToTroughPct).toBeLessThanOrEqual(100.00);
  });
});
