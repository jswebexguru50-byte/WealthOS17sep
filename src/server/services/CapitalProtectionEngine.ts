/**
 * src/server/services/CapitalProtectionEngine.ts
 *
 * Capital Protection, Adaptive Liquidity, Multi-Tier Gap Risk Sizing,
 * Correlation Guardrails, 4-Tier Exit Architecture, Strategy Health Lifecycle,
 * Versioned Transaction Cost Modeling, and False Breakout Classification for WealthOS / ITAS.
 *
 * Incorporates senior peer review findings:
 * - Explicit RISK_POLICY configuration (1.5% target risk, 2.0% hard ceiling)
 * - Median ADV and volume skew protection in liquidity sizing
 * - Multi-tier gap stress framework (G50, G90, G95, G99) without false zero-ruin claims
 * - 5-tier strategy health state machine (ACTIVE, WATCH, DEGRADED, RESEARCH_ONLY, QUARANTINED)
 * - Canonical parabolic exhaustion policy thresholds
 * - Configurable thesis failure semantics (EITHER vs STRICT_DUAL)
 * - Strategy-specific time-to-resolution windows (e.g. 10 sessions for momentum, 45 for structural)
 * - Intrabar ambiguity detection and conservative order resolution in false breakouts
 * - Versioned statutory Indian transaction cost schedules with effective dates
 */

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL RISK POLICY
// ─────────────────────────────────────────────────────────────────────────────
export const RISK_POLICY = {
  defaultTargetRiskPct: 0.015, // 1.5% target risk per trade
  hardMaximumRiskPct: 0.020,   // 2.0% absolute hard ceiling
  maxStockEquityPct: 0.080,    // 8.0% single stock cap
  maxSectorEquityPct: 0.250,   // 25.0% sector cap
  maxClusterEquityPct: 0.300   // 30.0% correlated cluster cap
};

export interface PositionSizingParams {
  portfolioEquity: number;
  entryPrice: number;
  stopPrice: number;
  riskFraction?: number; // Target risk (default 0.015, clamped at 0.020 ceiling)
  maxPortfolioFraction?: number; // Production: hard-clamped to 0.08; research may opt out explicitly
  advValue: number; // 30-day Average Daily Traded Value in INR
  medianAdvValue?: number; // 30-day Median Daily Traded Value (protects against block trade skew)
  maxAdvParticipation?: number; // Default 0.05 (5.0% of ADV)
  kellyFraction?: number; // Fractional Kelly (0.5x), used as an upper guide
  adverseGap95Pct?: number; // Historical 95th percentile adverse overnight gap %
  allowUnconstrainedConcentrationForResearch?: boolean;
  gapPercentiles?: {
    g50: number;
    g90: number;
    g95: number;
    g99: number;
    maxObserved?: number;
  };
}

export interface PositionSizingDecision {
  shares: number;
  allocatedCapital: number;
  capitalPctOfPortfolio: number;
  maxRiskAmount: number;
  riskPctOfPortfolio: number;
  limitingConstraint: 'RISK_CAP' | 'PORTFOLIO_CONCENTRATION' | 'LIQUIDITY_ADV' | 'KELLY_GUIDE' | 'GAP_RISK_SCALE';
  sizingBreakdown: {
    riskBasedShares: number;
    concentrationShares: number;
    liquidityShares: number;
    kellyShares: number;
    gapAdjustedShares: number;
  };
  gapRiskTier: 'NORMAL' | 'REDUCED' | 'RESTRICTED' | 'NO_NEW_POSITION';
}

/**
 * Calculates position size enforcing multiple institutional safety constraints.
 * Protects against liquidity skew by evaluating min(mean ADV, median ADV).
 */
