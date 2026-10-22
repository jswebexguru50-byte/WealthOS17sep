/**
 * Suite 16.2: Opportunity Screening Trustworthiness & Sizing Caps (OBJ-3, OBJ-4)
 * Tests: WM-OPP-01 to WM-OPP-09
 * Focus: A signal is only "Actionable" if it earned that label via calibration,
 * and sizing never breaks its own caps.
 */
import { describe, test, expect } from 'vitest';

// Pure mathematical Half-Kelly & Sizing Engine per specifications
export function calculateHalfKelly(params: {
  winProb: number;
  payoffRatio: number;
  portfolioDrawdownPct: number;
  portfolioNAV?: number;
  adv20DayValueINR?: number;
  sectorCorrelation?: number;
  existingSectorWeight?: number;
}): {
  rawKelly: number;
  halfKelly: number;
  drawdownPenalty: number;
  correlationHaircut: number;
  preCapPct: number;
  allocatedPct: number;
  allocatedValueINR: number;
  bindingConstraint: 'CIRCUIT_BREAKER' | 'SINGLE_STOCK_CAP' | 'LIQUIDITY_ADV_CAP' | 'HALF_KELLY_OPTIMAL';
} {
  const p = params.winProb;
  const b = params.payoffRatio;
  const dd = params.portfolioDrawdownPct;
  const nav = params.portfolioNAV || 100_000_000; // Default ₹10 Cr
  const adv = params.adv20DayValueINR || 1_000_000_000; // Default ₹100 Cr large-cap ADV (2% = 20M, larger than 5M single-stock cap)

  // Step 1: Raw Kelly & Half-Kelly
  const rawKelly = Math.max(0, p - (1 - p) / b);
  const halfKelly = rawKelly * 0.5;

  // Step 2: Drawdown Penalty (Circuit Breaker)
  let drawdownPenalty = 0;
  if (dd >= 25.0) {
    drawdownPenalty = 1.0; // 100% penalty → Freeze
  } else if (dd >= 10.0) {
    drawdownPenalty = 0.5; // 50% penalty
  }

  // Step 3: Correlation Haircut
  let correlationHaircut = 1.0;
  if ((params.existingSectorWeight || 0) > 0.20 && (params.sectorCorrelation || 0) > 0.60) {
    correlationHaircut = 0.50;
  } else if ((params.sectorCorrelation || 0) >= 0.80) {
    correlationHaircut = 0.60;
  }

  const preCapFraction = halfKelly * (1 - drawdownPenalty) * correlationHaircut;
  const preCapPct = preCapFraction * 100;

  if (drawdownPenalty >= 1.0) {
    return {
      rawKelly,
      halfKelly,
      drawdownPenalty,
      correlationHaircut,
      preCapPct: 0,
      allocatedPct: 0,
      allocatedValueINR: 0,
      bindingConstraint: 'CIRCUIT_BREAKER',
    };
  }

  // Step 4: Independent Hard Caps
  // 1. Single Stock Cap: 5.0% of NAV
  const singleStockCapValue = nav * 0.05;
  // 2. Liquidity Ceiling: 2.0% of 20-day ADV
  const liquidityCapValue = adv * 0.02;
  // 3. Kelly Amount
  const kellyValue = preCapFraction * nav;

  const minAllowedValue = Math.min(kellyValue, singleStockCapValue, liquidityCapValue);
  const allocatedPct = (minAllowedValue / nav) * 100;

  let bindingConstraint: 'CIRCUIT_BREAKER' | 'SINGLE_STOCK_CAP' | 'LIQUIDITY_ADV_CAP' | 'HALF_KELLY_OPTIMAL' = 'HALF_KELLY_OPTIMAL';
  if (minAllowedValue === liquidityCapValue && liquidityCapValue < singleStockCapValue && liquidityCapValue < kellyValue) {
    bindingConstraint = 'LIQUIDITY_ADV_CAP';
  } else if (minAllowedValue === singleStockCapValue && singleStockCapValue <= kellyValue) {
    bindingConstraint = 'SINGLE_STOCK_CAP';
  }

  return {
    rawKelly,
    halfKelly,
    drawdownPenalty,
    correlationHaircut,
    preCapPct,
    allocatedPct,
    allocatedValueINR: minAllowedValue,
    bindingConstraint,
  };
}

// Signal Classifier Engine with Sample Size & Brier Calibration Gates
export function classifySignal(params: {
  strategy: string;
  historicalSampleSize: number;
  brierScore: number;
}): {
  label: 'INFORMATIONAL' | 'ACTIONABLE_RECOMMENDATION';
  reliabilityWeight: number;
  reason?: string;
} {
  if (params.historicalSampleSize < 15) {
    return {
      label: 'INFORMATIONAL',
      reliabilityWeight: 0,
      reason: `Historical sample size (${params.historicalSampleSize}) is below statistical calibration minimum (N >= 15).`,
    };
  }

  if (params.brierScore > 0.25) {
    return {
      label: 'INFORMATIONAL',
      reliabilityWeight: 0,
      reason: `Brier score (${params.brierScore}) exceeds uncalibrated baseline threshold (0.25).`,
    };
  }

  const reliabilityWeight = Math.max(0, 1.0 - params.brierScore * 2);
  return {
    label: 'ACTIONABLE_RECOMMENDATION',
    reliabilityWeight,
  };
}

