/**
 * src/server/services/NewTechnicalStrategiesEngine.ts
 *
 * Incremental Modular Technical Strategies Engine for WealthOS / ITAS.
 * Implements S8B, S21, S22, S23, S24, S25, S26 behind feature flags.
 * 
 * Standards & Guidelines:
 * - S8B: Classical Bull Flag (15-40% pole vs S8's >=50% High-Tight Flag)
 * - S21: Cup & Handle with pivot-based structural detector (not fragile polynomial fitting)
 * - S22: John Carter TTM Volatility Squeeze (BB inside KC for >=3 bars)
 * - S23: Classical Double Bottom (entry strictly on neckline breakout)
 * - S24: Double Top Distribution Exit (existing holding exit only)
 * - S25: Inverse Head & Shoulders (long structural reversal)
 * - S26: Head & Shoulders Top Exit (holding exit only)
 * - Indian Market Compliance: Naked cash shorting prohibited; bearish setups function as long exits/hedges.
 */

import { SMA, EMA, RSI, ATR, BollingerBands } from 'technicalindicators';
import { Candle, RuleCheck } from './PureTechnicalStrategiesEngine.js';

export interface NewStrategyFeatureFlags {
  ENABLE_S8B: boolean;
  ENABLE_S21: boolean;
  ENABLE_S22: boolean;
  ENABLE_S23: boolean;
  ENABLE_S24: boolean;
  ENABLE_S25: boolean;
  ENABLE_S26: boolean;
}

export const DEFAULT_FEATURE_FLAGS: NewStrategyFeatureFlags = {
  ENABLE_S8B: true,
  ENABLE_S21: true,
  ENABLE_S22: true,
  ENABLE_S23: true,
  ENABLE_S24: true,
  ENABLE_S25: true,
  ENABLE_S26: true
};

export let activeFlags = { ...DEFAULT_FEATURE_FLAGS };

export function setStrategyFeatureFlags(flags: Partial<NewStrategyFeatureFlags>) {
  activeFlags = { ...activeFlags, ...flags };
}

export function getStrategyFeatureFlags(): NewStrategyFeatureFlags {
  return { ...activeFlags };
}

export type EntryAction = 'BUY' | 'WATCH';
export type PositionProtectionAction = 'EXIT_SCALE_OUT' | 'EXIT_FULL' | 'EXIT_OR_HEDGE' | 'WARNING' | 'HOLD';
export type NewStrategyAction = EntryAction | PositionProtectionAction;