export function calculateAdaptivePositionSize(p: PositionSizingParams): PositionSizingDecision {
  const entry = Math.max(0.01, p.entryPrice);
  const stop = Math.max(0.01, p.stopPrice);
  const equity = Math.max(1000, p.portfolioEquity);
  
  // Enforce RISK_POLICY boundaries: target 1.5%, hard ceiling 2.0%
  const riskFraction = Math.min(
    RISK_POLICY.hardMaximumRiskPct,
    Math.max(0.005, p.riskFraction ?? RISK_POLICY.defaultTargetRiskPct)
  );
  const requestedPortfolioFraction = p.maxPortfolioFraction ?? RISK_POLICY.maxStockEquityPct;
  const maxPortfolioFraction = p.allowUnconstrainedConcentrationForResearch
    ? Math.min(0.50, Math.max(0.01, requestedPortfolioFraction))
    : Math.min(RISK_POLICY.maxStockEquityPct, Math.max(0.01, requestedPortfolioFraction));
  const maxAdvParticipation = Math.min(0.05, Math.max(0.01, p.maxAdvParticipation || 0.05));

  const riskPerShare = Math.abs(entry - stop);
  const stopDistancePct = (riskPerShare / entry) * 100;

  // 1. Risk-based allocation (Max 2% of portfolio equity)
  const maxRiskAmount = equity * riskFraction;
  const riskBasedShares = riskPerShare > 0 ? Math.floor(maxRiskAmount / riskPerShare) : 0;

  // 2. Portfolio concentration limit (Max 8% per single stock)
  const maxConcentrationCapital = equity * maxPortfolioFraction;
  const concentrationShares = Math.floor(maxConcentrationCapital / entry);

  // 3. Adaptive liquidity limit (5% of min(mean ADV, median ADV) to protect against volume skew)
  const effectiveAdv = p.medianAdvValue && p.medianAdvValue > 0
    ? Math.min(p.advValue, p.medianAdvValue)
    : (p.advValue || 50000000);
  const maxLiquidityCapital = Math.max(10000, effectiveAdv * maxAdvParticipation);
  const liquidityShares = Math.floor(maxLiquidityCapital / entry);

  // 4. Fractional Kelly guideline
  const kellyShares = p.kellyFraction && p.kellyFraction > 0
    ? Math.floor((equity * Math.min(0.20, p.kellyFraction)) / entry)
    : Infinity;

  // 5. Multi-Tier Gap Risk Analysis
  let gapScaleFactor = 1.0;
  let gapRiskTier: PositionSizingDecision['gapRiskTier'] = 'NORMAL';
  
  const g95 = p.gapPercentiles?.g95 ?? p.adverseGap95Pct;
  const g99 = p.gapPercentiles?.g99;

  if (g99 && g99 > 2.5 * stopDistancePct && p.advValue < 10000000) {
    gapRiskTier = 'NO_NEW_POSITION';
    gapScaleFactor = 0;
  } else if (g99 && g99 > 1.5 * stopDistancePct) {
    gapRiskTier = 'RESTRICTED';
    gapScaleFactor = Math.max(0.2, Math.min(1.0, stopDistancePct / g99));
  } else if (g95 && g95 > stopDistancePct) {
    gapRiskTier = 'REDUCED';
    gapScaleFactor = Math.max(0.3, Math.min(1.0, stopDistancePct / g95));
  }

  const gapAdjustedShares = Math.floor(riskBasedShares * gapScaleFactor);

  // Find minimum shares across all safety constraints
  const sharesMap = {
    RISK_CAP: riskBasedShares,
    PORTFOLIO_CONCENTRATION: concentrationShares,
    LIQUIDITY_ADV: liquidityShares,
    KELLY_GUIDE: kellyShares,
    GAP_RISK_SCALE: gapAdjustedShares
  };

  let minShares = riskBasedShares;
  let limitingConstraint: PositionSizingDecision['limitingConstraint'] = 'RISK_CAP';

  for (const [key, val] of Object.entries(sharesMap)) {
    if (val < minShares) {
      minShares = val;
      limitingConstraint = key as any;
    }
  }

  const finalShares = Math.max(0, minShares);
  const allocatedCapital = Number((finalShares * entry).toFixed(2));
  const capitalPctOfPortfolio = Number(((allocatedCapital / equity) * 100).toFixed(2));
  const actualRisk = Number((finalShares * riskPerShare).toFixed(2));
  const riskPctOfPortfolio = Number(((actualRisk / equity) * 100).toFixed(2));

  return {
    shares: finalShares,
    allocatedCapital,
    capitalPctOfPortfolio,
    maxRiskAmount: actualRisk,
    riskPctOfPortfolio,
    limitingConstraint,
    sizingBreakdown: {
      riskBasedShares,
      concentrationShares,
      liquidityShares,
      kellyShares: kellyShares === Infinity ? concentrationShares : kellyShares,
      gapAdjustedShares
    },
    gapRiskTier
  };
}

/**
 * Overnight Gap Risk Evaluator
 */