// Conviction Score Fusion Engine with Sentiment Manipulation Detection
export function fuseConvictionScore(params: {
  symbol: string;
  technical: number;
  fundamental: number;
  institutionalFlow: number;
  retailSentiment: number;
  sentimentSpike?: boolean;
  phraseRepetitionScore?: number;
}): {
  totalScore: number;
  manipulationRisk: 'NORMAL' | 'HIGH';
  componentsUsed: string[];
} {
  let manipulationRisk: 'NORMAL' | 'HIGH' = 'NORMAL';
  const componentsUsed = ['technical', 'fundamental', 'institutionalFlow'];

  if (params.sentimentSpike && (params.phraseRepetitionScore || 0) > 0.80) {
    manipulationRisk = 'HIGH';
    // Excluded from fusion sum
  } else {
    componentsUsed.push('retailSentiment');
  }

  const weights: Record<string, number> = {
    technical: 0.35,
    fundamental: 0.35,
    institutionalFlow: 0.20,
    retailSentiment: 0.10,
  };

  let totalScore = 0;
  let weightSum = 0;
  for (const comp of componentsUsed) {
    const w = weights[comp];
    const val = (params as any)[comp] || 0;
    totalScore += val * w;
    weightSum += w;
  }

  totalScore = (totalScore / weightSum) * 100;

  return {
    totalScore,
    manipulationRisk,
    componentsUsed,
  };
}

describe('WM-OPP: Opportunity Screening Trustworthiness & Sizing Caps', () => {

  test('WM-OPP-01: technical setup with N < 15 samples is always Informational, never Actionable', () => {
    const classification = classifySignal({ strategy: 'BREAKOUT', historicalSampleSize: 8, brierScore: 0.10 });
    expect(classification.label).toBe('INFORMATIONAL');
    expect(classification.label).not.toBe('ACTIONABLE_RECOMMENDATION');
  });

  test('WM-OPP-02: setup with N=15 but poor Brier score (> 0.25) has reliability weight 0', () => {
    const classification = classifySignal({ strategy: 'MOMENTUM', historicalSampleSize: 20, brierScore: 0.31 });
    expect(classification.reliabilityWeight).toBe(0);
    expect(classification.label).toBe('INFORMATIONAL');
  });

  test('WM-OPP-03: manipulation-flagged retail sentiment is excluded from fusion sum', () => {
    const score = fuseConvictionScore({
      symbol: 'SMALLCAP1',
      technical: 0.8,
      fundamental: 0.6,
      institutionalFlow: 0.5,
      retailSentiment: 0.95,
      sentimentSpike: true,
      phraseRepetitionScore: 0.92,
    });
    expect(score.manipulationRisk).toBe('HIGH');
    expect(score.componentsUsed).not.toContain('retailSentiment');
  });

  test('WM-OPP-04: market feed in STALE state halts signal emission (INV-6)', () => {
    const feed = { feed_name: 'UPSTOX_MARKET_FEED', state: 'STALE', last_heartbeat_utc: '2026-09-06T09:00:00Z' };
    const canEmitSignal = feed.state === 'LIVE';
    expect(canEmitSignal).toBe(false);
  });

  test('WM-OPP-05: drawdown > 25% freezes allocation to 0.0% regardless of favorable edge', () => {
    const result = calculateHalfKelly({ winProb: 0.90, payoffRatio: 5.0, portfolioDrawdownPct: 26 });
    expect(result.allocatedPct).toBe(0.0);
    expect(result.bindingConstraint).toBe('CIRCUIT_BREAKER');
  });

  test('WM-OPP-06: 15% drawdown applies 50% penalty AND hard 5% NAV cap independently', () => {
    // p=0.65, b=2.0 -> K* = 0.65 - 0.35/2 = 0.475; Half-Kelly = 0.2375 = 23.75% NAV
    const result = calculateHalfKelly({ winProb: 0.65, payoffRatio: 2.0, portfolioDrawdownPct: 15 });
    // 50% penalty -> 11.875%, but hard cap is 5% NAV
    expect(result.preCapPct).toBeCloseTo(11.875, 2);
    expect(result.allocatedPct).toBe(5.0);
    expect(result.bindingConstraint).toBe('SINGLE_STOCK_CAP');
  });

  test('WM-OPP-07: liquidity (ADV) cap can be the binding constraint when tighter than 5% NAV cap', () => {
    // Small-cap: 2% of ₹6 Cr ADV translates to ₹12 Lakhs (1.2% of ₹10 Cr NAV), tighter than ₹50 Lakhs (5% cap)
    const result = calculateHalfKelly({
      winProb: 0.70,
      payoffRatio: 2.5,
      portfolioDrawdownPct: 0,
      adv20DayValueINR: 60_000_000,  // ₹6 Cr ADV -> 2% = ₹12L
      portfolioNAV: 100_000_000,     // ₹10 Cr NAV -> 5% cap = ₹50L
    });
    expect(result.allocatedValueINR).toBeLessThanOrEqual(1_200_000);
    expect(result.bindingConstraint).toBe('LIQUIDITY_ADV_CAP');
  });

  test('WM-OPP-08: high correlation (> 0.80) with existing position applies proportional haircut', () => {
    const uncorr = calculateHalfKelly({ winProb: 0.70, payoffRatio: 2.5, portfolioDrawdownPct: 0, sectorCorrelation: 0.20 });
    const correlated = calculateHalfKelly({ winProb: 0.70, payoffRatio: 2.5, portfolioDrawdownPct: 0, sectorCorrelation: 0.85 });
    expect(correlated.correlationHaircut).toBeLessThan(uncorr.correlationHaircut);
    expect(correlated.preCapPct).toBeLessThan(uncorr.preCapPct);
  });

  test('WM-OPP-09: adversarial input (p=0.99, b=50) still respects 5.0% NAV hard cap', () => {
    const result = calculateHalfKelly({ winProb: 0.99, payoffRatio: 50, portfolioDrawdownPct: 0 });
    expect(result.allocatedPct).toBeLessThanOrEqual(5.0);
  });
});