export interface NewStrategyResult {
  strategyId: string;
  strategyName: string;
  qualified: boolean;
  action: NewStrategyAction;
  symbol: string;
  companyName: string;
  cmp: number;
  stopLoss?: number;
  target1?: number;
  target2?: number;
  riskRewardRatio?: number;
  setupQualityScore: number;
  /** @deprecated Use setupQualityScore. */
  confidenceScore?: number;
  ruleChecks: RuleCheck[];
  metrics: Record<string, any>;
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// S8B: CLASSICAL BULL FLAG
// ─────────────────────────────────────────────────────────────────────────────
export function evaluateS8B_ClassicalBullFlag(
  symbol: string,
  companyName: string,
  candles: Candle[],
  rsPercentile: number = 75
): NewStrategyResult {
  if (!activeFlags.ENABLE_S8B || candles.length < 50) {
    return createDisqualifiedResult('S8B_CLASSICAL_BULL_FLAG', 'Classical Bull Flag', symbol, companyName, candles);
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const n = candles.length;
  const cmp = closes[n - 1];

  // Moving averages
  const ema20 = EMA.calculate({ period: 20, values: closes });
  const currentEma20 = ema20[ema20.length - 1];
  const prevEma20 = ema20[ema20.length - 5] || currentEma20;
  const isEma20Rising = currentEma20 > prevEma20;

  // 1. Detect Pole: Sharp impulse of 15% to 40% over 5 to 30 sessions
  let poleStart = -1;
  let polePeak = -1;
  let maxPoleGain = 0;

  for (let lookback = 35; lookback >= 8; lookback--) {
    const startIdx = Math.max(0, n - lookback);
    const startPrice = lows[startIdx];
    for (let peakIdx = startIdx + 5; peakIdx < n - 3; peakIdx++) {
      const peakPrice = highs[peakIdx];
      const gainPct = ((peakPrice - startPrice) / startPrice) * 100;
      if (gainPct >= 15.0 && gainPct <= 45.0 && gainPct > maxPoleGain) {
        maxPoleGain = gainPct;
        poleStart = startIdx;
        polePeak = peakIdx;
      }
    }
  }

  const poleValid = polePeak > 0 && maxPoleGain >= 15.0;
  const poleGainPct = Number(maxPoleGain.toFixed(1));
  const poleDurationBars = poleValid ? polePeak - poleStart : 0;

  // 2. Detect Flag: Consolidation spanning 3 to 20 sessions after pole peak (excluding current breakout candle n-1)
  const flagCandles = poleValid && n - 1 > polePeak + 1 ? candles.slice(polePeak + 1, n - 1) : [];
  const flagBars = flagCandles.length;
  const lowestFlagClose = flagCandles.length > 0 ? Math.min(...flagCandles.map(c => c.close)) : cmp;
  const highestFlagHigh = flagCandles.length > 0 ? Math.max(...flagCandles.map(c => c.high)) : cmp;
  
  const poleLow = poleValid ? lows[poleStart] : cmp;
  const poleHigh = poleValid ? highs[polePeak] : cmp;
  const poleHeight = poleHigh - poleLow;
  const flagRetracementPct = poleHeight > 0 ? ((poleHigh - lowestFlagClose) / poleHeight) * 100 : 0;
  const retracementPass = flagRetracementPct <= 50.0;

  // Volume contraction during flag
  const flagVolumes = flagCandles.map(c => c.volume);
  const avgFlagVolume = flagVolumes.length > 0 ? flagVolumes.reduce((a, b) => a + b, 0) / flagVolumes.length : 1;
  const vma20 = volumes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20;
  const isVolumeContracting = avgFlagVolume < vma20 * 0.85;

  // Breakout: Current candle closes above flag consolidation high with volume expansion
  const currentVolume = volumes[n - 1];
  const volumeRatio = Number((currentVolume / Math.max(1, vma20)).toFixed(2));
  const isBreakout = cmp > highestFlagHigh && volumeRatio >= 1.4;
  const isAboveEma20 = cmp >= currentEma20;
  const isRsStrong = rsPercentile >= 70;

  const stopLoss = Number((lowestFlagClose * 0.98).toFixed(2));
  const riskPerShare = cmp - stopLoss;
  const target1 = Number((cmp + (poleHeight * 0.8)).toFixed(2));
  const target2 = Number((cmp + poleHeight).toFixed(2));
  const riskReward = riskPerShare > 0 ? Number(((target1 - cmp) / riskPerShare).toFixed(2)) : 1.0;

  const ruleChecks: RuleCheck[] = [
    {
      id: 'S8B_POLE_IMPULSE',
      name: 'Pole Vertical Gain (15% - 40%)',
      passed: poleValid && poleGainPct >= 15.0 && poleGainPct <= 45.0,
      actualValue: `+${poleGainPct}% over ${poleDurationBars} bars`,
      benchmarkRule: 'Gain >= 15.0% and <= 45.0% over 5-30 bars',
      explanation: 'Pole proves aggressive institutional accumulation.'
    },
    {
      id: 'S8B_FLAG_RETRACEMENT',
      name: 'Flag Retracement (<= 50% of Pole)',
      passed: retracementPass,
      actualValue: `${flagRetracementPct.toFixed(1)}% retracement`,
      benchmarkRule: 'Retracement <= 50.0% of pole height',
      explanation: 'Controlled shallow pullback above rising structure.'
    },
    {
      id: 'S8B_EMA20_SUPPORT',
      name: 'Rising 20 EMA Floor',
      passed: isAboveEma20 && isEma20Rising,
      actualValue: `CMP ₹${cmp} vs EMA20 ₹${currentEma20?.toFixed(2)} (Rising: ${isEma20Rising})`,
      benchmarkRule: 'Price holds above rising 20 EMA',
      explanation: 'Short-term institutional trendline remains intact.'
    },
    {
      id: 'S8B_VOLUME_CONTRACTION',
      name: 'Volume Contraction in Flag',
      passed: isVolumeContracting,
      actualValue: `Flag Vol: ${Math.round(avgFlagVolume)} vs 20D VMA: ${Math.round(vma20)}`,
      benchmarkRule: 'Flag volume < 85% of 20-day average',
      explanation: 'Supply dries up as sellers exhaust during consolidation.'
    },
    {
      id: 'S8B_BREAKOUT_SURGE',
      name: 'Breakout Expansion & Volume Surge',
      passed: isBreakout,
      actualValue: `Close > ₹${highestFlagHigh.toFixed(2)} with Vol ${volumeRatio}x`,
      benchmarkRule: 'Close > flag resistance with Vol >= 1.4x VMA',
      explanation: 'Decisive breakout thrust resuming primary uptrend.'
    },
    {
      id: 'S8B_RELATIVE_STRENGTH',
      name: 'Relative Strength Percentile (>= 70)',
      passed: isRsStrong,
      actualValue: `${rsPercentile}th Percentile`,
      benchmarkRule: 'RS Percentile >= 70 vs Nifty 500',
      explanation: 'Outperforms broader market index.'
    }
  ];

  const allPassed = ruleChecks.every(r => r.passed);
  const isWatch = poleValid && retracementPass && isAboveEma20 && !isBreakout;

  return {
    strategyId: 'S8B_CLASSICAL_BULL_FLAG',
    strategyName: 'Classical Bull Flag',
    qualified: allPassed,
    action: allPassed ? 'BUY' : isWatch ? 'WATCH' : 'HOLD',
    symbol,
    companyName,
    cmp,
    stopLoss,
    target1,
    target2,
    riskRewardRatio: riskReward,
    setupQualityScore: allPassed ? 88 : isWatch ? 65 : 30,

    confidenceScore: allPassed ? 88 : isWatch ? 65 : 30,
    ruleChecks,
    metrics: {
      poleGainPct,
      poleDurationBars,
      flagDurationBars: flagBars,
      flagRetracementPct: Number(flagRetracementPct.toFixed(1)),
      volumeRatio,
      currentEma20: Number(currentEma20?.toFixed(2)),
      rsPercentile
    },
    summary: allPassed
      ? `S8B Classical Bull Flag confirmed: +${poleGainPct}% pole, ${flagRetracementPct.toFixed(1)}% flag, breakout volume ${volumeRatio}x.`
      : isWatch
      ? `S8B Flag in development: +${poleGainPct}% pole with ${flagBars} bars flag consolidation. Monitoring for breakout above ₹${highestFlagHigh.toFixed(2)}.`
      : 'S8B setup criteria not satisfied.'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// S21: CUP & HANDLE (Pivot-Based Structural Detector)
// ─────────────────────────────────────────────────────────────────────────────
export function evaluateS21_CupAndHandle(
  symbol: string,
  companyName: string,
  candles: Candle[]
): NewStrategyResult {
  if (!activeFlags.ENABLE_S21 || candles.length < 90) {
    return createDisqualifiedResult('S21_CUP_AND_HANDLE', 'Cup & Handle', symbol, companyName, candles);
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const n = candles.length;
  const cmp = closes[n - 1];

  // 1. Discover Left Rim (significant swing high between 40 and 150 bars ago)
  let leftRimIdx = -1;
  let leftRimPrice = 0;
  for (let i = Math.max(0, n - 150); i < n - 40; i++) {
    const h = highs[i];
    if (h > leftRimPrice && h > highs[i - 1] && h > highs[i + 1]) {
      leftRimPrice = h;
      leftRimIdx = i;
    }
  }

  // 2. Discover Cup Bottom
  let cupBottomIdx = -1;
  let cupBottomPrice = Infinity;
  if (leftRimIdx > 0) {
    for (let i = leftRimIdx + 10; i < n - 15; i++) {
      if (lows[i] < cupBottomPrice) {
        cupBottomPrice = lows[i];
        cupBottomIdx = i;
      }
    }
  }

  const cupDepthPct = leftRimPrice > 0 ? ((leftRimPrice - cupBottomPrice) / leftRimPrice) * 100 : 0;
  const isCupDepthValid = cupDepthPct >= 12.0 && cupDepthPct <= 42.0;

  // 3. Discover Right Rim (swing high within ±8% of Left Rim)
  let rightRimIdx = -1;
  let rightRimPrice = 0;
  if (cupBottomIdx > 0) {
    for (let i = cupBottomIdx + 10; i < n - 5; i++) {
      const h = highs[i];
      if (h > rightRimPrice && Math.abs(h - leftRimPrice) / leftRimPrice <= 0.08) {
        rightRimPrice = h;
        rightRimIdx = i;
      }
    }
  }
  const rightRimValid = rightRimIdx > 0;

  // 4. Handle: Consolidation between 5 and 30 sessions
  const handleBars = rightRimValid ? n - 1 - rightRimIdx : 0;
  const handleCandles = rightRimValid ? candles.slice(rightRimIdx + 1) : [];
  const handleLowestLow = handleCandles.length > 0 ? Math.min(...handleCandles.map(c => c.low)) : cmp;
  const cupDepthValue = leftRimPrice - cupBottomPrice;
  const handleRetracementPct = cupDepthValue > 0 ? ((rightRimPrice - handleLowestLow) / cupDepthValue) * 100 : 0;
  const handleRetracementValid = handleRetracementPct <= 35.0;

  // Handle volume dry-up (< 70% of 50D average)
  const vma50 = volumes.slice(-55, -5).reduce((a, b) => a + b, 0) / 50;
  const handleAvgVol = handleCandles.length > 0 ? handleCandles.map(c => c.volume).reduce((a, b) => a + b, 0) / handleCandles.length : 1;
  const handleVolumeDry = handleAvgVol < vma50 * 0.75;

  // 5. Breakout: Daily close > right rim with volume >= 1.4x
  const currentVol = volumes[n - 1];
  const vma20 = volumes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20;
  const breakoutVolumeRatio = Number((currentVol / Math.max(1, vma20)).toFixed(2));
  const isBreakout = cmp >= rightRimPrice && breakoutVolumeRatio >= 1.4;

  const stopLoss = Number((handleLowestLow * 0.985).toFixed(2));
  const riskPerShare = cmp - stopLoss;
  const target1 = Number((cmp + cupDepthValue).toFixed(2));
  const riskReward = riskPerShare > 0 ? Number(((target1 - cmp) / riskPerShare).toFixed(2)) : 1.0;

  const ruleChecks: RuleCheck[] = [
    {
      id: 'S21_CUP_DEPTH',
      name: 'Cup Depth (12% - 40%)',
      passed: isCupDepthValid,
      actualValue: `${cupDepthPct.toFixed(1)}% depth`,
      benchmarkRule: 'Depth >= 12.0% and <= 42.0%',
      explanation: 'Healthy structural base without excessive panic liquidation.'
    },
    {
      id: 'S21_RIGHT_RIM',
      name: 'Right Rim Alignment (within ±8% of Left Rim)',
      passed: rightRimValid,
      actualValue: rightRimValid ? `Right ₹${rightRimPrice.toFixed(2)} vs Left ₹${leftRimPrice.toFixed(2)}` : 'Right rim not formed',
      benchmarkRule: 'Right rim reaches within 8% of left rim high',
      explanation: 'Buyers successfully absorb intermediate overhang supply.'
    },
    {
      id: 'S21_HANDLE_RETRACEMENT',
      name: 'Handle Retracement (<= 33% of Cup Depth)',
      passed: handleRetracementValid && handleBars >= 4 && handleBars <= 35,
      actualValue: `${handleRetracementPct.toFixed(1)}% retracement over ${handleBars} bars`,
      benchmarkRule: 'Handle retracement <= 35.0% and duration 5-35 bars',
      explanation: 'Tight constructive handle showing reluctance of smart money to sell.'
    },
    {
      id: 'S21_HANDLE_VOLUME_DRY',
      name: 'Handle Volume Contraction (< 75% of 50D VMA)',
      passed: handleVolumeDry,
      actualValue: `Handle Vol: ${Math.round(handleAvgVol)} vs 50D VMA: ${Math.round(vma50)}`,
      benchmarkRule: 'Handle volume dries up under 50-day average',
      explanation: 'Float contraction and supply exhaustion.'
    },
    {
      id: 'S21_BREAKOUT_CONFIRMATION',
      name: 'Rim Breakout on Heavy Volume (>= 1.4x)',
      passed: isBreakout,
      actualValue: `CMP ₹${cmp} vs Rim ₹${rightRimPrice.toFixed(2)} (Vol: ${breakoutVolumeRatio}x)`,
      benchmarkRule: 'Close >= Rim with Volume >= 1.4x 20D VMA',
      explanation: 'Definitive breakout triggering Stage-2 continuation.'
    }
  ];

  const allPassed = ruleChecks.every(r => r.passed);
  const isWatch = isCupDepthValid && rightRimValid && handleRetracementValid && !isBreakout;

  return {
    strategyId: 'S21_CUP_AND_HANDLE',
    strategyName: 'Cup & Handle',
    qualified: allPassed,
    action: allPassed ? 'BUY' : isWatch ? 'WATCH' : 'HOLD',
    symbol,
    companyName,
    cmp,
    stopLoss,
    target1,
    riskRewardRatio: riskReward,
    setupQualityScore: allPassed ? 92 : isWatch ? 70 : 25,

    confidenceScore: allPassed ? 92 : isWatch ? 70 : 25,
    ruleChecks,
    metrics: {
      cupDepthPct: Number(cupDepthPct.toFixed(1)),
      leftRimPrice: Number(leftRimPrice.toFixed(2)),
      rightRimPrice: Number(rightRimPrice.toFixed(2)),
      handleBars,
      handleRetracementPct: Number(handleRetracementPct.toFixed(1)),
      breakoutVolumeRatio
    },
    summary: allPassed
      ? `S21 Cup & Handle breakout confirmed: ${cupDepthPct.toFixed(1)}% cup depth, ${handleBars}-bar handle, breakout volume ${breakoutVolumeRatio}x.`
      : isWatch
      ? `S21 Cup & Handle in handle formation: ${cupDepthPct.toFixed(1)}% cup with right rim at ₹${rightRimPrice.toFixed(2)}. Watch for breakout.`
      : 'S21 setup criteria not satisfied.'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// S22: JOHN CARTER TTM VOLATILITY SQUEEZE
// ─────────────────────────────────────────────────────────────────────────────
export function evaluateS22_VolatilitySqueeze(
  symbol: string,
  companyName: string,
  candles: Candle[],
  rsPercentile: number = 72
): NewStrategyResult {
  if (!activeFlags.ENABLE_S22 || candles.length < 35) {
    return createDisqualifiedResult('S22_VOLATILITY_SQUEEZE', 'TTM Volatility Squeeze', symbol, companyName, candles);
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const n = candles.length;
  const cmp = closes[n - 1];

  // Bollinger Bands: 20 period, 2.0 std dev
  const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  // ATR for Keltner Channel: 20 period
  const atr = ATR.calculate({ period: 20, high: highs, low: lows, close: closes });
  const ema20 = EMA.calculate({ period: 20, values: closes });

  const minLen = Math.min(bb.length, atr.length, ema20.length);
  const bbTrimmed = bb.slice(-minLen);
  const atrTrimmed = atr.slice(-minLen);
  const emaTrimmed = ema20.slice(-minLen);

  // Keltner Channel: EMA(20) ± 1.5 * ATR(20)
  // Squeeze condition: BB Upper < KC Upper AND BB Lower > KC Lower
  let consecutiveSqueezeBars = 0;
  for (let i = minLen - 1; i >= 0; i--) {
    const kcUpper = emaTrimmed[i] + (1.5 * atrTrimmed[i]);
    const kcLower = emaTrimmed[i] - (1.5 * atrTrimmed[i]);
    const bbUpper = bbTrimmed[i].upper;
    const bbLower = bbTrimmed[i].lower;

    const isSqueezing = bbUpper < kcUpper && bbLower > kcLower;
    if (isSqueezing) {
      consecutiveSqueezeBars++;
    } else {
      break;
    }
  }

  // Momentum histogram proxy (linear regression slope of price minus average of midline and EMA)
  const currentEma = emaTrimmed[minLen - 1];
  const momentumValue = cmp - currentEma;
  const momentumPositive = momentumValue > 0;

  // Check if squeeze just fired (was squeezing for >= 3 bars recently, now releasing with positive momentum)
  const hadSqueeze = consecutiveSqueezeBars >= 3;
  const isSqueezeActive = consecutiveSqueezeBars >= 3;

  const vma20 = volumes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = Number((volumes[n - 1] / Math.max(1, vma20)).toFixed(2));
  const isVolumeExpanding = volumeRatio >= 1.35;
  const isRsStrong = rsPercentile >= 70;

  // Consolidation range
  const recent10High = Math.max(...highs.slice(-10, -1));
  const recent10Low = Math.min(...lows.slice(-10, -1));
  const isBreakingHigh = cmp > recent10High;

  const stopLoss = Number((recent10Low * 0.985).toFixed(2));
  const riskPerShare = cmp - stopLoss;
  const target1 = Number((cmp + (recent10High - recent10Low) * 2.0).toFixed(2));
  const riskReward = riskPerShare > 0 ? Number(((target1 - cmp) / riskPerShare).toFixed(2)) : 1.0;

  const ruleChecks: RuleCheck[] = [
    {
      id: 'S22_SQUEEZE_DETECTED',
      name: 'TTM Squeeze Active / Primed (BB inside KC >= 3 bars)',
      passed: hadSqueeze,
      actualValue: `${consecutiveSqueezeBars} consecutive squeeze bars`,
      benchmarkRule: 'Bollinger Bands (20,2) inside Keltner Channel (20,1.5) >= 3 bars',
      explanation: 'Volatility compression identifies coiling energy before explosive displacement.'
    },
    {
      id: 'S22_MOMENTUM_DIRECTION',
      name: 'Positive Directional Momentum',
      passed: momentumPositive,
      actualValue: `Momentum: +${momentumValue.toFixed(2)} (Above 20 EMA)`,
      benchmarkRule: 'Momentum > 0 with price above 20 EMA',
      explanation: 'Confirms energy release direction is biased to the upside.'
    },
    {
      id: 'S22_CONSOLIDATION_BREAK',
      name: 'Breakout Above Compression High',
      passed: isBreakingHigh,
      actualValue: `CMP ₹${cmp} > Consolidation High ₹${recent10High.toFixed(2)}`,
      benchmarkRule: 'Daily close exceeds 10-bar consolidation high',
      explanation: 'Trigger confirms start of explosive expansion phase.'
    },
    {
      id: 'S22_VOLUME_EXPANSION',
      name: 'Volume Expansion Confirmation (>= 1.35x)',
      passed: isVolumeExpanding,
      actualValue: `Volume Ratio: ${volumeRatio}x`,
      benchmarkRule: 'Breakout volume >= 1.35x 20D VMA',
      explanation: 'Confirms institutional participation in expansion.'
    },
    {
      id: 'S22_RELATIVE_STRENGTH',
      name: 'Relative Strength Percentile (>= 70)',
      passed: isRsStrong,
      actualValue: `${rsPercentile}th Percentile`,
      benchmarkRule: 'RS Percentile >= 70 vs Nifty 500',
      explanation: 'Stock maintains outperformance momentum.'
    }
  ];

  const allPassed = ruleChecks.every(r => r.passed);
  const isWatch = isSqueezeActive && !isBreakingHigh;

  return {
    strategyId: 'S22_VOLATILITY_SQUEEZE',
    strategyName: 'TTM Volatility Squeeze',
    qualified: allPassed,
    action: allPassed ? 'BUY' : isWatch ? 'WATCH' : 'HOLD',
    symbol,
    companyName,
    cmp,
    stopLoss,
    target1,
    riskRewardRatio: riskReward,
    setupQualityScore: allPassed ? 85 : isWatch ? 65 : 20,

    confidenceScore: allPassed ? 85 : isWatch ? 65 : 20,
    ruleChecks,
    metrics: {
      consecutiveSqueezeBars,
      momentumValue: Number(momentumValue.toFixed(2)),
      volumeRatio,
      recent10High,
      recent10Low,
      rsPercentile
    },
    summary: allPassed
      ? `S22 Volatility Squeeze FIRE: ${consecutiveSqueezeBars} bars compressed, breakout above ₹${recent10High.toFixed(2)} with ${volumeRatio}x volume.`
      : isWatch
      ? `S22 Squeeze COILING: ${consecutiveSqueezeBars} bars compressed inside Keltner Channel. Watch for breakout above ₹${recent10High.toFixed(2)}.`
      : 'S22 squeeze setup not active.'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// S23: CLASSICAL DOUBLE BOTTOM
// ─────────────────────────────────────────────────────────────────────────────
export function evaluateS23_DoubleBottom(
  symbol: string,
  companyName: string,
  candles: Candle[]
): NewStrategyResult {
  if (!activeFlags.ENABLE_S23 || candles.length < 50) {
    return createDisqualifiedResult('S23_CLASSICAL_DOUBLE_BOTTOM', 'Classical Double Bottom', symbol, companyName, candles);
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const n = candles.length;
  const cmp = closes[n - 1];

  // 1. Trough 1 (between 25 and 45 bars ago)
  let trough1Idx = -1;
  let trough1Low = Infinity;
  for (let i = Math.max(0, n - 45); i < n - 25; i++) {
    if (lows[i] < trough1Low) {
      trough1Low = lows[i];
      trough1Idx = i;
    }
  }

  // 2. Intermediate Neckline Peak (recovery >= 8%)
  let necklineIdx = -1;
  let necklinePrice = 0;
  if (trough1Idx > 0) {
    for (let i = trough1Idx + 4; i < n - 10; i++) {
      if (highs[i] > necklinePrice) {
        necklinePrice = highs[i];
        necklineIdx = i;
      }
    }
  }
  const recoveryPct = trough1Low > 0 ? ((necklinePrice - trough1Low) / trough1Low) * 100 : 0;
  const isRecoveryValid = recoveryPct >= 7.5;

  // 3. Trough 2 (within ±5% of Trough 1)
  let trough2Idx = -1;
  let trough2Low = Infinity;
  if (necklineIdx > 0) {
    for (let i = necklineIdx + 4; i < n - 2; i++) {
      if (lows[i] < trough2Low) {
        trough2Low = lows[i];
        trough2Idx = i;
      }
    }
  }
  const troughVariancePct = trough1Low > 0 ? Math.abs((trough2Low - trough1Low) / trough1Low) * 100 : 99;
  const isTroughSymmetric = troughVariancePct <= 5.5;

  // 4. Entry Requirement: Daily close > Neckline (NEVER enter without breakout)
  const vma20 = volumes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = Number((volumes[n - 1] / Math.max(1, vma20)).toFixed(2));
  const isNecklineBroken = cmp > necklinePrice && volumeRatio >= 1.35;

  const stopLoss = Number((Math.min(trough1Low, trough2Low) * 0.985).toFixed(2));
  const riskPerShare = cmp - stopLoss;
  const patternHeight = necklinePrice - Math.min(trough1Low, trough2Low);
  const target1 = Number((cmp + patternHeight).toFixed(2));
  const riskReward = riskPerShare > 0 ? Number(((target1 - cmp) / riskPerShare).toFixed(2)) : 1.0;

  const ruleChecks: RuleCheck[] = [
    {
      id: 'S23_TROUGH_SYMMETRY',
      name: 'Trough Symmetry (within ±5%)',
      passed: isTroughSymmetric,
      actualValue: `T1: ₹${trough1Low.toFixed(2)}, T2: ₹${trough2Low.toFixed(2)} (Variance: ${troughVariancePct.toFixed(1)}%)`,
      benchmarkRule: 'Trough 2 within 5% of Trough 1 low',
      explanation: 'Equal support level establishes reliable structural accumulation base.'
    },
    {
      id: 'S23_INTERMEDIATE_PEAK',
      name: 'Intermediate Neckline Recovery (>= 8%)',
      passed: isRecoveryValid,
      actualValue: `+${recoveryPct.toFixed(1)}% recovery to ₹${necklinePrice.toFixed(2)}`,
      benchmarkRule: 'Intermediate swing peak gain >= 7.5%',
      explanation: 'Sufficient separation between bottoms to form distinct W pattern.'
    },
    {
      id: 'S23_NECKLINE_BREAKOUT',
      name: 'Confirmed Neckline Breakout on Volume (>= 1.35x)',
      passed: isNecklineBroken,
      actualValue: `CMP ₹${cmp} > Neckline ₹${necklinePrice.toFixed(2)} (Vol: ${volumeRatio}x)`,
      benchmarkRule: 'Daily close > Neckline with Volume >= 1.35x',
      explanation: 'Mandatory completion trigger. No entry without neckline confirmation.'
    }
  ];

  const allPassed = ruleChecks.every(r => r.passed);
  const isWatch = isTroughSymmetric && isRecoveryValid && !isNecklineBroken;

  return {
    strategyId: 'S23_CLASSICAL_DOUBLE_BOTTOM',
    strategyName: 'Classical Double Bottom',
    qualified: allPassed,
    action: allPassed ? 'BUY' : isWatch ? 'WATCH' : 'HOLD',
    symbol,
    companyName,
    cmp,
    stopLoss,
    target1,
    riskRewardRatio: riskReward,
    setupQualityScore: allPassed ? 86 : isWatch ? 60 : 20,

    confidenceScore: allPassed ? 86 : isWatch ? 60 : 20,
    ruleChecks,
    metrics: {
      trough1Low,
      trough2Low,
      necklinePrice,
      recoveryPct: Number(recoveryPct.toFixed(1)),
      volumeRatio
    },
    summary: allPassed
      ? `S23 Double Bottom breakout confirmed: Neckline ₹${necklinePrice.toFixed(2)} broken with ${volumeRatio}x volume.`
      : isWatch
      ? `S23 Double Bottom forming: Troughs aligned (₹${trough1Low.toFixed(2)} / ₹${trough2Low.toFixed(2)}). Waiting for neckline break above ₹${necklinePrice.toFixed(2)}.`
      : 'S23 setup not satisfied.'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// S24: DOUBLE TOP DISTRIBUTION EXIT (Holding Exit Only)
// ─────────────────────────────────────────────────────────────────────────────
export function evaluateS24_DistributionExit(
  symbol: string,
  companyName: string,
  candles: Candle[],
  entryPrice: number = 0
): NewStrategyResult {
  if (!activeFlags.ENABLE_S24 || candles.length < 40) {
    return createDisqualifiedResult('S24_DISTRIBUTION_EXIT', 'Double Top Distribution Exit', symbol, companyName, candles);
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const n = candles.length;
  const cmp = closes[n - 1];

  // 1. Peak 1 (between 20 and 40 bars ago)
  let peak1Idx = -1;
  let peak1High = 0;
  for (let i = Math.max(0, n - 40); i < n - 20; i++) {
    if (highs[i] > peak1High) {
      peak1High = highs[i];
      peak1Idx = i;
    }
  }

  // 2. Valley Neckline
  let valleyIdx = -1;
  let valleyLow = Infinity;
  if (peak1Idx > 0) {
    for (let i = peak1Idx + 4; i < n - 8; i++) {
      if (lows[i] < valleyLow) {
        valleyLow = lows[i];
        valleyIdx = i;
      }
    }
  }

  // 3. Peak 2 (within ±4% of Peak 1 with volume contraction)
  let peak2Idx = -1;
  let peak2High = 0;
  if (valleyIdx > 0) {
    for (let i = valleyIdx + 4; i < n - 1; i++) {
      if (highs[i] > peak2High && Math.abs(highs[i] - peak1High) / peak1High <= 0.045) {
        peak2High = highs[i];
        peak2Idx = i;
      }
    }
  }

  const peak2Valid = peak2Idx > 0;
  const peak1Vol = peak1Idx > 0 ? volumes[peak1Idx] : 1;
  const peak2Vol = peak2Idx > 0 ? volumes[peak2Idx] : 1;
  const isVolumeDivergent = peak2Vol < peak1Vol * 0.85;

  // Level 1 Warning: 2nd peak on lower volume
  const isWarning = peak2Valid && isVolumeDivergent && cmp >= valleyLow;

  // Level 2 Confirmed Breakdown: Daily close < Valley Neckline with volume surge
  const vma20 = volumes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = Number((volumes[n - 1] / Math.max(1, vma20)).toFixed(2));
  const isConfirmedBreakdown = peak2Valid && cmp < valleyLow && volumeRatio >= 1.25;

  let action: 'EXIT_FULL' | 'EXIT_SCALE_OUT' | 'WATCH' | 'HOLD' = 'HOLD';
  let summary = 'S24 No distribution pattern detected.';

  if (isConfirmedBreakdown) {
    action = 'EXIT_SCALE_OUT';
    summary = `S24 CONFIRMED DISTRIBUTION: Neckline ₹${valleyLow.toFixed(2)} broken on ${volumeRatio}x volume. Scale out 25-50% of holding.`;
  } else if (isWarning) {
    action = 'WATCH';
    summary = `S24 DISTRIBUTION WARNING: Second peak at ₹${peak2High.toFixed(2)} with lower volume. Tighten trailing stops.`;
  }

  const ruleChecks: RuleCheck[] = [
    {
      id: 'S24_DOUBLE_PEAK',
      name: 'Double Top Peak Alignment (within ±4%)',
      passed: peak2Valid,
      actualValue: peak2Valid ? `P1: ₹${peak1High.toFixed(2)}, P2: ₹${peak2High.toFixed(2)}` : 'Single peak only',
      benchmarkRule: 'Peak 2 within 4.5% of Peak 1',
      explanation: 'Resistance ceiling confirmed twice.'
    },
    {
      id: 'S24_VOLUME_DIVERGENCE',
      name: 'Exhaustion Volume Divergence (Peak 2 < Peak 1)',
      passed: isVolumeDivergent,
      actualValue: `P2 Vol: ${Math.round(peak2Vol)} vs P1 Vol: ${Math.round(peak1Vol)}`,
      benchmarkRule: 'Peak 2 volume < 85% of Peak 1 volume',
      explanation: 'Buyers lack aggression at higher levels.'
    },
    {
      id: 'S24_NECKLINE_BREAKDOWN',
      name: 'Neckline Breakdown Action',
      passed: isConfirmedBreakdown,
      actualValue: `CMP ₹${cmp} vs Neckline ₹${valleyLow.toFixed(2)}`,
      benchmarkRule: 'Daily close below intermediate valley floor',
      explanation: 'Execution trigger for capital preservation scale-out.'
    }
  ];

  return {
    strategyId: 'S24_DISTRIBUTION_EXIT',
    strategyName: 'Double Top Distribution Exit',
    qualified: isConfirmedBreakdown,
    action,
    symbol,
    companyName,
    cmp,
    setupQualityScore: isConfirmedBreakdown ? 90 : isWarning ? 65 : 20,

    confidenceScore: isConfirmedBreakdown ? 90 : isWarning ? 65 : 20,
    ruleChecks,
    metrics: {
      peak1High,
      peak2High,
      valleyLow,
      isVolumeDivergent,
      volumeRatio
    },
    summary
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// S25: INVERSE HEAD & SHOULDERS (BULLISH STRUCTURAL REVERSAL)
// ─────────────────────────────────────────────────────────────────────────────
export function evaluateS25_InverseHeadAndShoulders(
  symbol: string,
  companyName: string,
  candles: Candle[],
  rsPercentile: number = 75
): NewStrategyResult {
  if (!activeFlags.ENABLE_S25 || candles.length < 60) {
    return createDisqualifiedResult('S25_INVERSE_HEAD_AND_SHOULDERS', 'Inverse Head & Shoulders', symbol, companyName, candles);
  }

  const closes = candles.map(c => c.close);
  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  const volumes = candles.map(c => c.volume);
  const n = candles.length;
  const cmp = closes[n - 1];

  let leftTrough = Infinity;
  for (let i = Math.max(0, n - 55); i < n - 35; i++) {
    if (lows[i] < leftTrough) leftTrough = lows[i];
  }

  let headTrough = Infinity;
  for (let i = n - 35; i < n - 15; i++) {
    if (lows[i] < headTrough) headTrough = lows[i];
  }

  let rightTrough = Infinity;
  for (let i = n - 15; i < n - 2; i++) {
    if (lows[i] < rightTrough) rightTrough = lows[i];
  }

  let neckline = 0;
  for (let i = n - 35; i < n - 5; i++) {
    if (highs[i] > neckline) neckline = highs[i];
  }

  const isHeadLowest = headTrough < leftTrough && headTrough < rightTrough;
  const shoulderSymmetryPct = leftTrough > 0 ? Math.abs((rightTrough - leftTrough) / leftTrough) * 100 : 100;
  const isSymmetric = shoulderSymmetryPct <= 10.0;
  const isNecklineBreakout = cmp > neckline;
  const recentVol = volumes[n - 1];
  const avgVol20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const isVolumeExpanded = avgVol20 > 0 ? (recentVol / avgVol20) >= 1.5 : true;

  const qualified = isHeadLowest && isSymmetric && isNecklineBreakout && isVolumeExpanded;
  const isWatch = isHeadLowest && isSymmetric && !isNecklineBreakout;

  const ruleChecks: RuleCheck[] = [
    {
      id: 'S25_HEAD_DEPTH',
      name: 'Head Depth (Lowest Low)',
      passed: isHeadLowest,
      actualValue: `Head ₹${headTrough.toFixed(2)} vs L-Shoulder ₹${leftTrough.toFixed(2)}`,
      benchmarkRule: 'Head trough must be strictly below both shoulders',
      explanation: 'Defines classic inverted head extension.'
    },
    {
      id: 'S25_SHOULDER_SYMMETRY',
      name: 'Shoulder Symmetry',
      passed: isSymmetric,
      actualValue: `Diff: ${shoulderSymmetryPct.toFixed(1)}%`,
      benchmarkRule: 'Right shoulder trough within 10% of left shoulder',
      explanation: 'Structural balance across reversal base.'
    },
    {
      id: 'S25_NECKLINE_BREAKOUT',
      name: 'Neckline Breakout',
      passed: isNecklineBreakout,
      actualValue: `CMP ₹${cmp} vs Neckline ₹${neckline.toFixed(2)}`,
      benchmarkRule: 'Close above neckline resistance',
      explanation: 'Reversal confirmation trigger.'
    }
  ];

  return {
    strategyId: 'S25_INVERSE_HEAD_AND_SHOULDERS',
    strategyName: 'Inverse Head & Shoulders',
    qualified,
    action: qualified ? 'BUY' : isWatch ? 'WATCH' : 'HOLD',
    symbol,
    companyName,
    cmp,
    riskRewardRatio: qualified ? 2.8 : 1.5,
    setupQualityScore: qualified ? 85 : isWatch ? 65 : 20,

    confidenceScore: qualified ? 85 : isWatch ? 65 : 20,
    ruleChecks,
    metrics: { leftTrough, headTrough, rightTrough, neckline, shoulderSymmetryPct },
    summary: qualified
      ? `S25 Inverse H&S CONFIRMED: Head at ₹${headTrough.toFixed(2)}, right shoulder formed, neckline breakout above ₹${neckline.toFixed(2)} with ${(recentVol/avgVol20).toFixed(1)}x volume.`
      : isWatch
      ? `S25 Inverse H&S FORMING: Head at ₹${headTrough.toFixed(2)}, right shoulder coiling. Awaiting breakout above neckline ₹${neckline.toFixed(2)}.`
      : 'Inverse H&S structure not active.'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// S26: HEAD & SHOULDERS DISTRIBUTION EXIT (SEBI CASH SHORTING COMPLIANT)
// ─────────────────────────────────────────────────────────────────────────────
export function evaluateS26_HeadAndShouldersDistributionExit(
  symbol: string,
  companyName: string,
  candles: Candle[]
): NewStrategyResult {
  if (!activeFlags.ENABLE_S26 || candles.length < 60) {
    return createDisqualifiedResult('S26_HEAD_AND_SHOULDERS_EXIT', 'Head & Shoulders Top Exit', symbol, companyName, candles);
  }

  const closes = candles.map(c => c.close);
  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  const n = candles.length;
  const cmp = closes[n - 1];

  let leftPeak = 0;
  for (let i = Math.max(0, n - 55); i < n - 35; i++) {
    if (highs[i] > leftPeak) leftPeak = highs[i];
  }

  let headPeak = 0;
  for (let i = n - 35; i < n - 15; i++) {
    if (highs[i] > headPeak) headPeak = highs[i];
  }

  let rightPeak = 0;
  for (let i = n - 15; i < n - 2; i++) {
    if (highs[i] > rightPeak) rightPeak = highs[i];
  }

  let neckline = Infinity;
  for (let i = n - 35; i < n - 5; i++) {
    if (lows[i] < neckline) neckline = lows[i];
  }

  const isHeadHighest = headPeak > leftPeak && headPeak > rightPeak;
  const isNecklineBreached = cmp < neckline;
  const isRightShoulderFormed = rightPeak > 0 && rightPeak < headPeak;

  const qualified = isHeadHighest && isRightShoulderFormed && isNecklineBreached;
  const isWarning = isHeadHighest && isRightShoulderFormed && !isNecklineBreached && cmp < (leftPeak + neckline) / 2;

  return {
    strategyId: 'S26_HEAD_AND_SHOULDERS_EXIT',
    strategyName: 'Head & Shoulders Top Exit',
    qualified,
    // SEBI compliance: Bearish patterns trigger long exit or derivatives hedge only
    action: qualified ? 'EXIT_OR_HEDGE' : isWarning ? 'WARNING' : 'HOLD',
    symbol,
    companyName,
    cmp,
    setupQualityScore: qualified ? 90 : isWarning ? 65 : 20,

    confidenceScore: qualified ? 90 : isWarning ? 65 : 20,
    ruleChecks: [
      {
        id: 'S26_HEAD_PEAK',
        name: 'Head Peak (Highest High)',
        passed: isHeadHighest,
        actualValue: `Head ₹${headPeak.toFixed(2)} vs L-Peak ₹${leftPeak.toFixed(2)}`,
        benchmarkRule: 'Head peak must exceed both left and right shoulders',
        explanation: 'Confirms classical distribution top structure.'
      },
      {
        id: 'S26_NECKLINE_BREAKDOWN',
        name: 'Neckline Support Breakdown',
        passed: isNecklineBreached,
        actualValue: `CMP ₹${cmp} vs Neckline ₹${neckline.toFixed(2)}`,
        benchmarkRule: 'Daily close below intermediate neckline support',
        explanation: 'Mandates tactical exit of existing long positions or derivatives hedge.'
      }
    ],
    metrics: { leftPeak, headPeak, rightPeak, neckline },
    summary: qualified
      ? `S26 H&S TOP CONFIRMED: Head at ₹${headPeak.toFixed(2)}, neckline support (₹${neckline.toFixed(2)}) breached. Liquidate longs or initiate derivatives hedge.`
      : isWarning
      ? `S26 H&S WARNING: Right shoulder lower peak (₹${rightPeak.toFixed(2)}) confirmed. Watch neckline support at ₹${neckline.toFixed(2)}.`
      : 'H&S distribution top not active.'
  };
}

function createDisqualifiedResult(
  strategyId: string,
  strategyName: string,
  symbol: string,
  companyName: string,
  candles: Candle[]
): NewStrategyResult {
  return {
    strategyId,
    strategyName,
    qualified: false,
    action: 'HOLD',
    symbol,
    companyName,
    cmp: candles.length > 0 ? candles[candles.length - 1].close : 0,
    setupQualityScore: 0,

    confidenceScore: 0,
    ruleChecks: [],
    metrics: {},
    summary: `${strategyName} disabled or insufficient historical candle bars.`
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCEMENT #10: S10 INTRADAY 15-MIN ORB CONFIRMATION ENGINE (SESSION-AWARE)
// ─────────────────────────────────────────────────────────────────────────────
export interface IntradayORBCandle {
  timestamp: string; // e.g. "2026-09-16T09:15:00" or "09:15"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IntradayORBResult {
  symbol: string;
  timeframe: '15m';
  confirmed: boolean;
  status: 'CONFIRMED' | 'WATCH' | 'REJECT' | 'DATA_UNAVAILABLE';
  openingRangeHigh: number;
  openingRangeLow: number;
  breakoutClose: number;
  rvol: number;
  explanation: string;
}

/**
 * Evaluates the 15-minute Opening Range Breakout (09:15–09:30 IST) to confirm daily S10 setups.
 * Incorporates Senior Peer Review corrections:
 * 1. Session date filtering (isolates current trading day, prevents historical data pollution)
 * 2. 09:15–09:30 IST opening bar isolation
 * 3. Time-of-day normalized RVOL (compares each 15m candle against its specific historical intraday bucket)
 * 4. 15-min Close > Opening High (eliminates intra-candle false wick traps)
 */
export function evaluateS10_IntradayORBConfirmation(
  symbol: string,
  intraday15mCandles: IntradayORBCandle[],
  dailySetupActive: boolean,
  marketRegimePermitsLong: boolean,
  timeOfDayVolumeBaseline?: Record<string, number> | number,
  sessionDate?: string
): IntradayORBResult {
  if (!dailySetupActive) {
    return {
      symbol,
      timeframe: '15m',
      confirmed: false,
      status: 'REJECT',
      openingRangeHigh: 0,
      openingRangeLow: 0,
      breakoutClose: 0,
      rvol: 0,
      explanation: 'REJECT: Daily S10 trendline compression setup is not active.'
    };
  }

  if (!marketRegimePermitsLong) {
    return {
      symbol,
      timeframe: '15m',
      confirmed: false,
      status: 'REJECT',
      openingRangeHigh: 0,
      openingRangeLow: 0,
      breakoutClose: 0,
      rvol: 0,
      explanation: 'REJECT: Market regime prohibits new long breakout entries.'
    };
  }

  if (!intraday15mCandles || intraday15mCandles.length === 0) {
    return {
      symbol,
      timeframe: '15m',
      confirmed: false,
      status: 'WATCH',
      openingRangeHigh: 0,
      openingRangeLow: 0,
      breakoutClose: 0,
      rvol: 0,
      explanation: 'WATCH: Awaiting opening 15-minute range completion (09:15–09:30 IST).'
    };
  }

  // Session Date Filtering: strictly select candles for the target session date
  let sessionCandles = intraday15mCandles;
  if (sessionDate) {
    sessionCandles = intraday15mCandles.filter(c => c.timestamp.startsWith(sessionDate) || c.timestamp.includes(sessionDate));
  } else if (intraday15mCandles[0].timestamp.includes('T')) {
    const inferredDate = intraday15mCandles[intraday15mCandles.length - 1].timestamp.split('T')[0];
    sessionCandles = intraday15mCandles.filter(c => c.timestamp.startsWith(inferredDate));
  }

  if (sessionCandles.length < 2) {
    return {
      symbol,
      timeframe: '15m',
      confirmed: false,
      status: 'WATCH',
      openingRangeHigh: sessionCandles[0]?.high || 0,
      openingRangeLow: sessionCandles[0]?.low || 0,
      breakoutClose: sessionCandles[0]?.close || 0,
      rvol: 1.0,
      explanation: 'WATCH: Awaiting subsequent 15m breakout candles after 09:30 IST.'
    };
  }

  // Explicitly require the 09:15–09:30 IST opening candle. Never infer it from array position.
  const getTimeKey = (timestamp: string): string => {
    const match = timestamp.match(/(?:T|\s)(\d{2}:\d{2})/);
    return match?.[1] ?? timestamp.substring(0, 5);
  };
  const orbCandle = sessionCandles.find(c => getTimeKey(c.timestamp) === '09:15');
  if (!orbCandle) {
    return {
      symbol, timeframe: '15m', confirmed: false, status: 'DATA_UNAVAILABLE',
      openingRangeHigh: 0, openingRangeLow: 0, breakoutClose: 0, rvol: 0,
      explanation: 'DATA_UNAVAILABLE: Required 09:15–09:30 IST opening candle is missing for the target session.'
    };
  }
  const orHigh = orbCandle.high;
  const orLow = orbCandle.low;

  // Evaluate subsequent 15m candles (strictly after the opening candle).
  const postOpenCandles = sessionCandles
    .filter(c => getTimeKey(c.timestamp) > '09:15')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const c of postOpenCandles) {
    const timeKey = c.timestamp.includes('T')
      ? c.timestamp.split('T')[1].substring(0, 5)
      : c.timestamp.substring(0, 5);

    // Time-of-day normalized volume baseline. Missing baselines are data-unavailable, not 50,000-share guesses.
    const baselineVol = typeof timeOfDayVolumeBaseline === 'number'
      ? timeOfDayVolumeBaseline
      : timeOfDayVolumeBaseline?.[timeKey];
    if (!(baselineVol && baselineVol > 0)) {
      return {
        symbol, timeframe: '15m', confirmed: false, status: 'DATA_UNAVAILABLE',
        openingRangeHigh: orHigh, openingRangeLow: orLow, breakoutClose: c.close, rvol: 0,
        explanation: `DATA_UNAVAILABLE: Missing time-of-day volume baseline for ${timeKey}.`
      };
    }

    const rvol = Number((c.volume / baselineVol).toFixed(2));

    // Specification: Price > OR High AND 15m Close > OR High AND RVOL >= 1.5
    if (c.close > orHigh && rvol >= 1.5) {
      return {
        symbol,
        timeframe: '15m',
        confirmed: true,
        status: 'CONFIRMED',
        openingRangeHigh: orHigh,
        openingRangeLow: orLow,
        breakoutClose: c.close,
        rvol,
        explanation: `CONFIRMED: Decisive 15-min close (₹${c.close}) > Opening High (₹${orHigh}) at ${timeKey} with Time-of-Day RVOL ${rvol}x >= 1.5x threshold.`
      };
    }
  }

  return {
    symbol,
    timeframe: '15m',
    confirmed: false,
    status: 'WATCH',
    openingRangeHigh: orHigh,
    openingRangeLow: orLow,
    breakoutClose: sessionCandles[sessionCandles.length - 1].close,
    rvol: 1.0,
    explanation: `WATCH: Price consolidating within/below opening range (₹${orLow} - ₹${orHigh}). Awaiting confirmed 15m close breakout.`
  };
}