export function evaluateOvernightGapRisk(
  dailyOpenCloses: { open: number; prevClose: number }[],
  plannedStopDistancePct: number
): {
  g50: number;
  g90: number;
  g95: number;
  g99: number;
  gapRiskTier: 'NORMAL' | 'REDUCED' | 'RESTRICTED' | 'NO_NEW_POSITION';
  scaleFactor: number;
  recommendation: string;
} {
  if (!dailyOpenCloses || dailyOpenCloses.length < 20) {
    return {
      g50: 0.5,
      g90: 1.5,
      g95: 2.2,
      g99: 3.5,
      gapRiskTier: 'NORMAL',
      scaleFactor: 1.0,
      recommendation: 'Insufficient gap history; default normal risk tier applied.'
    };
  }

  const adverseGaps: number[] = [];
  for (const d of dailyOpenCloses) {
    if (d.prevClose > 0) {
      const gapPct = ((d.prevClose - d.open) / d.prevClose) * 100;
      if (gapPct > 0) adverseGaps.push(gapPct);
    }
  }
  adverseGaps.sort((a, b) => a - b);

  const getP = (p: number) => {
    if (adverseGaps.length === 0) return 1.0;
    const idx = Math.min(adverseGaps.length - 1, Math.floor((p / 100) * adverseGaps.length));
    return Number(adverseGaps[idx].toFixed(2));
  };

  const g50 = getP(50);
  const g90 = getP(90);
  const g95 = getP(95);
  const g99 = getP(99);

  let gapRiskTier: 'NORMAL' | 'REDUCED' | 'RESTRICTED' | 'NO_NEW_POSITION' = 'NORMAL';
  let scaleFactor = 1.0;

  if (g99 > 2.5 * plannedStopDistancePct) {
    gapRiskTier = 'NO_NEW_POSITION';
    scaleFactor = 0;
  } else if (g99 > 1.5 * plannedStopDistancePct) {
    gapRiskTier = 'RESTRICTED';
    scaleFactor = Math.max(0.25, Math.min(1.0, plannedStopDistancePct / g99));
  } else if (g95 > plannedStopDistancePct) {
    gapRiskTier = 'REDUCED';
    scaleFactor = Math.max(0.35, Math.min(1.0, plannedStopDistancePct / g95));
  }

  return {
    g50,
    g90,
    g95,
    g99,
    gapRiskTier,
    scaleFactor: Number(scaleFactor.toFixed(2)),
    recommendation: gapRiskTier === 'NORMAL'
      ? `Gap risk acceptable (G95: ${g95}% <= Stop: ${plannedStopDistancePct.toFixed(1)}%). Full size allowed.`
      : `Adverse gap risk elevated (G95: ${g95}%, G99: ${g99}%). Position size scaled by ${(scaleFactor * 100).toFixed(0)}%.`
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5-STATE CAPITAL PRESERVATION STATE MACHINE
// ─────────────────────────────────────────────────────────────────────────────
// 5-STATE CAPITAL PRESERVATION STATE MACHINE
// ─────────────────────────────────────────────────────────────────────────────
export type CapitalPreservationState = 
  | 'NORMAL'
  | 'CAUTION'
  | 'DEFENSIVE'
  | 'PRESERVATION'
  | 'CAPITAL_PRESERVATION'
  | 'MODEL_REVIEW'
  | 'EMERGENCY_HALT';

export const CAPITAL_STATE_THRESHOLDS = {
  CAUTION: { dailyLossPct: 2.0, weeklyLossPct: 2.0, drawdownPct: 3.5 },
  DEFENSIVE: { dailyLossPct: 3.0, weeklyLossPct: 5.0, drawdownPct: 6.0 },
  PRESERVATION: { dailyLossPct: 4.0, weeklyLossPct: 8.0, drawdownPct: 8.0 },
  MODEL_REVIEW: { dailyLossPct: 6.0, weeklyLossPct: 12.0, drawdownPct: 15.0 }
} as const;

export interface StateMachineDecision {
  currentState: CapitalPreservationState;
  drawdownPct: number;
  permittedRiskMultiplier: number;
  allowNewMomentumEntries: boolean;
  newTacticalEntriesAllowed: boolean;
  exposureCapPct: number;
  hedgeRequired: boolean;
  minQualityScoreRequired: number;
  cashTargetPct: number;
  hedgingAllowed: boolean;
  actionSummary: string;
}

export function evaluateCapitalPreservationState(
  arg1: number | { dailyLossPct?: number; weeklyLossPct?: number; peakToTroughDrawdownPct?: number },
  currentPortfolioEquity?: number
): StateMachineDecision {
  let drawdownPct = 0;
  let dailyLossPct = 0;
  let weeklyLossPct = 0;

  if (typeof arg1 === 'object' && arg1 !== null) {
    drawdownPct = arg1.peakToTroughDrawdownPct ?? 0;
    dailyLossPct = arg1.dailyLossPct ?? 0;
    weeklyLossPct = arg1.weeklyLossPct ?? 0;
  } else if (typeof arg1 === 'number') {
    const peak = Math.max(1, arg1);
    const curr = Math.max(0, currentPortfolioEquity ?? peak);
    drawdownPct = Number((((peak - curr) / peak) * 100).toFixed(2));
  }

  // Model Review / Emergency Halt at canonical MODEL_REVIEW thresholds.
  if (drawdownPct >= CAPITAL_STATE_THRESHOLDS.MODEL_REVIEW.drawdownPct ||
      dailyLossPct >= CAPITAL_STATE_THRESHOLDS.MODEL_REVIEW.dailyLossPct ||
      weeklyLossPct >= CAPITAL_STATE_THRESHOLDS.MODEL_REVIEW.weeklyLossPct) {
    return {
      currentState: 'MODEL_REVIEW',
      drawdownPct,
      permittedRiskMultiplier: 0.0,
      allowNewMomentumEntries: false,
      newTacticalEntriesAllowed: false,
      exposureCapPct: 0,
      hedgeRequired: true,
      minQualityScoreRequired: 100,
      cashTargetPct: 80.0,
      hedgingAllowed: true,
      actionSummary: 'MODEL_REVIEW: Daily loss >= 6%, weekly loss >= 12%, or drawdown >= 15%. Zero new entries and immediate model review.'
    };
  }

  // Capital Preservation at canonical PRESERVATION thresholds.
  if (drawdownPct >= CAPITAL_STATE_THRESHOLDS.PRESERVATION.drawdownPct ||
      dailyLossPct >= CAPITAL_STATE_THRESHOLDS.PRESERVATION.dailyLossPct ||
      weeklyLossPct >= CAPITAL_STATE_THRESHOLDS.PRESERVATION.weeklyLossPct) {
    return {
      currentState: 'CAPITAL_PRESERVATION',
      drawdownPct,
      permittedRiskMultiplier: 0.25,
      allowNewMomentumEntries: false,
      newTacticalEntriesAllowed: false,
      exposureCapPct: 25,
      hedgeRequired: true,
      minQualityScoreRequired: 85,
      cashTargetPct: 50.0,
      hedgingAllowed: true,
      actionSummary: 'CAPITAL_PRESERVATION: Drawdown >= 8%. Minimum 50% cash buffer. Mandatory hedging.'
    };
  }

  // Defensive (Drawdown >= 6.0% or Daily >= 3.0% or Weekly >= 5.0%)
  if (drawdownPct >= CAPITAL_STATE_THRESHOLDS.DEFENSIVE.drawdownPct || dailyLossPct >= CAPITAL_STATE_THRESHOLDS.DEFENSIVE.dailyLossPct || weeklyLossPct >= CAPITAL_STATE_THRESHOLDS.DEFENSIVE.weeklyLossPct) {
    return {
      currentState: 'DEFENSIVE',
      drawdownPct,
      permittedRiskMultiplier: 0.50,
      allowNewMomentumEntries: false,
      newTacticalEntriesAllowed: false,
      exposureCapPct: 50,
      hedgeRequired: false,
      minQualityScoreRequired: 80,
      cashTargetPct: 30.0,
      hedgingAllowed: true,
      actionSummary: 'DEFENSIVE: Drawdown 6-10%. Risk reduced to 0.50x. Derivatives hedge enabled.'
    };
  }

  // Caution (Daily >= 2.0% or Weekly >= 2.0% or Drawdown >= 3.5%)
  if (dailyLossPct >= CAPITAL_STATE_THRESHOLDS.CAUTION.dailyLossPct || weeklyLossPct >= CAPITAL_STATE_THRESHOLDS.CAUTION.weeklyLossPct || drawdownPct >= CAPITAL_STATE_THRESHOLDS.CAUTION.drawdownPct) {
    return {
      currentState: 'CAUTION',
      drawdownPct,
      permittedRiskMultiplier: 0.75,
      allowNewMomentumEntries: false,
      newTacticalEntriesAllowed: false,
      exposureCapPct: 75,
      hedgeRequired: false,
      minQualityScoreRequired: 75,
      cashTargetPct: 15.0,
      hedgingAllowed: false,
      actionSummary: 'CAUTION: Daily or weekly loss limit reached. Risk per trade reduced to 0.75x.'
    };
  }

  return {
    currentState: 'NORMAL',
    drawdownPct,
    permittedRiskMultiplier: 1.0,
    allowNewMomentumEntries: true,
    newTacticalEntriesAllowed: true,
    exposureCapPct: 100,
    hedgeRequired: false,
    minQualityScoreRequired: 70,
    cashTargetPct: 5.0,
    hedgingAllowed: false,
    actionSummary: 'NORMAL: Drawdown below the CAUTION threshold. Full risk permitted (1.0x). All approved strategies executable.'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4-TIER EXIT ARCHITECTURE & PARABOLIC EXHAUSTION
// ─────────────────────────────────────────────────────────────────────────────

export const STRATEGY_RESOLUTION_WINDOWS: Record<string, number> = {
  S6: 10, S8: 10, S8B: 10, S10: 10, // Momentum breakouts: 10 sessions
  S1: 15, S5: 15, S22: 15,          // Squeeze & VCP: 15 sessions
  S12: 20, S13: 25, S16: 25, S17: 25, // Catalysts & operating leverage: 20-25 sessions
  S20: 45, S21: 45, S23: 30,        // Structural geometry: 30-45 sessions
  DEFAULT: 20
};

export interface PositionExitInput {
  currentPrice?: number;
  hardStopPrice?: number;
  initialStop?: number;
  trailingStopPrice?: number;
  entryPrice?: number;
  highestPriceSinceEntry?: number;
  rsi14?: number;
  volume20DAvg?: number;
  currentVolume?: number;
  volumeRatio?: number;
  ma20Price?: number;
  ema20?: number;
  ma50Price?: number;
  ema50?: number;
  relativeStrengthPercentile?: number;
  holdingDays?: number;
  barsInTrade?: number;
  dayHigh?: number;
  dayLow?: number;
  dayClose?: number;
  atr14?: number;
  strategyId?: string;
  maxAllowedHoldingDays?: number;
  thesisFailureMode?: 'EITHER' | 'STRICT_DUAL'; // 'EITHER' = OR semantics (default); 'STRICT_DUAL' = AND semantics
}

export function evaluatePositionExit(input: PositionExitInput): {
  action: 'HOLD' | 'EXIT_FULL' | 'EXIT_HARD_STOP' | 'EXIT_THESIS_FAILURE' | 'EXIT_TRAILING_STOP' | 'SCALE_OUT_50' | 'SCALE_OUT_EXHAUSTION' | 'EXIT_TIME_STOP';
  tier: 'NONE' | 'EXIT_A_HARD_STOP' | 'EXIT_B_THESIS_FAILURE' | 'EXIT_C_PARABOLIC_EXHAUSTION' | 'EXIT_D_TRAILING_STOP' | 'EXIT_E_TIME_STOP';
  urgency: 'IMMEDIATE' | 'HIGH' | 'MEDIUM' | 'NONE';
  scaleOutFraction?: number;
  reason: string;
} {
  const price = input.currentPrice ?? input.dayClose ?? 0;
  const hardStop = input.hardStopPrice ?? input.initialStop ?? 0;
  const ma20 = input.ma20Price ?? input.ema20 ?? 0;
  const ma50 = input.ma50Price ?? input.ema50 ?? 0;
  const rsi = input.rsi14 ?? 50;
  const entry = input.entryPrice ?? price;
  const volRatio = input.volumeRatio ?? (input.volume20DAvg && input.volume20DAvg > 0 ? (input.currentVolume ?? 0) / input.volume20DAvg : 1.0);

  // 1. Tier 1: Hard Stop Loss
  if (hardStop > 0 && price <= hardStop) {
    return {
      action: 'EXIT_FULL',
      tier: 'EXIT_A_HARD_STOP',
      urgency: 'IMMEDIATE',
      scaleOutFraction: 1.0,
      reason: `TIER_1_HARD_STOP: Price (₹${price}) breached invalidation stop (₹${hardStop}).`
    };
  }

  // 2. Tier 4: Parabolic Exhaustion Scale-Out (checked before trailing to lock windfalls)
  const isExtensionExtreme = (ma20 > 0 && ((price - ma20) / ma20) >= 0.18) ||
                             (ma50 > 0 && ((price - ma50) / ma50) >= 0.25);
  const isRsiOverbought = rsi >= 80;
  const isVolumeRejection = volRatio >= 2.5;

  if ((isExtensionExtreme && isRsiOverbought) || (isRsiOverbought && isVolumeRejection)) {
    return {
      action: 'SCALE_OUT_50',
      tier: 'EXIT_C_PARABOLIC_EXHAUSTION',
      urgency: 'MEDIUM',
      scaleOutFraction: 0.5,
      reason: `TIER_4_PARABOLIC_EXHAUSTION: Extreme extension (${((price - ma20) / (ma20 || 1) * 100).toFixed(1)}%), RSI ${rsi}, Volume Ratio ${volRatio.toFixed(1)}x. Scale out 50%.`
    };
  }

  // 3. Tier 2: Thesis Failure (Configurable EITHER vs STRICT_DUAL)
  const isMa50Broken = ma50 > 0 && price < ma50;
  const isRsCollapsed = (input.relativeStrengthPercentile ?? 70) < 50;
  const mode = input.thesisFailureMode || 'EITHER';
  const isThesisFailed = mode === 'EITHER'
    ? (isMa50Broken || isRsCollapsed)
    : (isMa50Broken && isRsCollapsed);

  if (isThesisFailed && (isMa50Broken || isRsCollapsed)) {
    return {
      action: 'EXIT_FULL',
      tier: 'EXIT_B_THESIS_FAILURE',
      urgency: 'HIGH',
      scaleOutFraction: 1.0,
      reason: `TIER_2_THESIS_FAILURE (${mode}): Violation of core trend thesis.`
    };
  }

  // 4. Tier 3: Trailing ATR Profit Protection
  if (input.trailingStopPrice && input.trailingStopPrice > entry && price <= input.trailingStopPrice) {
    return {
      action: 'EXIT_FULL',
      tier: 'EXIT_D_TRAILING_STOP',
      urgency: 'HIGH',
      scaleOutFraction: 1.0,
      reason: `TIER_3_TRAILING_STOP: Price (₹${price}) hit trailing profit stop (₹${input.trailingStopPrice}).`
    };
  }

  // 5. Tier 5: Strategy-Specific Time-to-Resolution Stop
  const holdingDays = input.holdingDays ?? input.barsInTrade ?? 0;
  const maxDays = input.maxAllowedHoldingDays ||
    (input.strategyId ? STRATEGY_RESOLUTION_WINDOWS[input.strategyId] ?? STRATEGY_RESOLUTION_WINDOWS.DEFAULT : 20);

  if (holdingDays >= maxDays && price < entry * 1.03) {
    return {
      action: 'EXIT_FULL',
      tier: 'EXIT_E_TIME_STOP',
      urgency: 'MEDIUM',
      scaleOutFraction: 1.0,
      reason: `TIER_5_TIME_STOP: Stagnant breakout held for ${holdingDays} sessions without achieving +3% resolution threshold.`
    };
  }

  return {
    action: 'HOLD',
    tier: 'NONE',
    urgency: 'NONE',
    scaleOutFraction: 0.0,
    reason: 'Position health normal. All stop and exit guardrails intact.'
  };
}

/**
 * Canonical Parabolic Exhaustion Policy
 */
export function evaluateParabolicExhaustion(
  currentPrice: number,
  ma20Price: number,
  rsi14: number,
  currentVolume: number,
  volume20DAvg: number,
  isRejectionCandle = false
): {
  action: 'SCALE_OUT_25' | 'SCALE_OUT_50' | 'FULL_EXIT' | 'NONE';
  severity: 'LEVEL_1_WARNING' | 'LEVEL_2_CONFIRMED' | 'LEVEL_3_SEVERE' | 'NORMAL';
  scaleOutFraction: number;
  explanation: string;
} {
  const extensionPct = ma20Price > 0 ? ((currentPrice - ma20Price) / ma20Price) * 100 : 0;
  const volRatio = volume20DAvg > 0 ? currentVolume / volume20DAvg : 1.0;

  // Level 3: Severe exhaustion blow-off (Decisive break or extreme extension)
  if (rsi14 >= 88 && extensionPct >= 35 && volRatio >= 3.5 && isRejectionCandle) {
    return {
      action: 'FULL_EXIT',
      severity: 'LEVEL_3_SEVERE',
      scaleOutFraction: 1.0,
      explanation: `LEVEL_3_SEVERE_EXHAUSTION: Extreme RSI (${rsi14.toFixed(1)}), ${extensionPct.toFixed(1)}% above 20 EMA, 3.5x volume blow-off. Full tactical exit.`
    };
  }

  // Level 2: Confirmed exhaustion (>3x volume on rejection candle or RSI > 82 + 25% extension)
  if ((rsi14 >= 82 && extensionPct >= 25 && volRatio >= 2.5) || (volRatio >= 3.0 && isRejectionCandle && rsi14 >= 80)) {
    return {
      action: 'SCALE_OUT_50',
      severity: 'LEVEL_2_CONFIRMED',
      scaleOutFraction: 0.50,
      explanation: `LEVEL_2_CONFIRMED_EXHAUSTION: RSI ${rsi14.toFixed(1)} > 82 and price extended ${extensionPct.toFixed(1)}% on heavy volume. Scale out 50%.`
    };
  }

  // Level 1: Warning (RSI > 80 AND > 18% above 20 EMA)
  if (rsi14 >= 80 && extensionPct >= 18) {
    return {
      action: 'SCALE_OUT_25',
      severity: 'LEVEL_1_WARNING',
      scaleOutFraction: 0.25,
      explanation: `LEVEL_1_EXHAUSTION_WARNING: RSI ${rsi14.toFixed(1)} >= 80 and extension ${extensionPct.toFixed(1)}% > 18%. Scale out 25-33%.`
    };
  }

  return {
    action: 'NONE',
    severity: 'NORMAL',
    scaleOutFraction: 0,
    explanation: 'No parabolic exhaustion detected.'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTFOLIO CORRELATION GUARDRAIL
// ─────────────────────────────────────────────────────────────────────────────
export interface PortfolioPosition {
  symbol: string;
  sector: string;
  allocationPct: number;
}

export interface CorrelationGuardResult {
  allowed: boolean;
  proposedStockWeight: number;
  proposedSectorWeight: number;
  clusterExposure: number;
  rejectionReason?: string;
}

export function evaluatePortfolioCorrelationGuard(
  existingPositions: PortfolioPosition[],
  candidateSymbol: string,
  candidateSector: string,
  candidateWeightPct: number,
  correlationMatrix?: Record<string, Record<string, number>>
): CorrelationGuardResult {
  // 1. Single stock ceiling: <= 8%
  const currentStockPos = existingPositions.find(p => p.symbol.toUpperCase() === candidateSymbol.toUpperCase());
  const totalStockWeight = Number(((currentStockPos ? currentStockPos.allocationPct : 0) + candidateWeightPct).toFixed(2));
  if (totalStockWeight > 8.0) {
    return {
      allowed: false,
      proposedStockWeight: totalStockWeight,
      proposedSectorWeight: 0,
      clusterExposure: 0,
      rejectionReason: `SINGLE_STOCK_CEILING: Proposed weight ${totalStockWeight.toFixed(1)}% exceeds the 8.0% institutional ceiling.`
    };
  }

  // 2. Single sector ceiling: <= 25%
  const sectorPositions = existingPositions.filter(p => p.sector.toLowerCase() === candidateSector.toLowerCase());
  const currentSectorWeight = sectorPositions.reduce((acc, p) => acc + p.allocationPct, 0);
  const totalSectorWeight = Number((currentSectorWeight + candidateWeightPct).toFixed(2));
  if (totalSectorWeight > 25.0) {
    return {
      allowed: false,
      proposedStockWeight: totalStockWeight,
      proposedSectorWeight: totalSectorWeight,
      clusterExposure: 0,
      rejectionReason: `SECTOR_CEILING: Proposed sector weight ${totalSectorWeight.toFixed(1)}% for ${candidateSector} exceeds the 25.0% institutional ceiling.`
    };
  }

  // 3. Correlated cluster ceiling: Correlation >= 0.75 treated as one risk cluster, max 30%
  let clusterWeight = candidateWeightPct;
  if (correlationMatrix && correlationMatrix[candidateSymbol]) {
    for (const pos of existingPositions) {
      const corr = correlationMatrix[candidateSymbol][pos.symbol] ?? 0;
      if (corr >= 0.75) {
        clusterWeight += pos.allocationPct;
      }
    }
  } else {
    clusterWeight = totalSectorWeight;
  }
  clusterWeight = Number(clusterWeight.toFixed(2));

  if (clusterWeight > 30.0) {
    return {
      allowed: false,
      proposedStockWeight: totalStockWeight,
      proposedSectorWeight: totalSectorWeight,
      clusterExposure: clusterWeight,
      rejectionReason: `CORRELATION_CLUSTER_LIMIT: Highly correlated cluster exposure (${clusterWeight.toFixed(1)}%) exceeds the 30.0% ceiling.`
    };
  }

  return {
    allowed: true,
    proposedStockWeight: totalStockWeight,
    proposedSectorWeight: totalSectorWeight,
    clusterExposure: clusterWeight
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5-TIER STRATEGY HEALTH LIFECYCLE & AUTO-KILL SWITCH
// ─────────────────────────────────────────────────────────────────────────────
export type StrategyHealthStatus = 
  | 'ACTIVE'
  | 'WATCH'
  | 'DEGRADED'
  | 'RESEARCH_ONLY'
  | 'QUARANTINED';

export interface StrategyPerformanceProfile {
  strategyId: string;
  totalTrades: number;
  consecutiveLosses: number;
  expectancyR: number;
  profitFactor: number;
  winRate: number;
  avgWinR: number;
  avgLossR: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  expectedMaxDrawdownPct: number;
  regimeStats: Record<string, {
    trades: number;
    expectancyR: number;
    winRate: number;
    profitFactor: number;
  }>;
  sectorStats: Record<string, {
    trades: number;
    expectancyR: number;
  }>;
  lastUpdated: string;
  status: StrategyHealthStatus | 'PAUSED' | 'UNDER_REVIEW';
  quarantineDaysRemaining?: number;
}

export interface KillSwitchDecision {
  killSwitchTriggered: boolean;
  action: 'CONTINUE' | 'WATCH_WARNING' | 'DEGRADE_HALF_SIZE' | 'RESEARCH_ONLY' | 'QUARANTINE_PAUSE';
  status: StrategyHealthStatus;
  quarantineDays: number;
  rejectionReason?: string;
  explanation: string;
}

/**
 * 5-Tier Strategy Health Lifecycle & Kill Switch
 * Evaluates loss streaks, drawdown breaches, and statistical sample size.
 */
export function evaluateStrategyKillSwitch(profile: StrategyPerformanceProfile): KillSwitchDecision {
  const isLossStreak = profile.consecutiveLosses >= 6;
  const isDrawdownBreach = profile.currentDrawdownPct > 1.5 * Math.max(1.0, profile.expectedMaxDrawdownPct);

  // Severe failure: Auto-quarantine for 20 sessions
  if (isLossStreak || isDrawdownBreach) {
    const reason = isLossStreak
      ? `KILL_SWITCH_ACTIVE: Strategy ${profile.strategyId} reached ${profile.consecutiveLosses} consecutive losses (threshold: 6).`
      : `KILL_SWITCH_ACTIVE: Current drawdown ${profile.currentDrawdownPct.toFixed(1)}% exceeds 1.5x expected max (${(profile.expectedMaxDrawdownPct * 1.5).toFixed(1)}%).`;
    
    return {
      killSwitchTriggered: true,
      action: 'QUARANTINE_PAUSE',
      status: 'QUARANTINED',
      quarantineDays: 20,
      rejectionReason: reason,
      explanation: `${reason} Auto-quarantined for 20 trading days to prevent capital leakage.`
    };
  }

  // Statistical degradation with sufficient sample size (>= 20 trades)
  if (profile.totalTrades >= 20 && profile.expectancyR < -0.10) {
    return {
      killSwitchTriggered: true,
      action: 'RESEARCH_ONLY',
      status: 'RESEARCH_ONLY',
      quarantineDays: 30,
      rejectionReason: `STATISTICAL_FAILURE: Strategy ${profile.strategyId} negative expectancy (${profile.expectancyR.toFixed(2)}R) across ${profile.totalTrades} trades. Relegated to research.`,
      explanation: `Relegated to research only. Requires parameter retraining.`
    };
  }

  // Moderate degradation: reduce sizing to 50%
  if (profile.profitFactor < 1.0 || profile.expectancyR < 0) {
    return {
      killSwitchTriggered: false,
      action: 'DEGRADE_HALF_SIZE',
      status: 'DEGRADED',
      quarantineDays: 0,
      explanation: `WARNING: Strategy ${profile.strategyId} expectancy (${profile.expectancyR.toFixed(2)}R) or Profit Factor (${profile.profitFactor.toFixed(2)}) is sub-par. Allocate at 50% sizing.`
    };
  }

  // Mild warning
  if (profile.consecutiveLosses >= 4 || profile.currentDrawdownPct > profile.expectedMaxDrawdownPct) {
    return {
      killSwitchTriggered: false,
      action: 'WATCH_WARNING',
      status: 'WATCH',
      quarantineDays: 0,
      explanation: `WATCH: Strategy ${profile.strategyId} experiencing elevated drawdown or 4+ consecutive losses.`
    };
  }

  return {
    killSwitchTriggered: false,
    action: 'CONTINUE',
    status: 'ACTIVE',
    quarantineDays: 0,
    explanation: `Strategy ${profile.strategyId} operating within normal statistical parameters.`
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VERSIONED INDIAN EQUITIES TRANSACTION COST MODEL
// ─────────────────────────────────────────────────────────────────────────────

export interface CostSchedule {
  effectiveFrom: string;
  effectiveTo?: string;
  brokerageRatePct: number;
  maxBrokeragePerLegINR: number;
  sttDeliveryBuyPct: number;
  sttDeliverySellPct: number;
  sttIntradaySellPct: number;
  exchangeChargesPct: number;
  sebiTurnoverPct: number;
  stampDutyBuyPct: number;
  gstPct: number;
}

export const CURRENT_COST_SCHEDULE: CostSchedule = {
  effectiveFrom: '2024-10-01',
  brokerageRatePct: 0.0003, // 0.03%
  maxBrokeragePerLegINR: 20.0,
  sttDeliveryBuyPct: 0.001, // 0.1% buy
  sttDeliverySellPct: 0.001, // 0.1% sell
  sttIntradaySellPct: 0.00025, // 0.025% sell
  exchangeChargesPct: 0.0000345, // 0.00345%
  sebiTurnoverPct: 0.000001, // ₹10 per Cr
  stampDutyBuyPct: 0.00015, // 0.015%
  gstPct: 0.18 // 18%
};

export interface TradeCostInput {
  entryPrice: number;
  exitPrice: number;
  shares: number;
  advValue: number;
  tradeType: 'DELIVERY' | 'INTRADAY';
  costSchedule?: CostSchedule;
}

export interface TradeCostBreakdown {
  buyTurnover: number;
  sellTurnover: number;
  totalTurnover: number;
  brokerage: number;
  stt: number;
  exchangeCharges: number;
  sebiTurnoverCharges: number;
  stampDuty: number;
  gst: number;
  estimatedSlippage: number;
  totalFrictionalCost: number;
  frictionalCostPct: number;
  grossPnL: number;
  netRealizedPnL: number;
}

export function calculateTransactionCost(input: TradeCostInput): TradeCostBreakdown {
  const schedule = input.costSchedule || CURRENT_COST_SCHEDULE;
  const buyTurnover = input.entryPrice * input.shares;
  const sellTurnover = input.exitPrice * input.shares;
  const totalTurnover = buyTurnover + sellTurnover;

  // 1. Brokerage
  const buyBrokerage = Math.min(schedule.maxBrokeragePerLegINR, buyTurnover * schedule.brokerageRatePct);
  const sellBrokerage = Math.min(schedule.maxBrokeragePerLegINR, sellTurnover * schedule.brokerageRatePct);
  const brokerage = Number((buyBrokerage + sellBrokerage).toFixed(2));

  // 2. STT
  const stt = input.tradeType === 'DELIVERY'
    ? Number((buyTurnover * schedule.sttDeliveryBuyPct + sellTurnover * schedule.sttDeliverySellPct).toFixed(2))
    : Number((sellTurnover * schedule.sttIntradaySellPct).toFixed(2));

  // 3. Exchange Charges
  const exchangeCharges = Number((totalTurnover * schedule.exchangeChargesPct).toFixed(2));

  // 4. SEBI Charges
  const sebiTurnoverCharges = Number((totalTurnover * schedule.sebiTurnoverPct).toFixed(2));

  // 5. Stamp Duty (Buy leg only)
  const stampDuty = Number((buyTurnover * schedule.stampDutyBuyPct).toFixed(2));

  // 6. GST
  const gst = Number(((brokerage + exchangeCharges + sebiTurnoverCharges) * schedule.gstPct).toFixed(2));

  // 7. Dynamic Slippage based on ADV participation
  const tradeSizePctOfAdv = input.advValue > 0 ? (buyTurnover / input.advValue) * 100 : 2.0;
  const slippagePct = tradeSizePctOfAdv > 3.0 ? 0.0025 : tradeSizePctOfAdv > 1.0 ? 0.0015 : 0.0008;
  const estimatedSlippage = Number((totalTurnover * slippagePct).toFixed(2));

  const totalFrictionalCost = Number((brokerage + stt + exchangeCharges + sebiTurnoverCharges + stampDuty + gst + estimatedSlippage).toFixed(2));
  const frictionalCostPct = totalTurnover > 0 ? Number(((totalFrictionalCost / totalTurnover) * 100).toFixed(3)) : 0;
  
  const grossPnL = Number((sellTurnover - buyTurnover).toFixed(2));
  const netRealizedPnL = Number((grossPnL - totalFrictionalCost).toFixed(2));

  return {
    buyTurnover,
    sellTurnover,
    totalTurnover,
    brokerage,
    stt,
    exchangeCharges,
    sebiTurnoverCharges,
    stampDuty,
    gst,
    estimatedSlippage,
    totalFrictionalCost,
    frictionalCostPct,
    grossPnL,
    netRealizedPnL
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FALSE BREAKOUT CLASSIFICATION METRIC & INTRABAR AMBIGUITY RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

export interface FalseBreakoutInput {
  breakoutPrice: number;
  stopPrice: number;
  sessionCloses: number[];
  sessionHighs: number[];
  sessionLows: number[];
  orderingPolicy?: 'CONSERVATIVE' | 'OPTIMISTIC'; // Default CONSERVATIVE
}

export interface FalseBreakoutResult {
  isFalseBreakout: boolean;
  sessionsToFailure: number;
  maxRReached: number;
  failedSessionIndex: number;
  hasIntrabarAmbiguity: boolean;
  explanation: string;
}

/**
 * False Breakout Metric with Intrabar Ambiguity Resolution.
 * If both target (+1R) and stop (-1R) are touched within the same session,
 * applies conservative ordering (assumes stop hit first) unless lower-timeframe data resolves it.
 */
export function evaluateFalseBreakout(input: FalseBreakoutInput): FalseBreakoutResult {
  const rDistance = Math.abs(input.breakoutPrice - input.stopPrice);
  if (rDistance <= 0 || input.sessionCloses.length === 0) {
    return {
      isFalseBreakout: false,
      sessionsToFailure: 0,
      maxRReached: 0,
      failedSessionIndex: -1,
      hasIntrabarAmbiguity: false,
      explanation: 'Invalid price range or empty sessions.'
    };
  }

  const target1R = input.breakoutPrice + rDistance;
  const stop1R = input.stopPrice;
  let maxRReached = 0;
  let hit1R = false;
  let hasIntrabarAmbiguity = false;
  const policy = input.orderingPolicy || 'CONSERVATIVE';

  for (let i = 0; i < Math.min(5, input.sessionCloses.length); i++) {
    const high = input.sessionHighs[i] ?? input.sessionCloses[i];
    const low = input.sessionLows[i] ?? input.sessionCloses[i];
    const rCurrent = (high - input.breakoutPrice) / rDistance;
    if (rCurrent > maxRReached) maxRReached = Number(rCurrent.toFixed(2));

    const touchesTarget = high >= target1R;
    const touchesStop = low <= stop1R;

    // Detect Intrabar Ambiguity
    if (touchesTarget && touchesStop && !hit1R) {
      hasIntrabarAmbiguity = true;
      if (policy === 'CONSERVATIVE') {
        // Assume stop hit first
        return {
          isFalseBreakout: true,
          sessionsToFailure: i + 1,
          maxRReached,
          failedSessionIndex: i,
          hasIntrabarAmbiguity: true,
          explanation: `FALSE_BREAKOUT (AMBIGUOUS_INTRABAR_ORDER): Both +1R and -1R reached on session ${i + 1}. Resolved conservatively as stop hit.`
        };
      } else {
        hit1R = true;
      }
    } else if (touchesTarget) {
      hit1R = true;
    } else if (touchesStop && !hit1R) {
      return {
        isFalseBreakout: true,
        sessionsToFailure: i + 1,
        maxRReached,
        failedSessionIndex: i,
        hasIntrabarAmbiguity,
        explanation: `FALSE_BREAKOUT: Failed at session ${i + 1}. Hit -1R (₹${low}) before achieving +1R (₹${target1R.toFixed(2)}). Peak excursion was ${maxRReached}R.`
      };
    }
  }

  return {
    isFalseBreakout: false,
    sessionsToFailure: 0,
    maxRReached,
    failedSessionIndex: -1,
    hasIntrabarAmbiguity,
    explanation: hit1R
      ? `GENUINE_BREAKOUT: Achieved +1R target (₹${target1R.toFixed(2)}) with peak ${maxRReached}R excursion.`
      : `IN_PROGRESS: Price consolidating above -1R stop. Peak excursion: ${maxRReached}R.`
  };
}
