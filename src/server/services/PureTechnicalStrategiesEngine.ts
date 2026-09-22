/**
 * PureTechnicalStrategiesEngine.ts
 *
 * Standalone Independent Technical Analysis Engine for NRI WealthOS.
 * Strictly implements three independent technical momentum strategies WITHOUT
 * mixing any fundamentals, sentiment, valuation, market cap, or external dampers.
 *
 * Strategy 1: VPA Alignment & Base Compaction Breakout
 * Strategy 2: Institutional Inflow + FVG & Consequent Encroachment (CE) Pullback
 * Strategy 3: Higher High & Higher Low Sequential Compaction with Smart Money Flag
 */

import { SMA, EMA, RSI, ATR, BollingerBands } from 'technicalindicators';
import { fetchTickerData } from '../yahooFinance.js';
import { getDB, dbAll, dbGet, dbRun } from '../database.js';
import { StrategyParameterConfig, getDefaultsForStrategy } from './StrategyParameterConfig.js';
import { DuckDbAdjustedOhlcvService } from './DuckDbAdjustedOhlcvService.js';

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
}

export interface RuleCheck {
  id: string;
  name: string;
  passed: boolean;
  actualValue: string | number;
  benchmarkRule: string;
  explanation: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 1 INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface StrategyEvaluationOptions {
  filterPreceding52wLow?: boolean;
  config?: StrategyParameterConfig;
}

export interface Strategy1Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  p0: number | null;
  peakHigh: number | null;
  impulseDurationBars: number | null;
  impulseGainPct: number | null;
  baseDurationBars: number | null;
  retracementFloor: number | null;
  lowestBaseClose: number | null;
  atrRatio: number | null;
  volumeDryingRatio: number | null;
  vpaAsymmetryRatio: number | null;
  isNr4: boolean;
  isNr7: boolean;
  ema9: number | null;
  ema21: number | null;
  ema9OverEma21: boolean;
  rsi14: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskRewardRatio: number | null;
  preceding52WeekLow: number | null;
  p0DistancePctFrom52wLow: number | null;
  isAtPreceding52WeekLow: boolean;
  signalStatus?: 'ACTIVE' | 'PASSED_OPPORTUNITY' | 'INVALIDATED' | 'MONITORING';
  signalAge?: number;
  ruleChecks: RuleCheck[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 2 INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface FairValueGapInfo {
  index: number;
  date: string;
  topPrice: number;       // Candle i+1 low
  bottomPrice: number;    // Candle i-1 high
  ceLevel: number;        // Consequent Encroachment (50% midpoint)
  sizePct: number;
  isMitigated: boolean;
  mitigationPct: number;
}

export interface Strategy2Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  p0: number | null;
  p0Date?: string;
  impulseGainPct: number | null;
  cumulativeTurnoverCr: number | null;
  institutionalInflowDate: string | null;
  institutionalDayTurnoverCr: number | null;
  institutionalVolumeRatio: number | null;
  pullbackDurationBars: number | null;
  pullbackDropPct: number | null;
  pullbackVolumeDrying: boolean;
  priceRangeCompacted: boolean;
  priceContractionAtEntry: boolean;
  vpaAlignmentAtEntry: boolean;
  entryRangeContractionRatio: number | null;
  entryVolumeDryingRatio: number | null;
  activeFvg: FairValueGapInfo | null;
  entryZone: {
    recommendedEntryPrice: number; // CE Level
    fvgTop: number;
    fvgBottom: number;
    ceLevel: number;
  } | null;
  invalidationStopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskRewardRatio: number | null;
  preceding52WeekLow: number | null;
  p0DistancePctFrom52wLow: number | null;
  isAtPreceding52WeekLow: boolean;
  signalStatus?: 'ACTIVE' | 'PASSED_OPPORTUNITY' | 'INVALIDATED' | 'MONITORING';
  signalAge?: number;
  ruleChecks: RuleCheck[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 3 INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface Strategy3Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  p0: number | null;
  h1: number | null;
  l1: number | null;
  h2: number | null;
  l2: number | null;
  p0Date?: string;
  h1Date?: string;
  l1Date?: string;
  h2Date?: string;
  l2Date?: string;
  sma200AtP0?: number | null;
  p0DistancePctFromSma200?: number | null;
  initialMoveNearSma200?: boolean;
  impulseGainPct: number | null;
  impulseCumulativeTurnoverCr: number | null;
  impulseDurationBars: number | null;
  smartMoneyInImpulse: boolean;
  firstPullbackDurationBars: number | null;
  firstPullbackDropPct: number | null;
  firstPullbackVolumeDrying: boolean;
  firstPullbackRangeCompacted: boolean;
  secondLegGainPct: number | null;
  secondPullbackDurationBars: number | null;
  secondPullbackRangeCompacted: boolean;
  recommendedEntryPrice: number | null; // Compaction zone near L2
  stopLoss: number | null;              // Invalidation below L2
  target1: number | null;               // H2 retest
  target2: number | null;               // Expansion
  riskRewardRatio: number | null;
  smartMoneyInvolvedInLastMove: boolean;
  smartMoneyNotification: string;
  preceding52WeekLow: number | null;
  p0DistancePctFrom52wLow: number | null;
  isAtPreceding52WeekLow: boolean;
  signalStatus?: 'ACTIVE' | 'PASSED_OPPORTUNITY' | 'INVALIDATED' | 'MONITORING';
  signalAge?: number;
  ruleChecks: RuleCheck[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 4 INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface Strategy4Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  p0: number | null;
  h1: number | null;
  l1: number | null;
  h2: number | null;
  l2: number | null;
  p0Date?: string;
  h1Date?: string;
  l1Date?: string;
  h2Date?: string;
  l2Date?: string;
  sma200AtP0: number | null;
  p0DistancePctFromSma200: number | null;
  initialMoveNearSma200: boolean;
  vpaContractionAtEntry: boolean;
  entryVolumeDryingRatio: number | null;
  entryRangeContractionRatio: number | null;
  impulseGainPct: number | null;
  impulseCumulativeTurnoverCr: number | null;
  impulseDurationBars: number | null;
  smartMoneyInImpulse: boolean;
  firstPullbackDurationBars: number | null;
  firstPullbackDropPct: number | null;
  firstPullbackVolumeDrying: boolean;
  firstPullbackRangeCompacted: boolean;
  secondLegGainPct: number | null;
  secondPullbackDurationBars: number | null;
  secondPullbackRangeCompacted: boolean;
  recommendedEntryPrice: number | null; // Compaction zone near L2
  stopLoss: number | null;              // Invalidation below L2
  target1: number | null;               // H2 retest
  target2: number | null;               // Expansion
  riskRewardRatio: number | null;
  smartMoneyInvolvedInLastMove: boolean;
  smartMoneyNotification: string;
  preceding52WeekLow: number | null;
  p0DistancePctFrom52wLow: number | null;
  isAtPreceding52WeekLow: boolean;
  signalStatus?: 'ACTIVE' | 'PASSED_OPPORTUNITY' | 'INVALIDATED' | 'MONITORING';
  signalAge?: number;
  ruleChecks: RuleCheck[];
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIVERSE SCAN REPORT INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 5 INTERFACE: 50 EMA Pullback & VCP
// ─────────────────────────────────────────────────────────────────────────────

export interface Strategy5Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  ema50: number | null;
  sma200: number | null;
  rsi14: number | null;
  atr14: number | null;
  volumeVsAvg: number | null;
  atrVsAvg: number | null;
  ema50ProximityPct: number | null;
  swingLow: number | null;
  priorSwingHigh: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskRewardRatio: number | null;
  preceding52WeekLow: number | null;
  p0DistancePctFrom52wLow: number | null;
  isAtPreceding52WeekLow: boolean;
  signalStatus?: 'ACTIVE' | 'PASSED_OPPORTUNITY' | 'INVALIDATED' | 'MONITORING';
  signalAge?: number;
  ruleChecks: RuleCheck[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 6 INTERFACE: Nifty 500 RS Breakout
// ─────────────────────────────────────────────────────────────────────────────

export interface Strategy6Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  high52w: number | null;
  distanceFrom52wHighPct: number | null;
  consolidationRangePct: number | null;
  breakoutHigh: number | null;
  volumeSurgeRatio: number | null;
  rsi14: number | null;
  consolidationLow: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskRewardRatio: number | null;
  preceding52WeekLow: number | null;
  p0DistancePctFrom52wLow: number | null;
  isAtPreceding52WeekLow: boolean;
  signalStatus?: 'ACTIVE' | 'PASSED_OPPORTUNITY' | 'INVALIDATED' | 'MONITORING';
  signalAge?: number;
  ruleChecks: RuleCheck[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 7 INTERFACE: RSI Mean-Reversion Oversold Dip
// ─────────────────────────────────────────────────────────────────────────────

export interface Strategy7Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  sma200: number | null;
  rsi14: number | null;
  lowerBB: number | null;
  middleBB: number | null;
  atr14: number | null;
  dipCandleLow: number | null;
  capitulationRatio: number | null;
  reversalConfirmed: boolean;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskRewardRatio: number | null;
  requiresNextOpenEntry: boolean;
  preceding52WeekLow: number | null;
  p0DistancePctFrom52wLow: number | null;
  isAtPreceding52WeekLow: boolean;
  signalStatus?: 'ACTIVE' | 'PASSED_OPPORTUNITY' | 'INVALIDATED' | 'MONITORING';
  signalAge?: number;
  ruleChecks: RuleCheck[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 8 INTERFACE: High-Tight Flag / Epiphany Breakout
// ─────────────────────────────────────────────────────────────────────────────

export interface Strategy8Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  flagPoleGainPct: number | null;
  flagRangePct: number | null;
  adr20Pct: number | null;
  breakoutHigh5: number | null;
  volumeSurgeRatio: number | null;
  ema10: number | null;
  ema20: number | null;
  flagLow: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskRewardRatio: number | null;
  preceding52WeekLow: number | null;
  p0DistancePctFrom52wLow: number | null;
  isAtPreceding52WeekLow: boolean;
  signalStatus?: 'ACTIVE' | 'PASSED_OPPORTUNITY' | 'INVALIDATED' | 'MONITORING';
  signalAge?: number;
  ruleChecks: RuleCheck[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 9 INTERFACE: Volume Dry-Up & Surging RS (VDU-RS)
// ─────────────────────────────────────────────────────────────────────────────

export interface Strategy9Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  sma50: number | null;
  adr20Pct: number | null;
  vduRatio: number | null;
  vduDayLow: number | null;
  volumeSurgeRatio: number | null;
  sma20: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskRewardRatio: number | null;
  preceding52WeekLow: number | null;
  p0DistancePctFrom52wLow: number | null;
  isAtPreceding52WeekLow: boolean;
  signalStatus?: 'ACTIVE' | 'PASSED_OPPORTUNITY' | 'INVALIDATED' | 'MONITORING';
  signalAge?: number;
  ruleChecks: RuleCheck[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 10 INTERFACE: Parabolic Trendline + ORB (Intraday Hybrid)
// ─────────────────────────────────────────────────────────────────────────────

export interface Strategy10Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  sma200: number | null;
  consecutiveLowerHighsCount: number;
  trendlineBreakConfirmed: boolean;
  trendlineBreakLevel: number | null;
  atr14: number | null;
  requiresIntradayConfirmation: boolean;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskRewardRatio: number | null;
  preceding52WeekLow: number | null;
  p0DistancePctFrom52wLow: number | null;
  isAtPreceding52WeekLow: boolean;
  signalStatus?: 'ACTIVE' | 'PASSED_OPPORTUNITY' | 'INVALIDATED' | 'MONITORING';
  signalAge?: number;
  ruleChecks: RuleCheck[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 11 INTERFACE: Institutional Spring / Liquidity Reclaim
// ─────────────────────────────────────────────────────────────────────────────

export interface Strategy11Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  sma200: number | null;
  supportLevel: number | null;
  springLow: number | null;
  volumeSurgeRatio: number | null;
  rsi14: number | null;
  bullishDivergence: boolean;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskRewardRatio: number | null;
  preceding52WeekLow: number | null;
  p0DistancePctFrom52wLow: number | null;
  isAtPreceding52WeekLow: boolean;
  signalStatus?: 'ACTIVE' | 'PASSED_OPPORTUNITY' | 'INVALIDATED' | 'MONITORING';
  signalAge?: number;
  ruleChecks: RuleCheck[];
}

export interface MultiConvergenceMatch {
  symbol: string;
  companyName: string;
  cmp: number;
  matchedStrategies: ('STRATEGY_1' | 'STRATEGY_2' | 'STRATEGY_3' | 'STRATEGY_4' | 'STRATEGY_5' | 'STRATEGY_6' | 'STRATEGY_7' | 'STRATEGY_8' | 'STRATEGY_9' | 'STRATEGY_10' | 'STRATEGY_11')[];
  convergenceCount: number;
  strategy1?: Strategy1Result;
  strategy2?: Strategy2Result;
  strategy3?: Strategy3Result;
  strategy4?: Strategy4Result;
  strategy5?: Strategy5Result;
  strategy6?: Strategy6Result;
  strategy7?: Strategy7Result;
  strategy8?: Strategy8Result;
  strategy9?: Strategy9Result;
  strategy10?: Strategy10Result;
  strategy11?: Strategy11Result;
}

export interface IndependentTechnicalScanReport {
  generatedAt: string;
  totalUniverseScanned: number;
  strategy1Matches: Strategy1Result[];
  strategy2Matches: Strategy2Result[];
  strategy3Matches: Strategy3Result[];
  strategy4Matches: Strategy4Result[];
  strategy5Matches: Strategy5Result[];
  strategy6Matches: Strategy6Result[];
  strategy7Matches: Strategy7Result[];
  strategy8Matches: Strategy8Result[];
  strategy9Matches: Strategy9Result[];
  strategy10Matches: Strategy10Result[];
  strategy11Matches?: Strategy11Result[];
  multiConvergenceMatches: MultiConvergenceMatch[];
  dualConvergenceMatches?: Array<{
    symbol: string;
    companyName: string;
    cmp: number;
    strategy1: Strategy1Result;
    strategy2: Strategy2Result;
  }>;
}

export class PureTechnicalStrategiesEngine {
  private static instance: PureTechnicalStrategiesEngine;
  private cachedReport: IndependentTechnicalScanReport | null = null;
  private lastScanTime: number = 0;
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL
  private static scanProgress: {
    status: string;
    scanned: number;
    total: number;
    percent: number;
    currentSymbol?: string;
    qualifiedCount?: number;
    strategyMatches?: { [strategyId: string]: number };
    // Comprehensive scan telemetry
    totalUniverse?: number;
    duckdbCoveredCount?: number;
    coverageGapCount?: number;
    bridgeFailureCount?: number;
    strategyEvaluatedCount?: number;
    deepAnalysisCount?: number;
    lastError?: string;
  } = { status: 'IDLE', scanned: 0, total: 0, percent: 0, currentSymbol: '', qualifiedCount: 0, strategyMatches: {}, totalUniverse: 0, duckdbCoveredCount: 0, coverageGapCount: 0, bridgeFailureCount: 0, strategyEvaluatedCount: 0, deepAnalysisCount: 0, lastError: '' };

  public static getScanProgress() {
    return PureTechnicalStrategiesEngine.scanProgress;
  }

  public static getInstance(): PureTechnicalStrategiesEngine {
    if (!PureTechnicalStrategiesEngine.instance) {
      PureTechnicalStrategiesEngine.instance = new PureTechnicalStrategiesEngine();
    }
    return PureTechnicalStrategiesEngine.instance;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY 1: VPA Alignment & Base Compaction Breakout
  // ─────────────────────────────────────────────────────────────────────────────

  public evaluateStrategy1(
    candles: Candle[],
    symbolOrInfo: string | { symbol: string; companyName?: string; tier?: string } = 'UNKNOWN',
    companyName: string = '',
    options?: StrategyEvaluationOptions
  ): Strategy1Result {
    const symbol = typeof symbolOrInfo === 'string' ? symbolOrInfo : (symbolOrInfo?.symbol || 'UNKNOWN');
    const resolvedCompanyName = typeof symbolOrInfo === 'object' && symbolOrInfo?.companyName ? symbolOrInfo.companyName : (companyName || symbol);

    const defaultFail: Strategy1Result = {
      qualified: false,
      symbol,
      companyName: resolvedCompanyName,
      cmp: 0,
      p0: null,
      peakHigh: null,
      impulseDurationBars: null,
      impulseGainPct: null,
      baseDurationBars: null,
      retracementFloor: null,
      lowestBaseClose: null,
      atrRatio: null,
      volumeDryingRatio: null,
      vpaAsymmetryRatio: null,
      isNr4: false,
      isNr7: false,
      ema9: null,
      ema21: null,
      ema9OverEma21: false,
      rsi14: null,
      stopLoss: null,
      target1: null,
      target2: null,
      riskRewardRatio: null,
      preceding52WeekLow: null,
      p0DistancePctFrom52wLow: null,
      isAtPreceding52WeekLow: false,
      signalStatus: 'MONITORING',
      signalAge: 0,
      ruleChecks: []
    };

    if (!candles || candles.length < 35) {
      defaultFail.ruleChecks.push({
        id: 'DATA_LENGTH',
        name: 'Candle History Available',
        passed: false,
        actualValue: `${candles?.length || 0} bars`,
        benchmarkRule: '>= 35 historical daily bars',
        explanation: 'Insufficient candle history for 15-25 session base + 5-15 session impulse.'
      });
      return defaultFail;
    }

    const n = candles.length;
    const cmp = candles[n - 1].close;
    defaultFail.cmp = cmp;

    const cfg = options?.config;
    const s1ImpulseGainMinPct = cfg?.impulse?.impulseGainMinPct ?? 15.0;
    const s1ImpulseDurationMinBars = cfg?.impulse?.impulseDurationMinBars ?? 4;
    const s1ImpulseDurationMaxBars = cfg?.impulse?.impulseDurationMaxBars ?? 25;
    const s1BaseDurationMinBars = cfg?.pullback?.baseDurationMinBars ?? 10;
    const s1BaseDurationMaxBars = cfg?.pullback?.baseDurationMaxBars ?? 30;
    const s1VolumeDryingRatio = cfg?.volume?.volumeDryingRatio ?? 0.80;
    const s1VpaAsymmetryRatioMin = cfg?.volume?.vpaAsymmetryRatioMin ?? 1.15;
    const s1AtrContractionRatioMax = cfg?.volatility?.atrContractionRatioMax ?? 0.85;
    const s1StopLossPct = cfg?.risk?.stopLossPct ?? 2.0;
    const s1Target1RRMultiplier = cfg?.risk?.target1RRMultiplier ?? 2.0;
    const s1Target2RRMultiplier = cfg?.risk?.target2RRMultiplier ?? 3.5;

    // Scan base lengths from baseDurationMinBars to baseDurationMaxBars sessions (2 to 6 weeks)
    let bestBaseLen = 0;
    let bestPeakIdx = 0;
    let bestP0Idx = 0;
    let foundSetup = false;

    for (let baseLen = s1BaseDurationMinBars; baseLen <= Math.min(s1BaseDurationMaxBars, n - 6); baseLen++) {
      const peakIdx = n - baseLen - 1;
      const peakHigh = candles[peakIdx].high ?? candles[peakIdx].close;

      const minP0 = Math.max(0, peakIdx - 20);
      const maxP0 = peakIdx - 4;

      let p0 = Infinity;
      let p0Idx = -1;

      for (let i = maxP0; i >= minP0; i--) {
        const lowVal = candles[i].low ?? candles[i].close;
        if (lowVal < p0) {
          p0 = lowVal;
          p0Idx = i;
        }
      }

      if (p0Idx < 0 || p0 <= 0) continue;

      const impulseDuration = peakIdx - p0Idx;
      const gainPct = ((peakHigh - p0) / p0) * 100;

      if (gainPct >= s1ImpulseGainMinPct && impulseDuration >= s1ImpulseDurationMinBars && impulseDuration <= s1ImpulseDurationMaxBars) {
        bestBaseLen = baseLen;
        bestPeakIdx = peakIdx;
        bestP0Idx = p0Idx;
        foundSetup = true;
        break;
      }
    }

    if (!foundSetup) {
      defaultFail.ruleChecks.push({
        id: 'DATA_INTEGRITY',
        name: 'Impulse Leg Qualification',
        passed: false,
        actualValue: 'No qualifying impulse',
        benchmarkRule: 'Impulse >= 15% in 4-25 bars followed by 10-30 bar base',
        explanation: 'No qualifying impulse thrust (>= 15%) found in the 30-day lookback window.'
      });
      return defaultFail;
    }

    const baseLen = bestBaseLen;
    const peakIdx = bestPeakIdx;
    const p0Idx = bestP0Idx;

    const peakHigh = candles[peakIdx]?.high ?? candles[peakIdx]?.close ?? cmp;
    const p0 = candles[p0Idx]?.low ?? candles[p0Idx]?.close ?? cmp;
    const impulseDuration = Math.max(1, peakIdx - p0Idx);
    const impulseGainPct = Number((((peakHigh - p0) / (p0 || 1)) * 100).toFixed(2));

    const baseCandles = candles.slice(n - baseLen);
    const impulseCandles = candles.slice(p0Idx, peakIdx + 1);

    // Rule 1: Pre-condition Impulse thrust >= impulseGainMinPct move in 1-4 weeks
    const check1Passed = impulseGainPct >= s1ImpulseGainMinPct && impulseDuration >= s1ImpulseDurationMinBars && impulseDuration <= s1ImpulseDurationMaxBars;

    // Rule 2: Base duration baseDurationMinBars to baseDurationMaxBars sessions (2 to 6 weeks)
    const check2Passed = baseLen >= s1BaseDurationMinBars && baseLen <= s1BaseDurationMaxBars;

    // Rule 3: Retracement floor: Must hold upper half (P0 + 0.45 * [P_peak - P0])
    const retracementFloor = Number((p0 + 0.45 * (peakHigh - p0)).toFixed(2));
    let lowestBaseClose = Infinity;
    let lowestBaseLow = Infinity;
    for (const c of baseCandles) {
      if (c.close < lowestBaseClose) lowestBaseClose = c.close;
      const l = c.low ?? c.close;
      if (l < lowestBaseLow) lowestBaseLow = l;
    }
    const check3Passed = lowestBaseLow >= retracementFloor;

    // Rule 4: ATR Contraction: ATR5(base) / ATR14(peak) <= 0.85 (correcting 14-period series offset)
    const highPrices = candles.map(c => c.high ?? c.close);
    const lowPrices = candles.map(c => c.low ?? c.close);
    const closePrices = candles.map(c => c.close);

    const atr5Series = ATR.calculate({ high: highPrices, low: lowPrices, close: closePrices, period: 5 });
    const atr14Series = ATR.calculate({ high: highPrices, low: lowPrices, close: closePrices, period: 14 });

    const currentAtr5 = atr5Series.length > 0 ? atr5Series[atr5Series.length - 1] : 0;
    const peakAtr14Idx = Math.max(0, Math.min(atr14Series.length - 1, peakIdx - 14));
    const peakAtr14 = atr14Series[peakAtr14Idx] || atr14Series[0] || 1;
    const atrRatio = Number((currentAtr5 / (peakAtr14 || 1)).toFixed(2));
    const check4Passed = atrRatio <= s1AtrContractionRatioMax && atrRatio > 0;

    // Rule 5: Volume Drying Ratio: Mean base volume <= 0.80 * mean impulse volume
    const meanBaseVol = baseCandles.reduce((s, c) => s + (c.volume || 0), 0) / Math.max(1, baseCandles.length);
    const meanImpulseVol = impulseCandles.reduce((s, c) => s + (c.volume || 0), 0) / Math.max(1, impulseCandles.length);
    const volumeDryingRatio = Number((meanBaseVol / Math.max(1, meanImpulseVol)).toFixed(2));
    const check5Passed = volumeDryingRatio <= s1VolumeDryingRatio;

    // Rule 6: VPA Asymmetry Ratio: Up-day volume vs Down-day volume >= 1.15
    let upDayVol = 0;
    let upDayCount = 0;
    let downDayVol = 0;
    let downDayCount = 0;

    for (let i = 1; i < baseCandles.length; i++) {
      const c = baseCandles[i];
      const prev = baseCandles[i - 1];
      if (c.close >= prev.close) {
        upDayVol += (c.volume || 0);
        upDayCount++;
      } else {
        downDayVol += (c.volume || 0);
        downDayCount++;
      }
    }

    const meanUpVol = upDayVol / Math.max(1, upDayCount);
    const meanDownVol = downDayVol / Math.max(1, downDayCount);
    const vpaAsymmetryRatio = Number((meanUpVol / Math.max(1, meanDownVol)).toFixed(2));
    const check6Passed = vpaAsymmetryRatio >= s1VpaAsymmetryRatioMin;

    // Rule 7: NR4 / NR7 candle in the last 5 sessions
    let isNr4 = false;
    let isNr7 = false;
    const allDailyRanges = candles.map(c => (c.high ?? c.close) - (c.low ?? c.close));
    for (let offset = 0; offset < 5; offset++) {
      const idx = n - 1 - offset;
      if (idx >= 6) {
        const range = allDailyRanges[idx];
        const prev3 = allDailyRanges.slice(idx - 3, idx);
        const prev6 = allDailyRanges.slice(idx - 6, idx);
        if (range <= Math.min(...prev3)) isNr4 = true;
        if (range <= Math.min(...prev6)) isNr7 = true;
      }
    }
    const check7Passed = isNr4 || isNr7;

    // Rule 8: EMA 9 crossing over EMA 21 or EMA 9 >= EMA 21 * 0.985
    const ema9Series = EMA.calculate({ period: 9, values: closePrices });
    const ema21Series = EMA.calculate({ period: 21, values: closePrices });
    const ema9 = ema9Series.length > 0 ? Number(ema9Series[ema9Series.length - 1].toFixed(2)) : cmp;
    const ema21 = ema21Series.length > 0 ? Number(ema21Series[ema21Series.length - 1].toFixed(2)) : cmp;
    const prevEma9 = ema9Series.length > 1 ? ema9Series[ema9Series.length - 2] : ema9;
    const prevEma21 = ema21Series.length > 1 ? ema21Series[ema21Series.length - 2] : ema21;
    const freshCross = prevEma9 <= prevEma21 && ema9 > ema21;
    const ema9OverEma21 = ema9 >= (ema21 * 0.985);
    const check8Passed = ema9OverEma21 || freshCross;

    // Rule 9: RSI in bullish territory during consolidation base (RSI >= 50)
    const rsiSeries = RSI.calculate({ period: 14, values: closePrices });
    const rsi14 = rsiSeries.length > 0 ? Number(rsiSeries[rsiSeries.length - 1].toFixed(1)) : 50;
    const check9Passed = rsi14 >= 50.0;

    // Optional Rule: Initial Move (P0) at Lowest Low of Preceding 52 Weeks (with >= 20% impulse)
    const low52w = this.getPreceding52WeekLowAt(candles, p0Idx);
    const check52wLowPassed = low52w.isAtLowestLow && impulseGainPct >= 20.0;

    // Core structural gates (Impulse thrust, sound base duration, upper quadrant retracement floor, trend alignment)
    // plus at least 3 of 5 confirming volatility/volume signatures
    const secondaryCount = [check4Passed, check5Passed, check6Passed, check7Passed, check9Passed].filter(Boolean).length;
    const sma200SeriesS1 = SMA.calculate({ period: 200, values: closePrices });
    const sma200_S1 = sma200SeriesS1.length > 0 ? sma200SeriesS1[sma200SeriesS1.length - 1] : 0;
    const check10Passed = sma200_S1 > 0 && cmp > sma200_S1 * 1.05; // SMA 200 slope filter
    const allPassed = check1Passed && check2Passed && check3Passed && check8Passed && (secondaryCount >= 3) && (!options?.filterPreceding52wLow || check52wLowPassed) && check10Passed;

    const stopLoss = Number((p0 * (1 - s1StopLossPct / 100)).toFixed(2));
    const riskAmount = Math.max(1, cmp - stopLoss);
    const target1 = Number((cmp + riskAmount * s1Target1RRMultiplier).toFixed(2));
    const target2 = Number((cmp + riskAmount * s1Target2RRMultiplier).toFixed(2));
    const riskRewardRatio = Number(((target1 - cmp) / riskAmount).toFixed(2));

    const ruleChecks: RuleCheck[] = [
      {
        id: 'S1_IMPULSE_MOVE',
        name: 'Pre-Condition: Impulse Thrust (>= +15% in 1–4 Weeks)',
        passed: check1Passed,
        actualValue: `+${impulseGainPct}% over ${impulseDuration} bars`,
        benchmarkRule: '>= +15% gain in 4–25 sessions',
        explanation: check1Passed ? 'Verified institutional momentum thrust prior to consolidation base.' : `Thrust (+${impulseGainPct}%, ${impulseDuration} bars) does not satisfy >= 15% prior advance.`
      },
      {
        id: 'S1_BASE_DURATION',
        name: 'Base Compaction Duration (2–6 Weeks)',
        passed: check2Passed,
        actualValue: `${baseLen} sessions (${(baseLen / 5).toFixed(1)} weeks)`,
        benchmarkRule: '10 to 30 trading sessions',
        explanation: check2Passed ? 'Base building duration in optimal 2-6 week consolidation window.' : `Base length (${baseLen} bars) outside 10-30 window.`
      },
      {
        id: 'S1_RETRACEMENT_FLOOR',
        name: 'Retracement Floor: Holds Upper Quadrant',
        passed: check3Passed,
        actualValue: `Low: ₹${lowestBaseLow} vs Floor: ₹${retracementFloor}`,
        benchmarkRule: `Retest holds upper 55% (Floor: P0 + 0.45 * Impulse)`,
        explanation: check3Passed ? 'Price held upper half of impulse; zero structural breakdown.' : 'Disqualified: Base retest violated the impulse midpoint floor.'
      },
      {
        id: 'S1_ATR_CONTRACTION',
        name: 'ATR Volatility Compression',
        passed: check4Passed,
        actualValue: `Ratio: ${atrRatio} (ATR5: ₹${currentAtr5.toFixed(1)} / Peak ATR14: ₹${peakAtr14.toFixed(1)})`,
        benchmarkRule: 'ATR5(base) / ATR14(peak) <= 0.85',
        explanation: check4Passed ? 'Volatility compressed like a coiled spring relative to peak volatility.' : `ATR contraction ratio (${atrRatio}) above 0.85 threshold.`
      },
      {
        id: 'S1_VOLUME_DRYING',
        name: 'Volume Drying Ratio',
        passed: check5Passed,
        actualValue: `${(volumeDryingRatio * 100).toFixed(0)}% of impulse vol`,
        benchmarkRule: 'Mean Base Vol <= 0.80 * Mean Impulse Vol',
        explanation: check5Passed ? 'Volume dried up significantly during base consolidation, confirming lack of selling pressure.' : `Volume drying ratio (${volumeDryingRatio}x) above 0.80 threshold.`
      },
      {
        id: 'S1_VPA_ASYMMETRY',
        name: 'VPA Asymmetry Ratio (Up Vol vs Down Vol)',
        passed: check6Passed,
        actualValue: `${vpaAsymmetryRatio}x (Up: ${Math.round(meanUpVol)} / Down: ${Math.round(meanDownVol)})`,
        benchmarkRule: 'Up-day Vol / Down-day Vol >= 1.15',
        explanation: check6Passed ? 'Institutional absorption confirmed: up-days attract higher volume than down-days.' : `VPA Asymmetry (${vpaAsymmetryRatio}x) below 1.15 threshold.`
      },
      {
        id: 'S1_NR4_NR7_COMPRESSION',
        name: 'Narrow Range Compression (NR4 / NR7 in last 5 bars)',
        passed: check7Passed,
        actualValue: isNr7 ? 'NR7 Compression Active' : isNr4 ? 'NR4 Compression Active' : 'No NR4/NR7 in last 5 bars',
        benchmarkRule: 'NR4 or NR7 candle within last 5 bars',
        explanation: check7Passed ? 'Coiled volatility compression day confirmed in recent sessions prior to breakout.' : 'No NR4 or NR7 range contraction bar in the last 5 sessions.'
      },
      {
        id: 'S1_EMA_CROSS',
        name: 'EMA 9 / EMA 21 Trend Alignment',
        passed: check8Passed,
        actualValue: `EMA9: ₹${ema9} | EMA21: ₹${ema21} (${freshCross ? 'Fresh Cross' : 'EMA9 >= EMA21'})`,
        benchmarkRule: 'EMA 9 crossing over EMA 21 or EMA 9 >= EMA 21 * 0.985',
        explanation: check8Passed ? 'Short-term momentum acceleration aligned above medium-term moving average.' : 'EMA 9 has not aligned above EMA 21.'
      },
      {
        id: 'S1_RSI_BULLISH',
        name: 'Bullish RSI Consolidation Zone',
        passed: check9Passed,
        actualValue: `RSI(14): ${rsi14}`,
        benchmarkRule: 'RSI(14) >= 50.0',
        explanation: check9Passed ? 'RSI operating in healthy bullish accumulation territory (>= 50).' : `RSI (${rsi14}) below 50 bullish support threshold.`
      },
      {
        id: 'S1_PRECEDING_52W_LOW',
        name: 'Initial Move (P0) at Preceding 52-Week Low (20%+ Impulse)',
        passed: check52wLowPassed,
        actualValue: `P0: ₹${p0} vs 52W Low: ₹${low52w.lowestLow} (${low52w.distancePct > 0 ? '+' : ''}${low52w.distancePct}%) | Impulse: +${impulseGainPct}%`,
        benchmarkRule: 'P0 within 2.5% of preceding 52-week low & Impulse >= 20%',
        explanation: check52wLowPassed
          ? `Verified: Initial 20%+ impulse move launched directly from preceding 52-week low (₹${low52w.lowestLow}).`
          : `P0 (₹${p0}) is not at preceding 52-week low (₹${low52w.lowestLow}, diff: ${low52w.distancePct}%) or impulse < 20%.`
      }
    ];

    let signalStatus: Strategy1Result['signalStatus'] = 'MONITORING';
    if (cmp < p0) {
      signalStatus = 'INVALIDATED';
    } else if (cmp > (target1 || 0) || cmp > peakHigh * 1.15) {
      signalStatus = 'PASSED_OPPORTUNITY';
    } else if (allPassed) {
      signalStatus = 'ACTIVE';
    }
    const signalAge = baseLen;

    return {
      qualified: allPassed,
      symbol,
      companyName: companyName || symbol,
      cmp,
      p0,
      peakHigh,
      impulseDurationBars: impulseDuration,
      impulseGainPct,
      baseDurationBars: baseLen,
      retracementFloor,
      lowestBaseClose,
      atrRatio,
      volumeDryingRatio,
      vpaAsymmetryRatio,
      isNr4,
      isNr7,
      ema9,
      ema21,
      ema9OverEma21,
      rsi14,
      stopLoss,
      target1,
      target2,
      riskRewardRatio,
      preceding52WeekLow: low52w.lowestLow,
      p0DistancePctFrom52wLow: low52w.distancePct,
      isAtPreceding52WeekLow: low52w.isAtLowestLow,
      signalStatus,
      signalAge,
      ruleChecks
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY 2: Institutional Inflow + FVG & Consequent Encroachment (CE) Pullback
  // (Enhanced with Price Contraction & VPA Alignment at the Time of Entry)
  // ─────────────────────────────────────────────────────────────────────────────

  public evaluateStrategy2(
    candles: Candle[],
    symbolOrInfo: string | { symbol: string; companyName?: string; tier?: string } = 'UNKNOWN',
    companyName: string = '',
    options?: StrategyEvaluationOptions
  ): Strategy2Result {
    const symbol = typeof symbolOrInfo === 'string' ? symbolOrInfo : (symbolOrInfo?.symbol || 'UNKNOWN');
    const resolvedCompanyName = typeof symbolOrInfo === 'object' && symbolOrInfo?.companyName ? symbolOrInfo.companyName : (companyName || symbol);

    const defaultFail: Strategy2Result = {
      qualified: false,
      symbol,
      companyName: resolvedCompanyName,
      cmp: 0,
      p0: null,
      p0Date: undefined,
      impulseGainPct: null,
      cumulativeTurnoverCr: null,
      institutionalInflowDate: null,
      institutionalDayTurnoverCr: null,
      institutionalVolumeRatio: null,
      pullbackDurationBars: null,
      pullbackDropPct: null,
      pullbackVolumeDrying: false,
      priceRangeCompacted: false,
      priceContractionAtEntry: false,
      vpaAlignmentAtEntry: false,
      entryRangeContractionRatio: null,
      entryVolumeDryingRatio: null,
      activeFvg: null,
      entryZone: null,
      invalidationStopLoss: null,
      target1: null,
      target2: null,
      riskRewardRatio: null,
      preceding52WeekLow: null,
      p0DistancePctFrom52wLow: null,
      isAtPreceding52WeekLow: false,
      signalStatus: 'MONITORING',
      signalAge: 0,
      ruleChecks: []
    };

    if (!candles || candles.length < 20) {
      defaultFail.ruleChecks.push({
        id: 'DATA_LENGTH',
        name: 'Candle History Available',
        passed: false,
        actualValue: `${candles?.length || 0} bars`,
        benchmarkRule: '>= 20 historical daily bars',
        explanation: 'Insufficient candle history for FVG and institutional inflow analysis.'
      });
      return defaultFail;
    }

    const n = candles.length;
    const cmp = candles[n - 1].close;
    defaultFail.cmp = cmp;

    const cfg = options?.config;
    const s2ImpulseGainMinPct = cfg?.impulse?.impulseGainMinPct ?? 20.0;
    const s2CumulativeTurnoverFloorCr = cfg?.impulse?.cumulativeTurnoverFloorCr ?? 50.0;
    const s2InstitutionalTurnoverFloorCr = cfg?.smartMoney?.institutionalTurnoverFloorCr ?? 2.0;
    const s2VolumeDryingRatio = cfg?.volume?.volumeDryingRatio ?? 0.75;

    const fvgs: FairValueGapInfo[] = [];
    const lookback = Math.max(2, n - 35);

    for (let i = lookback; i < n - 1; i++) {
      const prev = candles[i - 1];
      const disp = candles[i];
      const next = candles[i + 1];

      if (disp.close > disp.open && prev.high < next.low) {
        const bottomPrice = prev.high;
        const topPrice = next.low;
        const ceLevel = Number(((topPrice + bottomPrice) / 2).toFixed(2));
        const sizePct = Number((((topPrice - bottomPrice) / bottomPrice) * 100).toFixed(2));

        let isMitigated = false;
        let lowestRetest = topPrice;

        for (let j = i + 2; j < n; j++) {
          const testLow = candles[j].low ?? candles[j].close;
          const testClose = candles[j].close;
          if (testLow < lowestRetest) lowestRetest = testLow;
          // Spec 6.1: FVG mitigation requires closure BELOW midpoint (ceLevel), not just a touch
          if (testClose <= ceLevel) isMitigated = true;
          if (testClose < bottomPrice) isMitigated = true;
        }

        const penetration = Math.max(0, topPrice - lowestRetest);
        const gapSpan = Math.max(0.01, topPrice - bottomPrice);
        const mitigationPct = Number(Math.min(100, (penetration / gapSpan) * 100).toFixed(1));

        if (candles[n - 1].close >= bottomPrice) {
          fvgs.push({
            index: i,
            date: disp.date,
            topPrice,
            bottomPrice,
            ceLevel,
            sizePct,
            isMitigated,
            mitigationPct
          });
        }
      }
    }

    const activeFvg = fvgs.length > 0 ? fvgs[fvgs.length - 1] : null;

    // Rule 1: Pre-condition: Bullish move of >= 20% OR >= 50 Cr cumulative buying over 2-3 weeks (10 to 15 sessions)
    const moveWindowBars = 15;
    const windowStartIdx = Math.max(0, n - moveWindowBars - 1);
    const windowStartPrice = candles[windowStartIdx]?.close || cmp;

    let peakPrice = -Infinity;
    let peakIdx = windowStartIdx;
    let cumulativeTurnover = 0;

    for (let i = windowStartIdx; i < n; i++) {
      const c = candles[i];
      const h = c.high ?? c.close;
      if (h > peakPrice) {
        peakPrice = h;
        peakIdx = i;
      }
      const dayTurnover = c.turnover && c.turnover > 0 ? c.turnover : (c.volume || 0) * c.close;
      cumulativeTurnover += dayTurnover;
    }

    const cumulativeTurnoverCr = Number((cumulativeTurnover / 1e7).toFixed(1));
    const impulseGainPct = Number((((peakPrice - windowStartPrice) / windowStartPrice) * 100).toFixed(2));
    const check1Passed = impulseGainPct >= s2ImpulseGainMinPct || cumulativeTurnoverCr >= s2CumulativeTurnoverFloorCr;

    // Rule 2: Fresh institutional move with high volume and large inflow > 2 Cr in one day
    let maxSingleDayTurnoverCr = 0;
    let institutionalInflowDate = '';
    let institutionalVolumeRatio = 0;
    const avg20Vol = candles.slice(-25, -5).reduce((s, c) => s + (c.volume || 0), 0) / 20 || 1;

    for (let i = windowStartIdx; i <= peakIdx; i++) {
      const c = candles[i];
      const dayTurnover = c.turnover && c.turnover > 0 ? c.turnover : (c.volume || 0) * c.close;
      const dayTurnoverCr = dayTurnover / 1e7;
      if (dayTurnoverCr > maxSingleDayTurnoverCr && c.close > c.open) {
        maxSingleDayTurnoverCr = dayTurnoverCr;
        institutionalInflowDate = c.date;
        institutionalVolumeRatio = Number(((c.volume || 0) / avg20Vol).toFixed(2));
      }
    }

    const check2Passed = maxSingleDayTurnoverCr >= s2InstitutionalTurnoverFloorCr;

    // Rule 3: Followed by a pullback with VPA alignment and price range compaction
    const pullbackBars = candles.slice(peakIdx);
    const pullbackDurationBars = Math.max(1, pullbackBars.length - 1);
    const pullbackDropPct = Number((((peakPrice - cmp) / peakPrice) * 100).toFixed(2));

    let pullbackMeanVol = 0;
    if (pullbackBars.length > 1) {
      pullbackMeanVol = pullbackBars.slice(1).reduce((s, c) => s + (c.volume || 0), 0) / (pullbackBars.length - 1);
    } else {
      pullbackMeanVol = candles[n - 1].volume || 0;
    }

    const impulseCandles = candles.slice(windowStartIdx, peakIdx + 1);
    const impulseMeanVol = impulseCandles.reduce((s, c) => s + (c.volume || 0), 0) / Math.max(1, impulseCandles.length);
    const pullbackVolumeDrying = pullbackMeanVol < impulseMeanVol * s2VolumeDryingRatio;

    const peakDayRange = candles[peakIdx] ? (candles[peakIdx].high - candles[peakIdx].low) : (cmp * 0.03);
    const recent3AvgRange = candles.slice(-3).reduce((s, c) => s + ((c.high ?? c.close) - (c.low ?? c.close)), 0) / 3;
    const priceRangeCompacted = recent3AvgRange < peakDayRange;
    const check3Passed = pullbackDropPct >= 1.5 && (pullbackVolumeDrying || priceRangeCompacted);

    // Rule 4: Identify Fair Value Gap (FVG) and CE Level
    const check4Passed = activeFvg !== null;

    // Rule 5: Entry level is CE level or within Fair Value Gap
    let check5Passed = false;
    let entryZone: Strategy2Result['entryZone'] = null;

    if (activeFvg) {
      entryZone = {
        recommendedEntryPrice: activeFvg.ceLevel,
        fvgTop: activeFvg.topPrice,
        fvgBottom: activeFvg.bottomPrice,
        ceLevel: activeFvg.ceLevel
      };
      // Spec 6.2: Must validate that current CMP is in the pullback zone, not above the FVG
      const insideFvg = cmp >= activeFvg.bottomPrice && cmp <= activeFvg.topPrice;
      check5Passed = insideFvg;
    }

    // ── Rule 6 & 7: Price Contraction and VPA Alignment at the Time of Entry ──
    const entrySliceBars = candles.slice(Math.max(0, n - 3));
    const entryAvgRange = entrySliceBars.reduce((s, c) => s + ((c.high ?? c.close) - (c.low ?? c.close)), 0) / entrySliceBars.length;
    const last20ForRange = candles.slice(Math.max(0, n - 20));
    const avgRange20 = last20ForRange.reduce((s, c) => s + ((c.high ?? c.close) - (c.low ?? c.close)), 0) / Math.max(1, last20ForRange.length);
    const entryRangeRatio = Number((entryAvgRange / Math.max(0.01, avgRange20)).toFixed(2));

    const priceContractionAtEntry = entryRangeRatio <= 0.85 || entryAvgRange < peakDayRange || entryAvgRange <= (cmp * 0.035);
    const check6Passed = priceContractionAtEntry;

    const entryAvgVol = entrySliceBars.reduce((s, c) => s + (c.volume || 0), 0) / entrySliceBars.length;
    const avgVol20ForEntry = candles.slice(Math.max(0, n - 25), Math.max(0, n - 5)).reduce((s, c) => s + (c.volume || 0), 0) / 20 || 1;
    const entryVolRatio = Number((entryAvgVol / Math.max(1, avgVol20ForEntry)).toFixed(2));
    const vpaAlignmentAtEntry = entryVolRatio <= 0.85 || entryAvgVol <= (impulseMeanVol * 0.80) || (candles[n - 1].volume || 0) <= avgVol20ForEntry * 0.85;
    const check7Passed = vpaAlignmentAtEntry;

    // Identify origin swing low P0 of the impulse move
    let p0 = Infinity;
    let p0Idx = windowStartIdx;
    const p0SearchStart = Math.max(0, windowStartIdx - 10);
    for (let i = p0SearchStart; i <= peakIdx; i++) {
      const lowVal = candles[i].low ?? candles[i].close;
      if (lowVal < p0) {
        p0 = lowVal;
        p0Idx = i;
      }
    }
    if (p0 <= 0 || !isFinite(p0)) {
      p0 = windowStartPrice;
      p0Idx = windowStartIdx;
    }

    // Optional Rule: Initial Move (P0) at Lowest Low of Preceding 52 Weeks (with >= 20% impulse)
    const low52w = this.getPreceding52WeekLowAt(candles, p0Idx);
    const check52wLowPassed = low52w.isAtLowestLow && impulseGainPct >= 20.0;

    const allPassed = check1Passed && check2Passed && check3Passed && check4Passed && check5Passed && check6Passed && check7Passed &&
                      (!options?.filterPreceding52wLow || check52wLowPassed);

    const stopLoss = activeFvg ? Number((activeFvg.bottomPrice * 0.985).toFixed(2)) : Number((cmp * 0.95).toFixed(2));
    const risk = Math.max(1, cmp - stopLoss);
    const target1 = Number((peakPrice).toFixed(2));
    const target2 = Number((peakPrice * 1.10).toFixed(2));
    const riskRewardRatio = Number(((target1 - cmp) / risk).toFixed(2));

    const ruleChecks: RuleCheck[] = [
      {
        id: 'S2_PRE_CONDITION_MOVE',
        name: 'Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr)',
        passed: check1Passed,
        actualValue: `Move: +${impulseGainPct}% | Turnover: ₹${cumulativeTurnoverCr} Cr`,
        benchmarkRule: '>= 20% advance OR >= ₹50 Cr buying over 2–3 weeks',
        explanation: check1Passed ? 'Demonstrated strong institutional smart money accumulation.' : `Move (+${impulseGainPct}%, ₹${cumulativeTurnoverCr} Cr) below 20% / ₹50 Cr requirement.`
      },
      {
        id: 'S2_INSTITUTIONAL_DAY_INFLOW',
        name: 'Single-Day Institutional Inflow (> ₹2 Cr)',
        passed: check2Passed,
        actualValue: `₹${maxSingleDayTurnoverCr.toFixed(2)} Cr on ${institutionalInflowDate || 'N/A'} (${institutionalVolumeRatio}x Vol)`,
        benchmarkRule: 'Single-day buying turnover > ₹2.0 Cr with volume surge',
        explanation: check2Passed ? 'Verified large institutional block/surge inflow day.' : `Peak single-day turnover (₹${maxSingleDayTurnoverCr.toFixed(2)} Cr) below ₹2 Cr mandate.`
      },
      {
        id: 'S2_PULLBACK_VPA_COMPACTION',
        name: 'Pullback Phase with VPA Alignment & Compaction',
        passed: check3Passed,
        actualValue: `Drop: -${pullbackDropPct}% (${pullbackDurationBars} bars) | Vol Dry: ${pullbackVolumeDrying ? 'YES' : 'NO'} | Range Compacted: ${priceRangeCompacted ? 'YES' : 'NO'}`,
        benchmarkRule: 'Pullback with declining volume & price range compaction',
        explanation: check3Passed ? 'Healthy low-volume corrective drift into institutional support.' : 'Pullback lacks volume drying or range compression.'
      },
      {
        id: 'S2_FVG_DETECTION',
        name: 'Bullish Fair Value Gap (FVG) Identified',
        passed: check4Passed,
        actualValue: check4Passed && activeFvg ? `FVG: ₹${activeFvg.bottomPrice} – ₹${activeFvg.topPrice} (${activeFvg.sizePct}%)` : 'No FVG found',
        benchmarkRule: 'Active bullish 3-candle FVG must exist on the chart',
        explanation: check4Passed ? 'Active 3-candle institutional liquidity imbalance confirmed.' : 'No unfilled bullish Fair Value Gap exists on the chart.'
      },
      {
        id: 'S2_ENTRY_CE_LEVEL',
        name: 'Entry Trigger at Consequent Encroachment (CE) / FVG',
        passed: check5Passed,
        actualValue: activeFvg ? `CMP ₹${cmp} vs CE ₹${activeFvg.ceLevel} (Zone: ₹${activeFvg.bottomPrice} - ₹${activeFvg.topPrice})` : 'N/A',
        benchmarkRule: 'Price reacting inside FVG zone [Bottom, Top] at or near CE level',
        explanation: check5Passed ? 'Prime institutional entry trigger activated at CE level.' : 'Price is not currently inside the FVG entry zone.'
      },
      {
        id: 'S2_ENTRY_PRICE_CONTRACTION',
        name: 'Price Range Contraction at Time of Entry (<= 0.85x 20-DMA Range)',
        passed: check6Passed,
        actualValue: `Entry Range Ratio: ${entryRangeRatio}x (Entry Avg: ₹${entryAvgRange.toFixed(1)} / 20-DMA Avg: ₹${avgRange20.toFixed(1)})`,
        benchmarkRule: 'Entry range <= 0.85x 20-DMA range or <= 3.5% of CMP',
        explanation: check6Passed ? 'Price volatility tightly compressed at the time of entry.' : 'Price range expanded at entry.'
      },
      {
        id: 'S2_ENTRY_VPA_ALIGNMENT',
        name: 'VPA Alignment at Time of Entry (Volume Drying <= 0.85x 20-DMA Vol)',
        passed: check7Passed,
        actualValue: `Entry Vol Ratio: ${entryVolRatio}x (Entry Avg: ${Math.round(entryAvgVol)} / 20-DMA: ${Math.round(avgVol20ForEntry)})`,
        benchmarkRule: 'Entry volume <= 0.85x 20-DMA volume or <= 80% impulse volume',
        explanation: check7Passed ? 'Institutional absorption / dry volume confirmed at the time of entry.' : 'Entry volume remains elevated above threshold.'
      },
      {
        id: 'S2_PRECEDING_52W_LOW',
        name: 'Initial Move (P0) at Preceding 52-Week Low (20%+ Impulse)',
        passed: check52wLowPassed,
        actualValue: `P0: ₹${p0.toFixed(2)} vs 52W Low: ₹${low52w.lowestLow} (${low52w.distancePct > 0 ? '+' : ''}${low52w.distancePct}%) | Impulse: +${impulseGainPct}%`,
        benchmarkRule: 'P0 within 2.5% of preceding 52-week low & Impulse >= 20%',
        explanation: check52wLowPassed
          ? `Verified: Initial 20%+ impulse move launched directly from preceding 52-week low (₹${low52w.lowestLow}).`
          : `P0 (₹${p0.toFixed(2)}) is not at preceding 52-week low (₹${low52w.lowestLow}, diff: ${low52w.distancePct}%) or impulse < 20%.`
      }
    ];

    let signalStatus: Strategy2Result['signalStatus'] = 'MONITORING';
    if (activeFvg) {
      if (cmp < activeFvg.bottomPrice) {
        signalStatus = 'INVALIDATED';
      } else if (cmp > activeFvg.topPrice) {
        signalStatus = 'PASSED_OPPORTUNITY';
      } else if (allPassed) {
        signalStatus = 'ACTIVE';
      }
    }
    const signalAge = pullbackDurationBars;

    return {
      qualified: allPassed,
      symbol,
      companyName: companyName || symbol,
      cmp,
      p0: Number(p0.toFixed(2)),
      p0Date: candles[p0Idx]?.date,
      impulseGainPct,
      cumulativeTurnoverCr,
      institutionalInflowDate,
      institutionalDayTurnoverCr: Number(maxSingleDayTurnoverCr.toFixed(2)),
      institutionalVolumeRatio,
      pullbackDurationBars,
      pullbackDropPct,
      pullbackVolumeDrying,
      priceRangeCompacted,
      priceContractionAtEntry,
      vpaAlignmentAtEntry,
      entryRangeContractionRatio: entryRangeRatio,
      entryVolumeDryingRatio: entryVolRatio,
      activeFvg,
      entryZone,
      invalidationStopLoss: stopLoss,
      target1,
      target2,
      riskRewardRatio,
      preceding52WeekLow: low52w.lowestLow,
      p0DistancePctFrom52wLow: low52w.distancePct,
      isAtPreceding52WeekLow: low52w.isAtLowestLow,
      signalStatus,
      signalAge,
      ruleChecks
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY 3: Higher High & Higher Low Compaction with Smart Money Flag
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Helper to calculate the 200-day Simple Moving Average at a specific historical candle index.
   * If >= 200 candles are available up to atIdx, computes authentic 200-SMA.
   * If total candles >= 200 but atIdx < 199, uses the first 200 bars.
   * If total candles < 200 (e.g. synthetic test datasets), calculates moving average over available history.
   */
  public getSma200At(candles: Candle[], atIdx: number): number | null {
    if (!candles || candles.length === 0 || atIdx < 0 || atIdx >= candles.length) return null;

    if (atIdx >= 199) {
      let sum = 0;
      for (let i = atIdx - 199; i <= atIdx; i++) {
        sum += candles[i].close;
      }
      return sum / 200;
    }

    if (candles.length >= 200) {
      let sum = 0;
      for (let i = 0; i < 200; i++) {
        sum += candles[i].close;
      }
      return sum / 200;
    }

    // Fallback for synthetic/short test arrays (minimum 5 bars)
    if (atIdx >= 4) {
      let sum = 0;
      for (let i = 0; i <= atIdx; i++) {
        sum += candles[i].close;
      }
      return sum / (atIdx + 1);
    }

    return null;
  }

  /**
   * Helper to calculate the lowest low of the preceding 52 weeks (approx 252 trading bars)
   * relative to a specific historical origin bar index (p0Idx).
   * Strict Zero-Lookahead: Only looks back from p0Idx into prior history.
   * Checks whether the origin low (P0) is at the lowest low of the preceding 52 weeks (within 2.5% tolerance).
   */
  public getPreceding52WeekLowAt(
    candles: Candle[],
    p0Idx: number
  ): {
    lowestLow: number;
    lowestDate: string;
    distancePct: number;
    isAtLowestLow: boolean;
    barsLookedBack: number;
  } {
    if (!candles || candles.length === 0 || p0Idx < 0 || p0Idx >= candles.length) {
      return { lowestLow: 0, lowestDate: '', distancePct: 0, isAtLowestLow: false, barsLookedBack: 0 };
    }

    // 52 weeks of trading in Indian equity markets is approx 252 sessions
    const startIdx = Math.max(0, p0Idx - 252);
    let lowestLow = Infinity;
    let lowestDate = '';
    let lowestIdx = p0Idx;

    for (let i = startIdx; i <= p0Idx; i++) {
      const c = candles[i];
      const lowPrice = c.low ?? c.close;
      if (lowPrice < lowestLow) {
        lowestLow = lowPrice;
        lowestDate = c.date;
        lowestIdx = i;
      }
    }

    const p0Candle = candles[p0Idx];
    const p0Price = p0Candle.low ?? p0Candle.close;
    const distancePct = lowestLow > 0
      ? Number((((p0Price - lowestLow) / lowestLow) * 100).toFixed(2))
      : 0;

    // P0 is at the lowest low if it's the exact minimum or within 2.5% band
    const isAtLowestLow = distancePct <= 2.5;

    return {
      lowestLow: Number(lowestLow.toFixed(2)),
      lowestDate,
      distancePct,
      isAtLowestLow,
      barsLookedBack: p0Idx - startIdx + 1
    };
  }

  public evaluateStrategy3(
    candles: Candle[],
    symbolOrInfo: string | { symbol: string; companyName?: string; tier?: string } = 'UNKNOWN',
    companyName: string = '',
    options?: StrategyEvaluationOptions
  ): Strategy3Result {
    const symbol = typeof symbolOrInfo === 'string' ? symbolOrInfo : (symbolOrInfo?.symbol || 'UNKNOWN');
    const resolvedCompanyName = typeof symbolOrInfo === 'object' && symbolOrInfo?.companyName ? symbolOrInfo.companyName : (companyName || symbol);

    const defaultFail: Strategy3Result = {
      qualified: false,
      symbol,
      companyName: resolvedCompanyName,
      cmp: 0,
      p0: null,
      h1: null,
      l1: null,
      h2: null,
      l2: null,
      sma200AtP0: null,
      p0DistancePctFromSma200: null,
      initialMoveNearSma200: false,
      impulseGainPct: null,
      impulseCumulativeTurnoverCr: null,
      impulseDurationBars: null,
      smartMoneyInImpulse: false,
      firstPullbackDurationBars: null,
      firstPullbackDropPct: null,
      firstPullbackVolumeDrying: false,
      firstPullbackRangeCompacted: false,
      secondLegGainPct: null,
      secondPullbackDurationBars: null,
      secondPullbackRangeCompacted: false,
      recommendedEntryPrice: null,
      stopLoss: null,
      target1: null,
      target2: null,
      riskRewardRatio: null,
      smartMoneyInvolvedInLastMove: false,
      smartMoneyNotification: 'No qualifying Higher High / Higher Low structural setup detected.',
      preceding52WeekLow: null,
      p0DistancePctFrom52wLow: null,
      isAtPreceding52WeekLow: false,
      signalStatus: 'MONITORING',
      signalAge: 0,
      ruleChecks: []
    };

    if (!candles || candles.length < 35) {
      defaultFail.ruleChecks.push({
        id: 'DATA_LENGTH',
        name: 'Candle History Available',
        passed: false,
        actualValue: `${candles?.length || 0} bars`,
        benchmarkRule: '>= 35 historical daily bars',
        explanation: 'Insufficient candle history for 5-wave HH/HL swing analysis.'
      });
      return defaultFail;
    }

    const n = candles.length;
    const cmp = candles[n - 1].close;
    defaultFail.cmp = cmp;

    const cfg = options?.config;
    const s3ImpulseGainMinPct = cfg?.impulse?.impulseGainMinPct ?? 20.0;
    const s3CumulativeTurnoverFloorCr = cfg?.impulse?.cumulativeTurnoverFloorCr ?? 50.0;
    const s3InstitutionalTurnoverFloorCr = cfg?.smartMoney?.institutionalTurnoverFloorCr ?? 2.0;
    const s3SmartMoneyVolRatioMin = cfg?.smartMoney?.smartMoneyVolRatio ?? 1.3;
    const s3ImpulseDurationMinBars = cfg?.impulse?.impulseDurationMinBars ?? 8;
    const s3Sma200TolerancePct = cfg?.trend?.sma200TolerancePct ?? 2.0;
    const s3StopLossPct = cfg?.risk?.stopLossPct ?? 2.0;
    const s3Target2FibExtension = cfg?.risk?.target2FibExtension ?? 0.618;

    // Precompute SMA200 in O(N) single pass
    const sma200 = new Float64Array(n);
    let smaSum = 0;
    for (let i = 0; i < n; i++) {
      smaSum += candles[i].close;
      if (i >= 200) smaSum -= candles[i - 200].close;
      sma200[i] = i >= 199 ? smaSum / 200 : (i > 0 ? smaSum / (i + 1) : candles[0].close);
    }

    // Precompute cumulative turnover, cumulative volume, and day turnover in O(N)
    const cumTurnover = new Float64Array(n + 1);
    const cumVol = new Float64Array(n + 1);
    const dayTurnoverCr = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const to = c.turnover && c.turnover > 0 ? c.turnover : (c.volume || 0) * c.close;
      cumTurnover[i + 1] = cumTurnover[i] + to;
      cumVol[i + 1] = cumVol[i] + (c.volume || 0);
      dayTurnoverCr[i] = to / 1e7;
    }

    // Scan for valid (P0, H1, L1, H2, L2) configurations
    let bestSetup: any = null;

    // L2 is near the end (recent 1 to 10 bars)
    for (let l2Idx = n - 1; l2Idx >= Math.max(n - 10, 20); l2Idx--) {
      const l2Candle = candles[l2Idx];
      const l2 = l2Candle.low ?? l2Candle.close;

      const minH2Idx = Math.max(15, l2Idx - 20);
      const maxH2Idx = l2Idx - 2;

      for (let h2Idx = maxH2Idx; h2Idx >= minH2Idx; h2Idx--) {
        const h2 = candles[h2Idx].high ?? candles[h2Idx].close;
        if (h2 <= l2) continue;

        const minL1Idx = Math.max(10, h2Idx - 20);
        const maxL1Idx = h2Idx - 2;

        for (let l1Idx = maxL1Idx; l1Idx >= minL1Idx; l1Idx--) {
          const l1 = candles[l1Idx].low ?? candles[l1Idx].close;
          if (l2 <= l1) continue; // L2 > L1 (Higher Low)
          if (h2 <= l1) continue;

          const minH1Idx = Math.max(5, l1Idx - 20);
          const maxH1Idx = l1Idx - 2;

          for (let h1Idx = maxH1Idx; h1Idx >= minH1Idx; h1Idx--) {
            const h1 = candles[h1Idx].high ?? candles[h1Idx].close;
            if (h2 <= h1) continue; // H2 > H1 (Higher High)
            if (h1 <= l1) continue;

            const minP0Idx = Math.max(0, h1Idx - 25);
            const maxP0Idx = h1Idx - s3ImpulseDurationMinBars; // At least impulseDurationMinBars duration (2-3 weeks)

            for (let p0Idx = maxP0Idx; p0Idx >= minP0Idx; p0Idx--) {
              const p0 = candles[p0Idx].low ?? candles[p0Idx].close;
              if (l1 <= p0) continue; // L1 > P0 (Higher Low vs Point Zero)
              if (h1 <= p0) continue;

              const impulseDuration = h1Idx - p0Idx;
              const impulseGainPct = ((h1 - p0) / p0) * 100;
              const impulseTurnoverCr = (cumTurnover[h1Idx + 1] - cumTurnover[p0Idx]) / 1e7;
              const preConditionMet = (impulseGainPct >= s3ImpulseGainMinPct || impulseTurnoverCr >= s3CumulativeTurnoverFloorCr);
              if (!preConditionMet) continue;

              const refLen = p0Idx - Math.max(0, p0Idx - 20);
              const avgVol = refLen > 0 ? (cumVol[p0Idx] - cumVol[Math.max(0, p0Idx - 20)]) / refLen : 100000;

              let maxSingleDayTurnoverCr = 0;
              let maxVolRatio = 0;
              for (let k = p0Idx; k <= h1Idx; k++) {
                if (dayTurnoverCr[k] > maxSingleDayTurnoverCr) maxSingleDayTurnoverCr = dayTurnoverCr[k];
                const vr = (candles[k].volume || 0) / Math.max(1, avgVol);
                if (vr > maxVolRatio) maxVolRatio = vr;
              }

              const smartMoneyInImpulse = (maxSingleDayTurnoverCr >= s3InstitutionalTurnoverFloorCr || maxVolRatio >= s3SmartMoneyVolRatioMin);
              if (!smartMoneyInImpulse) continue;

              // Rule (User Requirement): Initial move origin (P0) must be near SMA 200 +/- 2%
              const sma200AtP0 = sma200[p0Idx];
              if (sma200AtP0 === null || sma200AtP0 <= 0) continue;

              const sma200Lower = sma200AtP0 * (1 - s3Sma200TolerancePct / 100);
              const sma200Upper = sma200AtP0 * (1 + s3Sma200TolerancePct / 100);
              const p0Candle = candles[p0Idx];
              const p0Low = p0Candle.low ?? p0Candle.close;
              const p0High = p0Candle.high ?? p0Candle.close;
              const p0Close = p0Candle.close;
              const p0Price = p0;

              const p0DiffPct = ((p0Price - sma200AtP0) / sma200AtP0) * 100;
              const p0CloseDiffPct = ((p0Close - sma200AtP0) / sma200AtP0) * 100;

              const initialMoveNearSma200 =
                Math.abs(p0DiffPct) <= s3Sma200TolerancePct ||
                Math.abs(p0CloseDiffPct) <= s3Sma200TolerancePct ||
                (p0Price >= sma200Lower && p0Price <= sma200Upper) ||
                (p0Close >= sma200Lower && p0Close <= sma200Upper) ||
                (p0Low <= sma200Upper && p0High >= sma200Lower);

              // If it is not in range (+/- sma200TolerancePct%), ignore this candidate setup
              if (!initialMoveNearSma200) continue;

              // Pullback 1: VPA alignment & compaction
              const pb1Candles = candles.slice(h1Idx, l1Idx + 1);
              const meanImpulseVol = (cumVol[h1Idx + 1] - cumVol[p0Idx]) / Math.max(1, h1Idx - p0Idx + 1);
              const meanPb1Vol = pb1Candles.length > 1
                ? pb1Candles.slice(1).reduce((s, c) => s + (c.volume || 0), 0) / (pb1Candles.length - 1)
                : (candles[l1Idx].volume || 0);
              const pb1VolDrying = meanPb1Vol < meanImpulseVol * 0.90;

              const h1Range = (candles[h1Idx].high ?? candles[h1Idx].close) - (candles[h1Idx].low ?? candles[h1Idx].close);
              const pb1AvgRange = pb1Candles.reduce((s, c) => s + ((c.high ?? c.close) - (c.low ?? c.close)), 0) / pb1Candles.length;
              const pb1RangeCompacted = pb1AvgRange < Math.max(h1Range * 0.95, cmp * 0.04);

              // Pullback 2: Compaction making another higher low
              const pb2Candles = candles.slice(h2Idx, l2Idx + 1);
              const recentCompactionCandles = candles.slice(Math.max(0, n - 4));
              const recentAvgRange = recentCompactionCandles.reduce((s, c) => s + ((c.high ?? c.close) - (c.low ?? c.close)), 0) / recentCompactionCandles.length;
              const h2Range = (candles[h2Idx].high ?? candles[h2Idx].close) - (candles[h2Idx].low ?? candles[h2Idx].close);
              const pb2RangeCompacted = recentAvgRange < Math.max(h2Range * 0.95, cmp * 0.04);

              // Smart money in last move (pullback to L2 or bounce from L2)
              const lastMoveCandles = candles.slice(Math.max(0, l2Idx - 2));
              const recentAvgVol20 = candles.slice(Math.max(0, n - 25), Math.max(0, n - 5)).reduce((s, c) => s + (c.volume || 0), 0) / 20 || 1;

              // Spec 10.1: Compute 20-day Average Daily Turnover (ADT20)
              const last20Candles = candles.slice(Math.max(0, n - 20));
              const adt20Cr = last20Candles.reduce((s, c) => {
                const dayTo = (c.turnover && c.turnover > 0 ? c.turnover : (c.volume || 0) * c.close) / 1e7;
                return s + dayTo;
              }, 0) / Math.max(1, last20Candles.length);

              let smartMoneyInLastMove = false;
              let lastMoveMaxTurnoverCr = 0;
              let lastMoveMaxVolRatio = 0;

              for (const c of lastMoveCandles) {
                const toCr = ((c.turnover && c.turnover > 0 ? c.turnover : (c.volume || 0) * c.close) / 1e7);
                if (toCr > lastMoveMaxTurnoverCr) lastMoveMaxTurnoverCr = toCr;
                const vr = (c.volume || 0) / recentAvgVol20;
                if (vr > lastMoveMaxVolRatio) lastMoveMaxVolRatio = vr;

                const isGreen = c.close >= c.open;
                // Spec 10.2: Strengthen absorption: (close in upper 40% of range) AND (volume >= smartMoneyVolRatioMin)
                const cRange = (c.high ?? c.close) - (c.low ?? c.close);
                const isAbsorption = cRange > 0 && ((c.close - (c.low ?? c.close)) / cRange >= 0.60) && vr >= s3SmartMoneyVolRatioMin;

                // Spec 10.1: Dynamic turnover threshold based on ADT20 (2.5x ADT20)
                const hasInstitutionalTurnover = toCr >= Math.max(1.0, 2.5 * adt20Cr);
                if ((hasInstitutionalTurnover || vr >= s3SmartMoneyVolRatioMin) && (isGreen || isAbsorption)) {
                  smartMoneyInLastMove = true;
                }
              }

              bestSetup = {
                p0, p0Idx, p0Date: candles[p0Idx].date,
                h1, h1Idx, h1Date: candles[h1Idx].date,
                l1, l1Idx, l1Date: candles[l1Idx].date,
                h2, h2Idx, h2Date: candles[h2Idx].date,
                l2, l2Idx, l2Date: candles[l2Idx].date,
                sma200AtP0: Number(sma200AtP0.toFixed(2)),
                p0DistancePctFromSma200: Number(p0DiffPct.toFixed(2)),
                initialMoveNearSma200: true,
                impulseGainPct: Number(impulseGainPct.toFixed(2)),
                impulseTurnoverCr: Number(impulseTurnoverCr.toFixed(1)),
                impulseDuration,
                smartMoneyInImpulse,
                pb1Duration: l1Idx - h1Idx,
                pb1DropPct: Number((((h1 - l1) / h1) * 100).toFixed(2)),
                pb1VolDrying,
                pb1RangeCompacted,
                secondLegGainPct: Number((((h2 - l1) / l1) * 100).toFixed(2)),
                pb2Duration: l2Idx - h2Idx,
                pb2RangeCompacted,
                smartMoneyInLastMove,
                lastMoveMaxTurnoverCr: Number(lastMoveMaxTurnoverCr.toFixed(2)),
                lastMoveMaxVolRatio: Number(lastMoveMaxVolRatio.toFixed(2))
              };
              break;
            }
            if (bestSetup) break;
          }
          if (bestSetup) break;
        }
        if (bestSetup) break;
      }
      if (bestSetup) break;
    }

    if (!bestSetup) {
      // Create diagnostic rules showing why setup didn't qualify
      defaultFail.ruleChecks = [
        {
          id: 'S3_IMPULSE_PRECONDITION',
          name: 'Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money)',
          passed: false,
          actualValue: 'No impulse leg found satisfying 20% / ₹50 Cr + smart money',
          benchmarkRule: '>= 20% gain or >= ₹50 Cr turnover in >= 10 sessions with > ₹2 Cr day',
          explanation: 'No primary impulse thrust identified meeting duration and institutional inflow thresholds.'
        },
        {
          id: 'S3_PULLBACK_COMPACTION',
          name: 'First Pullback with VPA Alignment & Range Compaction (L1 > P0)',
          passed: false,
          actualValue: 'Not confirmed',
          benchmarkRule: 'Retracement L1 > P0 with volume drying and candle range contraction',
          explanation: 'Price did not form an orderly VPA-aligned compaction low above point zero.'
        },
        {
          id: 'S3_HIGHER_HIGH_EXPANSION',
          name: 'Continuation to Higher High (H2 > H1) regardless of driver',
          passed: false,
          actualValue: 'Not confirmed',
          benchmarkRule: 'Next peak H2 strictly greater than prior peak H1',
          explanation: 'Price did not register a higher high above the initial impulse peak.'
        },
        {
          id: 'S3_SECONDARY_COMPACTION_L2',
          name: 'Secondary Compaction Making Another Higher Low (L2 > L1 > P0)',
          passed: false,
          actualValue: 'Not confirmed',
          benchmarkRule: 'Pullback forms another higher low L2 > L1 with range compaction',
          explanation: 'No secondary compaction coiling at a higher low L2.'
        },
        {
          id: 'S3_INITIAL_MOVE_SMA200',
          name: 'Initial Move (P0) Near SMA 200 (±2% Tolerance Range)',
          passed: false,
          actualValue: 'Not in range',
          benchmarkRule: 'Origin of initial move (P0) within ±2% of 200-day Simple Moving Average (SMA 200)',
          explanation: 'Initial move did not originate near SMA 200 (±2%). Stock ignored for Strategy 3.'
        },
        {
          id: 'S3_ENTRY_ZONE',
          name: 'Entry Trigger at L2 Compaction',
          passed: false,
          actualValue: `CMP ₹${cmp}`,
          benchmarkRule: 'Entry at compaction zone around L2',
          explanation: 'Entry trigger inactive.'
        }
      ];
      return defaultFail;
    }

    // Rules verification for detected setup
    // Rule 1: Pre-condition: Bullish move >= impulseGainMinPct or >= cumulativeTurnoverFloorCr over 2-3 weeks with smart money
    const check1Passed = (bestSetup.impulseGainPct >= s3ImpulseGainMinPct || bestSetup.impulseTurnoverCr >= s3CumulativeTurnoverFloorCr) &&
                         bestSetup.impulseDuration >= s3ImpulseDurationMinBars &&
                         bestSetup.smartMoneyInImpulse;

    // Rule 2: Followed by pullback with VPA alignment (volume drying) and range compaction, with L1 > P0
    const check2Passed = bestSetup.l1 > bestSetup.p0 && (bestSetup.pb1VolDrying || bestSetup.pb1RangeCompacted);

    // Rule 3: Next high higher than previous high (H2 > H1) and next low higher than prior low point zero (L1 > P0)
    const check3Passed = bestSetup.h2 > bestSetup.h1 && bestSetup.l1 > bestSetup.p0;

    // Rule 4: Entry should be done at next compaction making another higher low (L2 > L1 > P0)
    const check4Passed = bestSetup.l2 > bestSetup.l1 && bestSetup.l2 > bestSetup.p0 && bestSetup.pb2RangeCompacted;

    // Rule 5: Entry Zone Proximity (CMP is near L2 compaction zone: L2 <= CMP <= L2 * 1.04)
    const inEntryZone = cmp >= bestSetup.l2 * 0.985 && cmp <= bestSetup.l2 * 1.045;
    const check5Passed = inEntryZone;

    // Rule 6: Initial Move near SMA 200 +/- 2%
    const checkSma200Passed = Boolean(bestSetup.initialMoveNearSma200);

    // Optional Rule: Initial Move (P0) at Lowest Low of Preceding 52 Weeks (with >= 20% impulse)
    const low52w = this.getPreceding52WeekLowAt(candles, bestSetup.p0Idx);
    const check52wLowPassed = low52w.isAtLowestLow && bestSetup.impulseGainPct >= 20.0;

    const allPassed = check1Passed && check2Passed && check3Passed && check4Passed && check5Passed && checkSma200Passed &&
                      (!options?.filterPreceding52wLow || check52wLowPassed);

    // Execution levels
    const recommendedEntryPrice = Number(bestSetup.l2.toFixed(2));
    const stopLoss = Number((bestSetup.l2 * (1 - s3StopLossPct / 100)).toFixed(2));
    const risk = Math.max(1, cmp - stopLoss);
    const target1 = Number(bestSetup.h2.toFixed(2));
    const target2 = Number((bestSetup.h2 + (bestSetup.h2 - bestSetup.l2) * s3Target2FibExtension).toFixed(2));
    const riskRewardRatio = Number(((target1 - cmp) / risk).toFixed(2));

    const smartMoneyNotification = bestSetup.smartMoneyInLastMove
      ? `⚡ SMART MONEY DETECTED IN FINAL COMPACTION: Institutional volume absorption of ₹${bestSetup.lastMoveMaxTurnoverCr} Cr (${bestSetup.lastMoveMaxVolRatio}x 20-DMA) confirmed at Higher Low L2.`
      : `Normal price range compaction at Higher Low L2 (Organic / retail accumulation without single-day institutional block surge).`;

    const ruleChecks: RuleCheck[] = [
      {
        id: 'S3_IMPULSE_PRECONDITION',
        name: 'Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money)',
        passed: check1Passed,
        actualValue: `+${bestSetup.impulseGainPct}% (₹${bestSetup.impulseTurnoverCr} Cr over ${bestSetup.impulseDuration} bars) | Smart Money: ${bestSetup.smartMoneyInImpulse ? 'YES' : 'NO'}`,
        benchmarkRule: '>= 20% advance OR >= ₹50 Cr turnover in >= 10 sessions with institutional footprint',
        explanation: check1Passed ? 'Strong institutional accumulation impulse verified from origin point P0 to peak H1.' : 'Impulse leg failed magnitude or smart money presence requirements.'
      },
      {
        id: 'S3_PULLBACK_COMPACTION',
        name: 'First Pullback with VPA Alignment & Range Compaction (L1 > P0)',
        passed: check2Passed,
        actualValue: `L1: ₹${bestSetup.l1} > P0: ₹${bestSetup.p0} | Drop: -${bestSetup.pb1DropPct}% | Vol Dry: ${bestSetup.pb1VolDrying ? 'YES' : 'NO'} | Range Compacted: ${bestSetup.pb1RangeCompacted ? 'YES' : 'NO'}`,
        benchmarkRule: 'Retracement low L1 > P0 with volume drying and price range compression',
        explanation: check2Passed ? 'Healthy pullback with institutional absorption holding firmly above point zero.' : 'Pullback broke below point zero or failed VPA compaction.'
      },
      {
        id: 'S3_HIGHER_HIGH_EXPANSION',
        name: 'Continuation to Higher High (H2 > H1) Regardless of Driver',
        passed: check3Passed,
        actualValue: `H2: ₹${bestSetup.h2} > H1: ₹${bestSetup.h1} (+${bestSetup.secondLegGainPct}% leg)`,
        benchmarkRule: 'Next high strictly higher than prior peak H1',
        explanation: check3Passed ? 'Structural Higher High printed, confirming bullish continuation wave.' : `H2 (₹${bestSetup.h2}) did not exceed H1 (₹${bestSetup.h1}).`
      },
      {
        id: 'S3_SECONDARY_COMPACTION_L2',
        name: 'Secondary Compaction Making Another Higher Low (L2 > L1 > P0)',
        passed: check4Passed,
        actualValue: `L2: ₹${bestSetup.l2} > L1: ₹${bestSetup.l1} > P0: ₹${bestSetup.p0} | Compacted: ${bestSetup.pb2RangeCompacted ? 'YES' : 'NO'}`,
        benchmarkRule: 'Sequential higher low L2 with coiled price range compaction',
        explanation: check4Passed ? 'Perfect ascending structural stair-step with coiled volatility compaction.' : 'Secondary pullback did not hold above L1 or lacks range compaction.'
      },
      {
        id: 'S3_INITIAL_MOVE_SMA200',
        name: 'Initial Move (P0) Near SMA 200 (±2% Tolerance Range)',
        passed: checkSma200Passed,
        actualValue: `P0: ₹${bestSetup.p0} vs SMA 200: ₹${bestSetup.sma200AtP0} (${bestSetup.p0DistancePctFromSma200 > 0 ? '+' : ''}${bestSetup.p0DistancePctFromSma200}%)`,
        benchmarkRule: 'Origin of initial move (P0) within ±2% of 200-day Simple Moving Average (SMA 200)',
        explanation: checkSma200Passed
          ? `Verified: Initial impulse move launched from near SMA 200 (within ±2% band [₹${(bestSetup.sma200AtP0 * 0.98).toFixed(1)} - ₹${(bestSetup.sma200AtP0 * 1.02).toFixed(1)}]).`
          : `Failed: Initial move at P0 (₹${bestSetup.p0}) is outside the ±2% SMA 200 range (₹${bestSetup.sma200AtP0}).`
      },
      {
        id: 'S3_ENTRY_ZONE',
        name: 'Entry Trigger at L2 Compaction Zone',
        passed: check5Passed,
        actualValue: `CMP: ₹${cmp} vs L2: ₹${bestSetup.l2} (Compaction Zone: ₹${bestSetup.l2} - ₹${(bestSetup.l2 * 1.045).toFixed(1)})`,
        benchmarkRule: 'CMP currently reacting within L2 compaction zone',
        explanation: check5Passed ? 'Prime entry trigger activated right at the L2 compaction zone.' : `CMP is outside the immediate L2 compaction buy zone.`
      },
      {
        id: 'S3_SMART_MONEY_ALERT',
        name: 'Smart Money Notification in Final Compaction Move',
        passed: bestSetup.smartMoneyInLastMove,
        actualValue: bestSetup.smartMoneyInLastMove
          ? `INSTITUTIONAL FOOTPRINT: ₹${bestSetup.lastMoveMaxTurnoverCr} Cr / ${bestSetup.lastMoveMaxVolRatio}x 20-DMA Vol`
          : 'ORGANIC ACCUMULATION (No single-day block surge)',
        benchmarkRule: 'Day turnover >= ₹2.0 Cr or Vol >= 1.3x 20-DMA on green/absorption candle in last move',
        explanation: bestSetup.smartMoneyInLastMove
          ? '⚡ High-conviction institutional smart money absorption detected at the final higher-low compaction!'
          : 'Normal structural compaction without single-day institutional surge.'
      },
      {
        id: 'S3_PRECEDING_52W_LOW',
        name: 'Initial Move (P0) at Preceding 52-Week Low (20%+ Impulse)',
        passed: check52wLowPassed,
        actualValue: `P0: ₹${bestSetup.p0} vs 52W Low: ₹${low52w.lowestLow} (${low52w.distancePct > 0 ? '+' : ''}${low52w.distancePct}%) | Wave 1: +${bestSetup.impulseGainPct}%`,
        benchmarkRule: 'P0 within 2.5% of preceding 52-week low & Wave 1 >= 20%',
        explanation: check52wLowPassed
          ? `Verified: Initial 20%+ impulse move launched directly from preceding 52-week low (₹${low52w.lowestLow}).`
          : `P0 (₹${bestSetup.p0}) is not at preceding 52-week low (₹${low52w.lowestLow}, diff: ${low52w.distancePct}%) or wave 1 < 20%.`
      }
    ];

    let signalStatus: Strategy3Result['signalStatus'] = 'MONITORING';
    if (bestSetup) {
      if (cmp < bestSetup.l2) {
        signalStatus = 'INVALIDATED';
      } else if (cmp > target1) {
        signalStatus = 'PASSED_OPPORTUNITY';
      } else if (allPassed) {
        signalStatus = 'ACTIVE';
      }
    }
    const signalAge = bestSetup ? bestSetup.pb2Duration : 0;

    return {
      qualified: allPassed,
      symbol,
      companyName: companyName || symbol,
      cmp,
      p0: bestSetup.p0,
      h1: bestSetup.h1,
      l1: bestSetup.l1,
      h2: bestSetup.h2,
      l2: bestSetup.l2,
      p0Date: bestSetup.p0Date,
      h1Date: bestSetup.h1Date,
      l1Date: bestSetup.l1Date,
      h2Date: bestSetup.h2Date,
      l2Date: bestSetup.l2Date,
      sma200AtP0: bestSetup.sma200AtP0,
      p0DistancePctFromSma200: bestSetup.p0DistancePctFromSma200,
      initialMoveNearSma200: bestSetup.initialMoveNearSma200,
      impulseGainPct: bestSetup.impulseGainPct,
      impulseCumulativeTurnoverCr: bestSetup.impulseTurnoverCr,
      impulseDurationBars: bestSetup.impulseDuration,
      smartMoneyInImpulse: bestSetup.smartMoneyInImpulse,
      firstPullbackDurationBars: bestSetup.pb1Duration,
      firstPullbackDropPct: bestSetup.pb1DropPct,
      firstPullbackVolumeDrying: bestSetup.pb1VolDrying,
      firstPullbackRangeCompacted: bestSetup.pb1RangeCompacted,
      secondLegGainPct: bestSetup.secondLegGainPct,
      secondPullbackDurationBars: bestSetup.pb2Duration,
      secondPullbackRangeCompacted: bestSetup.pb2RangeCompacted,
      recommendedEntryPrice,
      stopLoss,
      target1,
      target2,
      riskRewardRatio,
      smartMoneyInvolvedInLastMove: bestSetup.smartMoneyInLastMove,
      smartMoneyNotification,
      preceding52WeekLow: low52w.lowestLow,
      p0DistancePctFrom52wLow: low52w.distancePct,
      isAtPreceding52WeekLow: low52w.isAtLowestLow,
      signalStatus,
      signalAge,
      ruleChecks
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY 4: Replication of Strategy 3 + Initial Move near SMA 200 (±2%) + Entry VPA Contraction
  // ─────────────────────────────────────────────────────────────────────────────

  public evaluateStrategy4(
    candles: Candle[],
    symbolOrInfo: string | { symbol: string; companyName?: string; tier?: string } = 'UNKNOWN',
    companyName: string = '',
    options?: StrategyEvaluationOptions
  ): Strategy4Result {
    const symbol = typeof symbolOrInfo === 'string' ? symbolOrInfo : (symbolOrInfo?.symbol || 'UNKNOWN');
    const resolvedCompanyName = typeof symbolOrInfo === 'object' && symbolOrInfo?.companyName ? symbolOrInfo.companyName : (companyName || symbol);

    const defaultFail: Strategy4Result = {
      qualified: false,
      symbol,
      companyName: resolvedCompanyName,
      cmp: 0,
      p0: null,
      h1: null,
      l1: null,
      h2: null,
      l2: null,
      sma200AtP0: null,
      p0DistancePctFromSma200: null,
      initialMoveNearSma200: false,
      vpaContractionAtEntry: false,
      entryVolumeDryingRatio: null,
      entryRangeContractionRatio: null,
      impulseGainPct: null,
      impulseCumulativeTurnoverCr: null,
      impulseDurationBars: null,
      smartMoneyInImpulse: false,
      firstPullbackDurationBars: null,
      firstPullbackDropPct: null,
      firstPullbackVolumeDrying: false,
      firstPullbackRangeCompacted: false,
      secondLegGainPct: null,
      secondPullbackDurationBars: null,
      secondPullbackRangeCompacted: false,
      recommendedEntryPrice: null,
      stopLoss: null,
      target1: null,
      target2: null,
      riskRewardRatio: null,
      smartMoneyInvolvedInLastMove: false,
      smartMoneyNotification: 'No qualifying Strategy 4 setup (HH/HL + SMA 200 ±2% + Entry VPA Contraction) detected.',
      preceding52WeekLow: null,
      p0DistancePctFrom52wLow: null,
      isAtPreceding52WeekLow: false,
      signalStatus: 'MONITORING',
      signalAge: 0,
      ruleChecks: []
    };

    if (!candles || candles.length < 35) {
      defaultFail.ruleChecks.push({
        id: 'DATA_LENGTH',
        name: 'Candle History Available',
        passed: false,
        actualValue: `${candles?.length || 0} bars`,
        benchmarkRule: '>= 35 historical daily bars',
        explanation: 'Insufficient candle history for Strategy 4 analysis.'
      });
      return defaultFail;
    }

    const n = candles.length;
    const cmp = candles[n - 1].close;
    defaultFail.cmp = cmp;

    const cfg = options?.config;
    const s4ImpulseGainMinPct = cfg?.impulse?.impulseGainMinPct ?? 20.0;
    const s4CumulativeTurnoverFloorCr = cfg?.impulse?.cumulativeTurnoverFloorCr ?? 50.0;
    const s4InstitutionalTurnoverFloorCr = cfg?.smartMoney?.institutionalTurnoverFloorCr ?? 2.0;
    const s4SmartMoneyVolRatioMin = cfg?.smartMoney?.smartMoneyVolRatio ?? 1.3;
    const s4ImpulseDurationMinBars = cfg?.impulse?.impulseDurationMinBars ?? 8;
    const s4Sma200TolerancePct = cfg?.trend?.sma200TolerancePct ?? 2.0;
    const s4EntryVolDryingRatio = cfg?.volume?.entryVolDryingRatio ?? 0.85;
    const s4EntryVolImpulseRatio = cfg?.volume?.entryVolImpulseRatio ?? 0.80;
    const s4StopLossPct = cfg?.risk?.stopLossPct ?? 2.0;
    const s4Target2FibExtension = cfg?.risk?.target2FibExtension ?? 0.618;

    // Precompute SMA200 in O(N) single pass
    const sma200 = new Float64Array(n);
    let smaSum = 0;
    for (let i = 0; i < n; i++) {
      smaSum += candles[i].close;
      if (i >= 200) smaSum -= candles[i - 200].close;
      sma200[i] = i >= 199 ? smaSum / 200 : (i > 0 ? smaSum / (i + 1) : candles[0].close);
    }

    // Precompute cumulative turnover, cumulative volume, and day turnover in O(N)
    const cumTurnover = new Float64Array(n + 1);
    const cumVol = new Float64Array(n + 1);
    const dayTurnoverCr = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const to = c.turnover && c.turnover > 0 ? c.turnover : (c.volume || 0) * c.close;
      cumTurnover[i + 1] = cumTurnover[i] + to;
      cumVol[i + 1] = cumVol[i] + (c.volume || 0);
      dayTurnoverCr[i] = to / 1e7;
    }

    // Scan for valid (P0, H1, L1, H2, L2) configurations
    let bestSetup: any = null;

    // L2 is near the end (recent 1 to 10 bars)
    for (let l2Idx = n - 1; l2Idx >= Math.max(n - 10, 20); l2Idx--) {
      const l2Candle = candles[l2Idx];
      const l2 = l2Candle.low ?? l2Candle.close;

      const minH2Idx = Math.max(15, l2Idx - 20);
      const maxH2Idx = l2Idx - 2;

      for (let h2Idx = maxH2Idx; h2Idx >= minH2Idx; h2Idx--) {
        const h2 = candles[h2Idx].high ?? candles[h2Idx].close;
        if (h2 <= l2) continue;

        const minL1Idx = Math.max(10, h2Idx - 20);
        const maxL1Idx = h2Idx - 2;

        for (let l1Idx = maxL1Idx; l1Idx >= minL1Idx; l1Idx--) {
          const l1 = candles[l1Idx].low ?? candles[l1Idx].close;
          if (l2 <= l1) continue; // L2 > L1 (Higher Low)
          if (h2 <= l1) continue;

          const minH1Idx = Math.max(5, l1Idx - 20);
          const maxH1Idx = l1Idx - 2;

          for (let h1Idx = maxH1Idx; h1Idx >= minH1Idx; h1Idx--) {
            const h1 = candles[h1Idx].high ?? candles[h1Idx].close;
            if (h2 <= h1) continue; // H2 > H1 (Higher High)
            if (h1 <= l1) continue;

            const minP0Idx = Math.max(0, h1Idx - 25);
            const maxP0Idx = h1Idx - s4ImpulseDurationMinBars; // At least impulseDurationMinBars duration (2-3 weeks)

            for (let p0Idx = maxP0Idx; p0Idx >= minP0Idx; p0Idx--) {
              const p0 = candles[p0Idx].low ?? candles[p0Idx].close;
              if (l1 <= p0) continue; // L1 > P0 (Higher Low vs Point Zero)
              if (h1 <= p0) continue;

              const impulseDuration = h1Idx - p0Idx;
              const impulseGainPct = ((h1 - p0) / p0) * 100;
              const impulseTurnoverCr = (cumTurnover[h1Idx + 1] - cumTurnover[p0Idx]) / 1e7;
              const preConditionMet = (impulseGainPct >= s4ImpulseGainMinPct || impulseTurnoverCr >= s4CumulativeTurnoverFloorCr);
              if (!preConditionMet) continue;

              const refLen = p0Idx - Math.max(0, p0Idx - 20);
              const avgVol = refLen > 0 ? (cumVol[p0Idx] - cumVol[Math.max(0, p0Idx - 20)]) / refLen : 100000;

              let maxSingleDayTurnoverCr = 0;
              let maxVolRatio = 0;
              for (let k = p0Idx; k <= h1Idx; k++) {
                if (dayTurnoverCr[k] > maxSingleDayTurnoverCr) maxSingleDayTurnoverCr = dayTurnoverCr[k];
                const vr = (candles[k].volume || 0) / Math.max(1, avgVol);
                if (vr > maxVolRatio) maxVolRatio = vr;
              }

              const smartMoneyInImpulse = (maxSingleDayTurnoverCr >= s4InstitutionalTurnoverFloorCr || maxVolRatio >= s4SmartMoneyVolRatioMin);
              if (!smartMoneyInImpulse) continue;

              // ── Condition 1: Initial move (P0) MUST be near SMA 200 +/- sma200TolerancePct% ──
              const sma200AtP0 = sma200[p0Idx];
              if (sma200AtP0 === null || sma200AtP0 <= 0) continue;

              const sma200Lower = sma200AtP0 * (1 - s4Sma200TolerancePct / 100);
              const sma200Upper = sma200AtP0 * (1 + s4Sma200TolerancePct / 100);
              const p0Candle = candles[p0Idx];
              const p0Low = p0Candle.low ?? p0Candle.close;
              const p0High = p0Candle.high ?? p0Candle.close;
              const p0Close = p0Candle.close;
              const p0Price = p0;

              const p0DiffPct = ((p0Price - sma200AtP0) / sma200AtP0) * 100;
              const p0CloseDiffPct = ((p0Close - sma200AtP0) / sma200AtP0) * 100;

              const initialMoveNearSma200 =
                Math.abs(p0DiffPct) <= s4Sma200TolerancePct ||
                Math.abs(p0CloseDiffPct) <= s4Sma200TolerancePct ||
                (p0Price >= sma200Lower && p0Price <= sma200Upper) ||
                (p0Close >= sma200Lower && p0Close <= sma200Upper) ||
                (p0Low <= sma200Upper && p0High >= sma200Lower);

              if (!initialMoveNearSma200) continue;

              // ── Pullback 1: VPA alignment & compaction ──
              const pb1Candles = candles.slice(h1Idx, l1Idx + 1);
              const meanImpulseVol = (cumVol[h1Idx + 1] - cumVol[p0Idx]) / Math.max(1, h1Idx - p0Idx + 1);
              const meanPb1Vol = pb1Candles.length > 1
                ? pb1Candles.slice(1).reduce((s, c) => s + (c.volume || 0), 0) / (pb1Candles.length - 1)
                : (candles[l1Idx].volume || 0);
              const pb1VolDrying = meanPb1Vol < meanImpulseVol * 0.90;

              const h1Range = (candles[h1Idx].high ?? candles[h1Idx].close) - (candles[h1Idx].low ?? candles[h1Idx].close);
              const pb1AvgRange = pb1Candles.reduce((s, c) => s + ((c.high ?? c.close) - (c.low ?? c.close)), 0) / pb1Candles.length;
              const pb1RangeCompacted = pb1AvgRange < Math.max(h1Range * 0.95, cmp * 0.04);

              // ── Pullback 2: Compaction making another higher low ──
              const pb2Candles = candles.slice(h2Idx, l2Idx + 1);
              const recentCompactionCandles = candles.slice(Math.max(0, n - 4));
              const recentAvgRange = recentCompactionCandles.reduce((s, c) => s + ((c.high ?? c.close) - (c.low ?? c.close)), 0) / recentCompactionCandles.length;
              const h2Range = (candles[h2Idx].high ?? candles[h2Idx].close) - (candles[h2Idx].low ?? candles[h2Idx].close);
              const pb2RangeCompacted = recentAvgRange < Math.max(h2Range * 0.95, cmp * 0.04);

              // ── Condition 2: VPA Contraction at Time of Entry ──
              const entryCandles = candles.slice(Math.max(0, l2Idx - 2), n);
              const recentAvgVol20 = candles.slice(Math.max(0, n - 25), Math.max(0, n - 5)).reduce((s, c) => s + (c.volume || 0), 0) / 20 || 1;
              const entryAvgVol = entryCandles.reduce((s, c) => s + (c.volume || 0), 0) / entryCandles.length;
              const entryVolRatio = Number((entryAvgVol / Math.max(1, recentAvgVol20)).toFixed(2));
              const entryVolDrying = entryVolRatio <= s4EntryVolDryingRatio || entryAvgVol <= meanImpulseVol * s4EntryVolImpulseRatio || (candles[n - 1].volume || 0) <= recentAvgVol20 * s4EntryVolDryingRatio;

              const last20Candles = candles.slice(Math.max(0, n - 20));
              const avgRange20 = last20Candles.reduce((s, c) => s + ((c.high ?? c.close) - (c.low ?? c.close)), 0) / Math.max(1, last20Candles.length);
              const entryAvgRange = entryCandles.reduce((s, c) => s + ((c.high ?? c.close) - (c.low ?? c.close)), 0) / entryCandles.length;
              const entryRangeRatio = Number((entryAvgRange / Math.max(0.01, avgRange20)).toFixed(2));
              const entryRangeCompacted = entryRangeRatio <= s4EntryVolDryingRatio || recentAvgRange < Math.max(h2Range * 0.95, cmp * 0.04);

              const vpaContractionAtEntry = entryVolDrying && entryRangeCompacted;
              if (!vpaContractionAtEntry) continue;

              // Smart money in last move
              const lastMoveCandles = candles.slice(Math.max(0, l2Idx - 2));
              const last20ForAdt = candles.slice(Math.max(0, n - 20));
              const adt20Cr = last20ForAdt.reduce((s, c) => {
                const dayTo = (c.turnover && c.turnover > 0 ? c.turnover : (c.volume || 0) * c.close) / 1e7;
                return s + dayTo;
              }, 0) / Math.max(1, last20ForAdt.length);

              let smartMoneyInLastMove = false;
              let lastMoveMaxTurnoverCr = 0;
              let lastMoveMaxVolRatio = 0;

              for (const c of lastMoveCandles) {
                const toCr = ((c.turnover && c.turnover > 0 ? c.turnover : (c.volume || 0) * c.close) / 1e7);
                if (toCr > lastMoveMaxTurnoverCr) lastMoveMaxTurnoverCr = toCr;
                const vr = (c.volume || 0) / recentAvgVol20;
                if (vr > lastMoveMaxVolRatio) lastMoveMaxVolRatio = vr;

                const isGreen = c.close >= c.open;
                const cRange = (c.high ?? c.close) - (c.low ?? c.close);
                const isAbsorption = cRange > 0 && ((c.close - (c.low ?? c.close)) / cRange >= 0.60) && vr >= s4SmartMoneyVolRatioMin;
                const hasInstitutionalTurnover = toCr >= Math.max(1.0, 2.5 * adt20Cr);
                if ((hasInstitutionalTurnover || vr >= s4SmartMoneyVolRatioMin) && (isGreen || isAbsorption)) {
                  smartMoneyInLastMove = true;
                }
              }

              bestSetup = {
                p0, p0Idx, p0Date: candles[p0Idx].date,
                h1, h1Idx, h1Date: candles[h1Idx].date,
                l1, l1Idx, l1Date: candles[l1Idx].date,
                h2, h2Idx, h2Date: candles[h2Idx].date,
                l2, l2Idx, l2Date: candles[l2Idx].date,
                sma200AtP0: Number(sma200AtP0.toFixed(2)),
                p0DistancePctFromSma200: Number(p0DiffPct.toFixed(2)),
                initialMoveNearSma200: true,
                vpaContractionAtEntry: true,
                entryVolumeDryingRatio: entryVolRatio,
                entryRangeContractionRatio: entryRangeRatio,
                impulseGainPct: Number(impulseGainPct.toFixed(2)),
                impulseTurnoverCr: Number(impulseTurnoverCr.toFixed(1)),
                impulseDuration,
                smartMoneyInImpulse,
                pb1Duration: l1Idx - h1Idx,
                pb1DropPct: Number((((h1 - l1) / h1) * 100).toFixed(2)),
                pb1VolDrying,
                pb1RangeCompacted,
                secondLegGainPct: Number((((h2 - l1) / l1) * 100).toFixed(2)),
                pb2Duration: l2Idx - h2Idx,
                pb2RangeCompacted,
                smartMoneyInLastMove,
                lastMoveMaxTurnoverCr: Number(lastMoveMaxTurnoverCr.toFixed(2)),
                lastMoveMaxVolRatio: Number(lastMoveMaxVolRatio.toFixed(2))
              };
              break;
            }
            if (bestSetup) break;
          }
          if (bestSetup) break;
        }
        if (bestSetup) break;
      }
      if (bestSetup) break;
    }

    if (!bestSetup) {
      defaultFail.ruleChecks = [
        {
          id: 'S4_IMPULSE_PRECONDITION',
          name: 'Pre-Condition: Bullish Move (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money)',
          passed: false,
          actualValue: 'No impulse leg found satisfying 20% / ₹50 Cr + smart money',
          benchmarkRule: '>= 20% gain or >= ₹50 Cr turnover in >= 10 sessions with > ₹2 Cr day',
          explanation: 'No primary impulse thrust identified meeting duration and institutional inflow thresholds.'
        },
        {
          id: 'S4_INITIAL_MOVE_SMA200',
          name: 'Initial Move (P0) Near SMA 200 (±2% Range)',
          passed: false,
          actualValue: 'Not in range',
          benchmarkRule: 'Origin of initial move (P0) within ±2% of 200-day Simple Moving Average (SMA 200)',
          explanation: 'Initial move did not originate near SMA 200 (±2%). Stock ignored for Strategy 4.'
        },
        {
          id: 'S4_PULLBACK_COMPACTION',
          name: 'First Pullback with VPA Alignment & Range Compaction (L1 > P0)',
          passed: false,
          actualValue: 'Not confirmed',
          benchmarkRule: 'Retracement L1 > P0 with volume drying and candle range contraction',
          explanation: 'Price did not form an orderly VPA-aligned compaction low above point zero.'
        },
        {
          id: 'S4_HIGHER_HIGH_EXPANSION',
          name: 'Continuation to Higher High (H2 > H1) regardless of driver',
          passed: false,
          actualValue: 'Not confirmed',
          benchmarkRule: 'Next peak H2 strictly greater than prior peak H1',
          explanation: 'Price did not register a higher high above the initial impulse peak.'
        },
        {
          id: 'S4_SECONDARY_COMPACTION_L2',
          name: 'Secondary Compaction Making Another Higher Low (L2 > L1 > P0)',
          passed: false,
          actualValue: 'Not confirmed',
          benchmarkRule: 'Pullback forms another higher low L2 > L1 with range compaction',
          explanation: 'No secondary compaction coiling at a higher low L2.'
        },
        {
          id: 'S4_ENTRY_VPA_CONTRACTION',
          name: 'VPA Contraction at Time of Entry',
          passed: false,
          actualValue: 'Not confirmed',
          benchmarkRule: 'Volume drying (<= 0.85x 20-DMA) and range compression present at entry',
          explanation: 'VPA contraction missing at entry zone. Stock ignored for Strategy 4.'
        },
        {
          id: 'S4_ENTRY_ZONE',
          name: 'Entry Trigger at L2 Compaction',
          passed: false,
          actualValue: `CMP ₹${cmp}`,
          benchmarkRule: 'Entry at compaction zone around L2',
          explanation: 'Entry trigger inactive.'
        }
      ];
      return defaultFail;
    }

    const check1Passed = (bestSetup.impulseGainPct >= s4ImpulseGainMinPct || bestSetup.impulseTurnoverCr >= s4CumulativeTurnoverFloorCr) &&
                         bestSetup.impulseDuration >= s4ImpulseDurationMinBars &&
                         bestSetup.smartMoneyInImpulse;
    const check2Passed = bestSetup.l1 > bestSetup.p0 && (bestSetup.pb1VolDrying || bestSetup.pb1RangeCompacted);
    const check3Passed = bestSetup.h2 > bestSetup.h1 && bestSetup.l1 > bestSetup.p0;
    const check4Passed = bestSetup.l2 > bestSetup.l1 && bestSetup.l2 > bestSetup.p0 && bestSetup.pb2RangeCompacted;
    const inEntryZone = cmp >= bestSetup.l2 * 0.985 && cmp <= bestSetup.l2 * 1.045;
    const check5Passed = inEntryZone;
    const check6Passed = Boolean(bestSetup.initialMoveNearSma200);
    const check7Passed = Boolean(bestSetup.vpaContractionAtEntry);

    // Optional Rule: Initial Move (P0) at Lowest Low of Preceding 52 Weeks (with >= impulseGainMinPct impulse)
    const low52w = this.getPreceding52WeekLowAt(candles, bestSetup.p0Idx);
    const check52wLowPassed = low52w.isAtLowestLow && bestSetup.impulseGainPct >= s4ImpulseGainMinPct;

    const allPassed = check1Passed && check2Passed && check3Passed && check4Passed && check5Passed && check6Passed && check7Passed &&
                      (!options?.filterPreceding52wLow || check52wLowPassed);

    const recommendedEntryPrice = Number(bestSetup.l2.toFixed(2));
    const stopLoss = Number((bestSetup.l2 * (1 - s4StopLossPct / 100)).toFixed(2));
    const risk = Math.max(1, cmp - stopLoss);
    const target1 = Number(bestSetup.h2.toFixed(2));
    const target2 = Number((bestSetup.h2 + (bestSetup.h2 - bestSetup.l2) * s4Target2FibExtension).toFixed(2));
    const riskRewardRatio = Number(((target1 - cmp) / risk).toFixed(2));

    const smartMoneyNotification = bestSetup.smartMoneyInLastMove
      ? `⚡ SMART MONEY DETECTED IN FINAL COMPACTION: Institutional volume absorption of ₹${bestSetup.lastMoveMaxTurnoverCr} Cr (${bestSetup.lastMoveMaxVolRatio}x 20-DMA) confirmed at Higher Low L2.`
      : `Normal price range compaction at Higher Low L2 (Organic / retail accumulation without single-day institutional block surge).`;

    const ruleChecks: RuleCheck[] = [
      {
        id: 'S4_IMPULSE_PRECONDITION',
        name: 'Pre-Condition: Impulse Leg (>= 20% or >= ₹50 Cr, 2–3W+ with Smart Money)',
        passed: check1Passed,
        actualValue: `+${bestSetup.impulseGainPct}% (₹${bestSetup.impulseTurnoverCr} Cr over ${bestSetup.impulseDuration} bars) | Smart Money: ${bestSetup.smartMoneyInImpulse ? 'YES' : 'NO'}`,
        benchmarkRule: '>= 20% advance OR >= ₹50 Cr turnover in >= 10 sessions with institutional footprint',
        explanation: check1Passed ? 'Strong institutional accumulation impulse verified from origin point P0 to peak H1.' : 'Impulse leg failed magnitude or smart money presence requirements.'
      },
      {
        id: 'S4_INITIAL_MOVE_SMA200',
        name: 'Initial Move (P0) Near SMA 200 (±2% Tolerance Range)',
        passed: check6Passed,
        actualValue: `P0: ₹${bestSetup.p0} vs SMA 200: ₹${bestSetup.sma200AtP0} (${bestSetup.p0DistancePctFromSma200 > 0 ? '+' : ''}${bestSetup.p0DistancePctFromSma200}%)`,
        benchmarkRule: 'Origin of initial move (P0) within ±2% of 200-day Simple Moving Average (SMA 200)',
        explanation: check6Passed
          ? `Verified: Initial impulse move launched from near SMA 200 (within ±2% band [₹${(bestSetup.sma200AtP0 * 0.98).toFixed(1)} - ₹${(bestSetup.sma200AtP0 * 1.02).toFixed(1)}]).`
          : `Failed: Initial move at P0 (₹${bestSetup.p0}) is outside the ±2% SMA 200 range (₹${bestSetup.sma200AtP0}).`
      },
      {
        id: 'S4_PULLBACK_COMPACTION',
        name: 'First Pullback with VPA Alignment & Range Compaction (L1 > P0)',
        passed: check2Passed,
        actualValue: `L1: ₹${bestSetup.l1} > P0: ₹${bestSetup.p0} | Drop: -${bestSetup.pb1DropPct}% | Vol Dry: ${bestSetup.pb1VolDrying ? 'YES' : 'NO'} | Range Compacted: ${bestSetup.pb1RangeCompacted ? 'YES' : 'NO'}`,
        benchmarkRule: 'Retracement low L1 > P0 with volume drying and price range compression',
        explanation: check2Passed ? 'Healthy pullback with institutional absorption holding firmly above point zero.' : 'Pullback broke below point zero or failed VPA compaction.'
      },
      {
        id: 'S4_HIGHER_HIGH_EXPANSION',
        name: 'Continuation to Higher High (H2 > H1) Regardless of Driver',
        passed: check3Passed,
        actualValue: `H2: ₹${bestSetup.h2} > H1: ₹${bestSetup.h1} (+${bestSetup.secondLegGainPct}% leg)`,
        benchmarkRule: 'Next high strictly higher than prior peak H1',
        explanation: check3Passed ? 'Structural Higher High printed, confirming bullish continuation wave.' : `H2 (₹${bestSetup.h2}) did not exceed H1 (₹${bestSetup.h1}).`
      },
      {
        id: 'S4_SECONDARY_COMPACTION_L2',
        name: 'Secondary Compaction Making Another Higher Low (L2 > L1 > P0)',
        passed: check4Passed,
        actualValue: `L2: ₹${bestSetup.l2} > L1: ₹${bestSetup.l1} > P0: ₹${bestSetup.p0} | Compacted: ${bestSetup.pb2RangeCompacted ? 'YES' : 'NO'}`,
        benchmarkRule: 'Sequential higher low L2 with coiled price range compaction',
        explanation: check4Passed ? 'Perfect ascending structural stair-step with coiled volatility compaction.' : 'Secondary pullback did not hold above L1 or lacks range compaction.'
      },
      {
        id: 'S4_ENTRY_VPA_CONTRACTION',
        name: 'VPA Contraction at Time of Entry (Volume Drying & Range Compression)',
        passed: check7Passed,
        actualValue: `Entry Vol Ratio: ${bestSetup.entryVolumeDryingRatio}x | Range Ratio: ${bestSetup.entryRangeContractionRatio}x`,
        benchmarkRule: 'Volume drying (<= 0.85x 20-DMA) AND candle range contraction present at entry',
        explanation: check7Passed
          ? 'Verified: Both volume drying and price range contraction are confirmed at the time of entry.'
          : 'Failed: Entry zone lacks volume drying or price range compression.'
      },
      {
        id: 'S4_ENTRY_ZONE',
        name: 'Entry Trigger at L2 Compaction Zone',
        passed: check5Passed,
        actualValue: `CMP: ₹${cmp} vs L2: ₹${bestSetup.l2} (Compaction Zone: ₹${bestSetup.l2} - ₹${(bestSetup.l2 * 1.045).toFixed(1)})`,
        benchmarkRule: 'CMP currently reacting within L2 compaction zone',
        explanation: check5Passed ? 'Prime entry trigger activated right at the L2 compaction zone.' : `CMP is outside the immediate L2 compaction buy zone.`
      },
      {
        id: 'S4_SMART_MONEY_ALERT',
        name: 'Smart Money Notification in Final Compaction Move',
        passed: bestSetup.smartMoneyInLastMove,
        actualValue: bestSetup.smartMoneyInLastMove
          ? `INSTITUTIONAL FOOTPRINT: ₹${bestSetup.lastMoveMaxTurnoverCr} Cr / ${bestSetup.lastMoveMaxVolRatio}x 20-DMA Vol`
          : 'ORGANIC ACCUMULATION (No single-day block surge)',
        benchmarkRule: 'Day turnover >= ₹2.0 Cr or Vol >= 1.3x 20-DMA on green/absorption candle in last move',
        explanation: bestSetup.smartMoneyInLastMove
          ? '⚡ High-conviction institutional smart money absorption detected at the final higher-low compaction!'
          : 'Normal structural compaction without single-day institutional surge.'
      },
      {
        id: 'S4_PRECEDING_52W_LOW',
        name: 'Initial Move (P0) at Preceding 52-Week Low (20%+ Impulse)',
        passed: check52wLowPassed,
        actualValue: `P0: ₹${bestSetup.p0} vs 52W Low: ₹${low52w.lowestLow} (${low52w.distancePct > 0 ? '+' : ''}${low52w.distancePct}%) | Wave 1: +${bestSetup.impulseGainPct}%`,
        benchmarkRule: 'P0 within 2.5% of preceding 52-week low & Wave 1 >= 20%',
        explanation: check52wLowPassed
          ? `Verified: Initial 20%+ impulse move launched directly from preceding 52-week low (₹${low52w.lowestLow}).`
          : `P0 (₹${bestSetup.p0}) is not at preceding 52-week low (₹${low52w.lowestLow}, diff: ${low52w.distancePct}%) or wave 1 < 20%.`
      }
    ];

    let signalStatus: Strategy4Result['signalStatus'] = 'MONITORING';
    if (bestSetup) {
      if (cmp < bestSetup.l2) {
        signalStatus = 'INVALIDATED';
      } else if (cmp > target1) {
        signalStatus = 'PASSED_OPPORTUNITY';
      } else if (allPassed) {
        signalStatus = 'ACTIVE';
      }
    }
    const signalAge = bestSetup ? bestSetup.pb2Duration : 0;

    return {
      qualified: allPassed,
      symbol,
      companyName: resolvedCompanyName,
      cmp,
      p0: bestSetup.p0,
      h1: bestSetup.h1,
      l1: bestSetup.l1,
      h2: bestSetup.h2,
      l2: bestSetup.l2,
      p0Date: bestSetup.p0Date,
      h1Date: bestSetup.h1Date,
      l1Date: bestSetup.l1Date,
      h2Date: bestSetup.h2Date,
      l2Date: bestSetup.l2Date,
      sma200AtP0: bestSetup.sma200AtP0,
      p0DistancePctFromSma200: bestSetup.p0DistancePctFromSma200,
      initialMoveNearSma200: bestSetup.initialMoveNearSma200,
      vpaContractionAtEntry: bestSetup.vpaContractionAtEntry,
      entryVolumeDryingRatio: bestSetup.entryVolumeDryingRatio,
      entryRangeContractionRatio: bestSetup.entryRangeContractionRatio,
      impulseGainPct: bestSetup.impulseGainPct,
      impulseCumulativeTurnoverCr: bestSetup.impulseTurnoverCr,
      impulseDurationBars: bestSetup.impulseDuration,
      smartMoneyInImpulse: bestSetup.smartMoneyInImpulse,
      firstPullbackDurationBars: bestSetup.pb1Duration,
      firstPullbackDropPct: bestSetup.pb1DropPct,
      firstPullbackVolumeDrying: bestSetup.pb1VolDrying,
      firstPullbackRangeCompacted: bestSetup.pb1RangeCompacted,
      secondLegGainPct: bestSetup.secondLegGainPct,
      secondPullbackDurationBars: bestSetup.pb2Duration,
      secondPullbackRangeCompacted: bestSetup.pb2RangeCompacted,
      recommendedEntryPrice,
      stopLoss,
      target1,
      target2,
      riskRewardRatio,
      smartMoneyInvolvedInLastMove: bestSetup.smartMoneyInLastMove,
      smartMoneyNotification,
      preceding52WeekLow: low52w.lowestLow,
      p0DistancePctFrom52wLow: low52w.distancePct,
      isAtPreceding52WeekLow: low52w.isAtLowestLow,
      signalStatus,
      signalAge,
      ruleChecks
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY 5: 50 EMA Pullback & Volatility Contraction (VCP)
  // ─────────────────────────────────────────────────────────────────────────────

  public evaluateStrategy5(
    candles: Candle[],
    symbolOrInfo: string | { symbol: string; companyName?: string } = 'UNKNOWN',
    companyName: string = '',
    options?: StrategyEvaluationOptions
  ): Strategy5Result {
    const symbol = typeof symbolOrInfo === 'string' ? symbolOrInfo : (symbolOrInfo?.symbol || 'UNKNOWN');
    const resolvedCompanyName = typeof symbolOrInfo === 'object' && symbolOrInfo?.companyName ? symbolOrInfo.companyName : (companyName || symbol);

    const defaultFail: Strategy5Result = {
      qualified: false, symbol, companyName: resolvedCompanyName, cmp: 0,
      ema50: null, sma200: null, rsi14: null, atr14: null,
      volumeVsAvg: null, atrVsAvg: null, ema50ProximityPct: null,
      swingLow: null, priorSwingHigh: null,
      stopLoss: null, target1: null, target2: null, riskRewardRatio: null,
      preceding52WeekLow: null, p0DistancePctFrom52wLow: null, isAtPreceding52WeekLow: false,
      signalStatus: 'MONITORING', signalAge: 0, ruleChecks: []
    };

    if (!candles || candles.length < 60) {
      defaultFail.ruleChecks.push({ id: 'DATA_LENGTH', name: 'Candle History Available', passed: false, actualValue: `${candles?.length || 0} bars`, benchmarkRule: '>= 60 bars', explanation: 'Insufficient history for EMA50/SMA200 calculation.' });
      return defaultFail;
    }

    const n = candles.length;
    const cmp = candles[n - 1].close;
    defaultFail.cmp = cmp;
    const closePrices = candles.map(c => c.close);
    const highPrices = candles.map(c => c.high ?? c.close);
    const lowPrices = candles.map(c => c.low ?? c.close);
    const volumes = candles.map(c => c.volume || 0);

    const ema50Series = EMA.calculate({ period: 50, values: closePrices });
    const sma200Series = SMA.calculate({ period: 200, values: closePrices });
    const rsiSeries = RSI.calculate({ period: 14, values: closePrices });
    const atrSeries = ATR.calculate({ high: highPrices, low: lowPrices, close: closePrices, period: 14 });

    const ema50 = ema50Series.length > 0 ? Number(ema50Series[ema50Series.length - 1].toFixed(2)) : null;
    const sma200 = sma200Series.length > 0 ? Number(sma200Series[sma200Series.length - 1].toFixed(2)) : null;
    const rsi14 = rsiSeries.length > 0 ? Number(rsiSeries[rsiSeries.length - 1].toFixed(1)) : null;
    const atr14 = atrSeries.length > 0 ? Number(atrSeries[atrSeries.length - 1].toFixed(2)) : null;

    const vol20Avg = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20 || 1;
    const currentVol = volumes[n - 1];
    const volumeVsAvg = Number((currentVol / vol20Avg).toFixed(2));

    const atr20Avg = atrSeries.length >= 20 ? atrSeries.slice(-20).reduce((a, b) => a + b, 0) / 20 : (atr14 || 1);
    const atrVsAvg = atr14 ? Number((atr14 / atr20Avg).toFixed(2)) : null;

    const ema50ProximityPct = ema50 ? Number((((cmp - ema50) / ema50) * 100).toFixed(2)) : null;

    const swingLow = Number(Math.min(...lowPrices.slice(-5)).toFixed(2));
    const priorSwingHigh = Number(Math.max(...highPrices.slice(-25, -3)).toFixed(2));

    // Rules
    const check1Passed = sma200 !== null && cmp > sma200;
    const check2Passed = ema50 !== null && sma200 !== null && ema50 > sma200;
    const check3Passed = ema50ProximityPct !== null && ema50ProximityPct >= -2.0 && ema50ProximityPct <= 2.0;
    const check4Passed = rsi14 !== null && rsi14 >= 42 && rsi14 <= 55;
    const check5Passed = volumeVsAvg < 1.0;
    const check6Passed = atrVsAvg !== null && atrVsAvg < 1.0;
    const prevRsi = rsiSeries.length > 1 ? rsiSeries[rsiSeries.length - 2] : (rsi14 || 0);
    const check7Passed = rsi14 !== null && prevRsi >= 42 && prevRsi <= 55 && rsi14 > prevRsi && cmp > (highPrices[n - 2] ?? cmp);

    const n1 = candles[n - 1];
    const p0Idx = n - Math.max(3, Math.min(10, n - 1));
    const low52w = this.getPreceding52WeekLowAt(candles, p0Idx);
    const check52wLowPassed = low52w.isAtLowestLow;
    const allPassed = check1Passed && check2Passed && check3Passed && check4Passed && check5Passed && check6Passed && check7Passed
      && (!options?.filterPreceding52wLow || check52wLowPassed);

    const stopLoss = swingLow;
    const risk = Math.max(1, cmp - stopLoss);
    const target1 = Number(priorSwingHigh.toFixed(2));
    const target2 = Number((cmp + risk * 3.0).toFixed(2));
    const riskRewardRatio = Number(((target1 - cmp) / risk).toFixed(2));

    const ruleChecks: RuleCheck[] = [
      { id: 'S5_PRICE_ABOVE_SMA200', name: 'Price Above SMA 200', passed: check1Passed, actualValue: `CMP ₹${cmp} vs SMA200 ₹${sma200}`, benchmarkRule: 'Close > 200-day SMA', explanation: check1Passed ? 'Stock in primary uptrend above 200 SMA.' : 'Stock below 200-day SMA — not in macro uptrend.' },
      { id: 'S5_EMA50_ABOVE_SMA200', name: 'EMA 50 Above SMA 200', passed: check2Passed, actualValue: `EMA50 ₹${ema50} vs SMA200 ₹${sma200}`, benchmarkRule: '50-day EMA > 200-day SMA', explanation: check2Passed ? 'Medium-term trend above long-term trend (bullish alignment).' : 'EMA50 below SMA200 — trend not bullish.' },
      { id: 'S5_EMA50_PROXIMITY', name: 'Pullback to 50 EMA (±2%)', passed: check3Passed, actualValue: `${ema50ProximityPct}% from EMA50 ₹${ema50}`, benchmarkRule: 'Close within -2% to +2% of 50-day EMA', explanation: check3Passed ? 'Price pulling back to 50 EMA — ideal low-risk entry zone.' : `Price not near 50 EMA (${ema50ProximityPct}% away).` },
      { id: 'S5_RSI_PULLBACK_ZONE', name: 'RSI in Pullback Zone (42–55)', passed: check4Passed, actualValue: `RSI(14): ${rsi14}`, benchmarkRule: 'RSI(14) between 42 and 55', explanation: check4Passed ? 'RSI in healthy pullback zone — not overbought, not oversold.' : `RSI (${rsi14}) outside 42–55 pullback range.` },
      { id: 'S5_VOLUME_CONTRACTION', name: 'Volume Contraction (Below Average)', passed: check5Passed, actualValue: `${(volumeVsAvg * 100).toFixed(0)}% of 20-day avg`, benchmarkRule: 'Volume < 20-day SMA(Volume)', explanation: check5Passed ? 'Quiet pullback with drying volume — institutional holders not selling.' : 'Volume elevated during pullback — potential distribution.' },
      { id: 'S5_ATR_CONTRACTION', name: 'ATR Contraction (Below Average)', passed: check6Passed, actualValue: `ATR ratio: ${atrVsAvg}x`, benchmarkRule: 'ATR(14) < 20-day SMA(ATR)', explanation: check6Passed ? 'Volatility compressing — coiled spring setup.' : 'Volatility not contracting sufficiently.' },
      { id: 'S5_ENTRY_TRIGGER', name: 'Entry Trigger: Close > High[1] with RSI Turning Up', passed: check7Passed, actualValue: `CMP: ₹${cmp} vs Prev High: ₹${(highPrices[n - 2] ?? 0).toFixed(2)} | RSI: ${rsi14} (prev: ${prevRsi.toFixed(1)})`, benchmarkRule: 'Close > prior day High with RSI turning up from 42–55', explanation: check7Passed ? 'Entry trigger fired: price broke prior high with RSI turning up.' : 'Entry trigger not yet confirmed.' },
      { id: 'S5_PRECEDING_52W_LOW', name: 'Pullback Origin at Preceding 52-Week Low', passed: check52wLowPassed, actualValue: `52W Low: ₹${low52w.lowestLow} (diff: ${low52w.distancePct}%)`, benchmarkRule: 'Pullback origin within 2.5% of preceding 52-week low', explanation: check52wLowPassed ? 'Setup originates at 52-week low — high-quality base.' : `Setup not at 52-week low (${low52w.distancePct}% away).` }
    ];

    const signalStatus: Strategy5Result['signalStatus'] = cmp < swingLow ? 'INVALIDATED' : cmp > priorSwingHigh * 1.05 ? 'PASSED_OPPORTUNITY' : allPassed ? 'ACTIVE' : 'MONITORING';

    return { qualified: allPassed, symbol, companyName: resolvedCompanyName, cmp, ema50, sma200, rsi14, atr14, volumeVsAvg, atrVsAvg, ema50ProximityPct, swingLow, priorSwingHigh, stopLoss, target1, target2, riskRewardRatio, preceding52WeekLow: low52w.lowestLow, p0DistancePctFrom52wLow: low52w.distancePct, isAtPreceding52WeekLow: low52w.isAtLowestLow, signalStatus, signalAge: 5, ruleChecks };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY 6: Nifty 500 Multi-Month Relative Strength (RS) Breakout
  // ─────────────────────────────────────────────────────────────────────────────

  public evaluateStrategy6(
    candles: Candle[],
    symbolOrInfo: string | { symbol: string; companyName?: string } = 'UNKNOWN',
    companyName: string = '',
    options?: StrategyEvaluationOptions
  ): Strategy6Result {
    const symbol = typeof symbolOrInfo === 'string' ? symbolOrInfo : (symbolOrInfo?.symbol || 'UNKNOWN');
    const resolvedCompanyName = typeof symbolOrInfo === 'object' && symbolOrInfo?.companyName ? symbolOrInfo.companyName : (companyName || symbol);

    const defaultFail: Strategy6Result = {
      qualified: false, symbol, companyName: resolvedCompanyName, cmp: 0,
      high52w: null, distanceFrom52wHighPct: null, consolidationRangePct: null,
      breakoutHigh: null, volumeSurgeRatio: null, rsi14: null, consolidationLow: null,
      stopLoss: null, target1: null, target2: null, riskRewardRatio: null,
      preceding52WeekLow: null, p0DistancePctFrom52wLow: null, isAtPreceding52WeekLow: false,
      signalStatus: 'MONITORING', signalAge: 0, ruleChecks: []
    };

    if (!candles || candles.length < 60) {
      defaultFail.ruleChecks.push({ id: 'DATA_LENGTH', name: 'Candle History Available', passed: false, actualValue: `${candles?.length || 0} bars`, benchmarkRule: '>= 60 bars', explanation: 'Insufficient history for 52W high and breakout analysis.' });
      return defaultFail;
    }

    const n = candles.length;
    const cmp = candles[n - 1].close;
    defaultFail.cmp = cmp;
    const closePrices = candles.map(c => c.close);
    const highPrices = candles.map(c => c.high ?? c.close);
    const lowPrices = candles.map(c => c.low ?? c.close);
    const volumes = candles.map(c => c.volume || 0);

    const rsiSeries = RSI.calculate({ period: 14, values: closePrices });
    const rsi14 = rsiSeries.length > 0 ? Number(rsiSeries[rsiSeries.length - 1].toFixed(1)) : null;

    const lookback52w = Math.min(252, n - 1);
    const high52w = Number(Math.max(...highPrices.slice(-lookback52w)).toFixed(2));
    const distanceFrom52wHighPct = Number((((cmp - high52w) / high52w) * 100).toFixed(2));

    const hh20 = Math.max(...highPrices.slice(-20));
    const ll20 = Math.min(...lowPrices.slice(-20));
    const consolidationRangePct = Number((((hh20 - ll20) / ll20) * 100).toFixed(2));
    const consolidationLow = Number(ll20.toFixed(2));

    const breakoutHigh = Number(Math.max(...highPrices.slice(-21, -1)).toFixed(2));
    const vol20Avg = volumes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20 || 1;
    const volumeSurgeRatio = Number((volumes[n - 1] / vol20Avg).toFixed(2));

    const check1Passed = distanceFrom52wHighPct >= -5.0;
    const check2Passed = consolidationRangePct <= 12.0;
    const check3Passed = cmp > breakoutHigh;
    const check4Passed = volumeSurgeRatio >= 2.0;
    const check5Passed = rsi14 !== null && rsi14 >= 60 && rsi14 <= 78;

    const p0Idx = n - 25;
    const low52w = this.getPreceding52WeekLowAt(candles, Math.max(0, p0Idx));
    const check52wLowPassed = low52w.isAtLowestLow;
    const allPassed = check1Passed && check2Passed && check3Passed && check4Passed && check5Passed
      && (!options?.filterPreceding52wLow || check52wLowPassed);

    const stopLoss = Number(consolidationLow.toFixed(2));
    const risk = Math.max(1, cmp - stopLoss);
    const target1 = Number((cmp + risk * 3.0).toFixed(2));
    const target2 = Number((cmp + risk * 5.0).toFixed(2));
    const riskRewardRatio = Number(((target1 - cmp) / risk).toFixed(2));

    const ruleChecks: RuleCheck[] = [
      { id: 'S6_NEAR_52W_HIGH', name: 'Within 5% of 52-Week High', passed: check1Passed, actualValue: `${distanceFrom52wHighPct}% from 52W high ₹${high52w}`, benchmarkRule: 'Close >= 52-Week High * 0.95', explanation: check1Passed ? 'Price near 52-week high — strong relative strength.' : `Price too far from 52W high (${distanceFrom52wHighPct}%).` },
      { id: 'S6_TIGHT_BASE', name: 'Tight Consolidation Base (Range <= 12%)', passed: check2Passed, actualValue: `${consolidationRangePct}% range (HH20: ₹${hh20.toFixed(0)} / LL20: ₹${ll20.toFixed(0)})`, benchmarkRule: '20-day range <= 12% peak-to-trough', explanation: check2Passed ? 'Tight horizontal consolidation — institutional accumulation zone.' : `Base too wide (${consolidationRangePct}%).` },
      { id: 'S6_BREAKOUT', name: '20-Day Consolidation Breakout', passed: check3Passed, actualValue: `CMP ₹${cmp} vs 20-day High ₹${breakoutHigh}`, benchmarkRule: 'Close > Highest High of prior 20 sessions', explanation: check3Passed ? 'Price broke above 20-day consolidation high.' : 'No breakout — price still inside base.' },
      { id: 'S6_VOLUME_SURGE', name: 'Volume Surge on Breakout (>= 2x)', passed: check4Passed, actualValue: `${volumeSurgeRatio}x 20-day avg volume`, benchmarkRule: 'Volume >= 2.0x 20-day SMA(Volume)', explanation: check4Passed ? 'Strong volume surge confirms institutional participation on breakout.' : `Volume surge insufficient (${volumeSurgeRatio}x).` },
      { id: 'S6_RSI_BREAKOUT', name: 'RSI in Breakout Zone (60–78)', passed: check5Passed, actualValue: `RSI(14): ${rsi14}`, benchmarkRule: 'RSI(14) between 60 and 78', explanation: check5Passed ? 'RSI in healthy breakout zone — momentum confirmed without being overbought.' : `RSI (${rsi14}) outside 60–78 zone.` },
      { id: 'S6_PRECEDING_52W_LOW', name: 'Base Origin at Preceding 52-Week Low', passed: check52wLowPassed, actualValue: `52W Low: ₹${low52w.lowestLow} (diff: ${low52w.distancePct}%)`, benchmarkRule: 'Base within 2.5% of preceding 52-week low', explanation: check52wLowPassed ? 'High-quality base from 52-week low.' : `Base not at 52-week low (${low52w.distancePct}% away).` }
    ];

    const signalStatus: Strategy6Result['signalStatus'] = cmp < consolidationLow ? 'INVALIDATED' : cmp > high52w * 1.20 ? 'PASSED_OPPORTUNITY' : allPassed ? 'ACTIVE' : 'MONITORING';

    return { qualified: allPassed, symbol, companyName: resolvedCompanyName, cmp, high52w, distanceFrom52wHighPct, consolidationRangePct, breakoutHigh, volumeSurgeRatio, rsi14, consolidationLow, stopLoss, target1, target2, riskRewardRatio, preceding52WeekLow: low52w.lowestLow, p0DistancePctFrom52wLow: low52w.distancePct, isAtPreceding52WeekLow: low52w.isAtLowestLow, signalStatus, signalAge: 20, ruleChecks };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY 7: RSI Mean-Reversion Oversold Dip
  // ─────────────────────────────────────────────────────────────────────────────

  public evaluateStrategy7(
    candles: Candle[],
    symbolOrInfo: string | { symbol: string; companyName?: string } = 'UNKNOWN',
    companyName: string = '',
    options?: StrategyEvaluationOptions
  ): Strategy7Result {
    const symbol = typeof symbolOrInfo === 'string' ? symbolOrInfo : (symbolOrInfo?.symbol || 'UNKNOWN');
    const resolvedCompanyName = typeof symbolOrInfo === 'object' && symbolOrInfo?.companyName ? symbolOrInfo.companyName : (companyName || symbol);

    const defaultFail: Strategy7Result = {
      qualified: false, symbol, companyName: resolvedCompanyName, cmp: 0,
      sma200: null, rsi14: null, lowerBB: null, middleBB: null, atr14: null,
      dipCandleLow: null, capitulationRatio: null, reversalConfirmed: false,
      stopLoss: null, target1: null, target2: null, riskRewardRatio: null,
      requiresNextOpenEntry: true,
      preceding52WeekLow: null, p0DistancePctFrom52wLow: null, isAtPreceding52WeekLow: false,
      signalStatus: 'MONITORING', signalAge: 0, ruleChecks: []
    };

    if (!candles || candles.length < 50) {
      defaultFail.ruleChecks.push({ id: 'DATA_LENGTH', name: 'Candle History Available', passed: false, actualValue: `${candles?.length || 0} bars`, benchmarkRule: '>= 50 bars', explanation: 'Insufficient history for Bollinger Bands and RSI.' });
      return defaultFail;
    }

    const n = candles.length;
    const cmp = candles[n - 1].close;
    const prevClose = candles[n - 2].close;
    const prevHigh = candles[n - 2].high ?? prevClose;
    const prevOpen = candles[n - 2].open ?? prevClose;
    const prevLow = candles[n - 2].low ?? prevClose;
    defaultFail.cmp = cmp;
    const closePrices = candles.map(c => c.close);
    const highPrices = candles.map(c => c.high ?? c.close);
    const lowPrices = candles.map(c => c.low ?? c.close);

    const sma200Series = SMA.calculate({ period: 200, values: closePrices });
    const rsiSeries = RSI.calculate({ period: 14, values: closePrices });
    const atrSeries = ATR.calculate({ high: highPrices, low: lowPrices, close: closePrices, period: 14 });
    const bbSeries = BollingerBands.calculate({ period: 20, stdDev: 2, values: closePrices });

    const sma200 = sma200Series.length > 0 ? Number(sma200Series[sma200Series.length - 1].toFixed(2)) : null;
    const rsi14 = rsiSeries.length > 0 ? Number(rsiSeries[rsiSeries.length - 1].toFixed(1)) : null;
    const atr14 = atrSeries.length > 0 ? Number(atrSeries[atrSeries.length - 1].toFixed(2)) : null;
    const bb = bbSeries.length > 0 ? bbSeries[bbSeries.length - 1] : null;
    const prevBb = bbSeries.length > 1 ? bbSeries[bbSeries.length - 2] : null;
    const lowerBB = prevBb ? Number(prevBb.lower.toFixed(2)) : null;
    const middleBB = bb ? Number(bb.middle.toFixed(2)) : null;

    const dipCandleRange = prevHigh - prevLow;
    const capitulationRatio = atr14 ? Number((dipCandleRange / atr14).toFixed(2)) : null;
    const reversalConfirmed = cmp > prevHigh || cmp > prevOpen;

    const check1Passed = sma200 !== null && cmp > sma200;
    const check2Passed = lowerBB !== null && prevLow <= lowerBB;
    const check3Passed = rsi14 !== null && rsi14 <= 32;
    const check4Passed = capitulationRatio !== null && capitulationRatio >= 1.5;
    const check5Passed = reversalConfirmed;

    const p0Idx = n - 3;
    const low52w = this.getPreceding52WeekLowAt(candles, Math.max(0, p0Idx));
    const check52wLowPassed = low52w.isAtLowestLow;
    const allPassed = check1Passed && check2Passed && check3Passed && check4Passed && check5Passed
      && (!options?.filterPreceding52wLow || check52wLowPassed);

    const stopLoss = Number((prevLow * 0.98).toFixed(2));
    const risk = Math.max(1, cmp - stopLoss);
    const target1 = middleBB || Number((cmp + risk * 2.0).toFixed(2));
    const target2 = Number((cmp + risk * 3.0).toFixed(2));
    const riskRewardRatio = Number(((target1 - cmp) / risk).toFixed(2));

    const ruleChecks: RuleCheck[] = [
      { id: 'S7_ABOVE_SMA200', name: 'Macro Uptrend: Above SMA 200', passed: check1Passed, actualValue: `CMP ₹${cmp} vs SMA200 ₹${sma200}`, benchmarkRule: 'Close > 200-day SMA', explanation: check1Passed ? 'Stock in primary macro uptrend — dip buying in bullish context.' : 'Stock below SMA200 — not a pullback in uptrend.' },
      { id: 'S7_LOWER_BB_TOUCH', name: 'Touched / Pierced Lower Bollinger Band', passed: check2Passed, actualValue: `Prev Low ₹${prevLow} vs Lower BB ₹${lowerBB}`, benchmarkRule: 'Prior day Low <= Lower BB(20, 2)', explanation: check2Passed ? 'Price pierced lower Bollinger Band — extreme oversold condition.' : 'Price has not reached lower Bollinger Band.' },
      { id: 'S7_RSI_OVERSOLD', name: 'RSI Oversold (<= 32)', passed: check3Passed, actualValue: `RSI(14): ${rsi14}`, benchmarkRule: 'RSI(14) <= 32', explanation: check3Passed ? 'RSI confirms extreme oversold — mean reversion probability high.' : `RSI (${rsi14}) not yet oversold (need <= 32).` },
      { id: 'S7_CAPITULATION_CANDLE', name: 'Capitulation Candle (Range > 1.5x ATR)', passed: check4Passed, actualValue: `Range ₹${dipCandleRange.toFixed(1)} vs ATR ₹${atr14} (ratio: ${capitulationRatio}x)`, benchmarkRule: '(High - Low) > 1.5 * ATR(14)', explanation: check4Passed ? 'Wide-range capitulation candle detected — selling climax likely complete.' : `Range (${capitulationRatio}x ATR) insufficient for capitulation signal.` },
      { id: 'S7_REVERSAL_CANDLE', name: 'Reversal Confirmation (Close > Prev High or > Open)', passed: check5Passed, actualValue: `CMP ₹${cmp} | Prev High ₹${prevHigh.toFixed(2)} | Prev Open ₹${prevOpen.toFixed(2)}`, benchmarkRule: 'Close > prior day High OR Close > prior day Open', explanation: check5Passed ? 'Reversal candle confirmed — buyers absorbed the selling.' : 'No reversal confirmation yet — wait for next session.' },
      { id: 'S7_PRECEDING_52W_LOW', name: 'Dip at Preceding 52-Week Low', passed: check52wLowPassed, actualValue: `52W Low: ₹${low52w.lowestLow} (diff: ${low52w.distancePct}%)`, benchmarkRule: 'Dip within 2.5% of preceding 52-week low', explanation: check52wLowPassed ? 'Dip at 52-week low — maximum confluence for mean reversion.' : `Dip not at 52-week low (${low52w.distancePct}% away).` }
    ];

    const signalStatus: Strategy7Result['signalStatus'] = cmp < prevLow * 0.95 ? 'INVALIDATED' : middleBB && cmp >= middleBB ? 'PASSED_OPPORTUNITY' : allPassed ? 'ACTIVE' : 'MONITORING';

    return { qualified: allPassed, symbol, companyName: resolvedCompanyName, cmp, sma200, rsi14, lowerBB, middleBB, atr14, dipCandleLow: Number(prevLow.toFixed(2)), capitulationRatio, reversalConfirmed, stopLoss, target1, target2, riskRewardRatio, requiresNextOpenEntry: true, preceding52WeekLow: low52w.lowestLow, p0DistancePctFrom52wLow: low52w.distancePct, isAtPreceding52WeekLow: low52w.isAtLowestLow, signalStatus, signalAge: 1, ruleChecks };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY 8: High-Tight Flag / Epiphany Breakout
  // ─────────────────────────────────────────────────────────────────────────────

  public evaluateStrategy8(
    candles: Candle[],
    symbolOrInfo: string | { symbol: string; companyName?: string } = 'UNKNOWN',
    companyName: string = '',
    options?: StrategyEvaluationOptions
  ): Strategy8Result {
    const symbol = typeof symbolOrInfo === 'string' ? symbolOrInfo : (symbolOrInfo?.symbol || 'UNKNOWN');
    const resolvedCompanyName = typeof symbolOrInfo === 'object' && symbolOrInfo?.companyName ? symbolOrInfo.companyName : (companyName || symbol);

    const defaultFail: Strategy8Result = {
      qualified: false, symbol, companyName: resolvedCompanyName, cmp: 0,
      flagPoleGainPct: null, flagRangePct: null, adr20Pct: null,
      breakoutHigh5: null, volumeSurgeRatio: null, ema10: null, ema20: null, flagLow: null,
      stopLoss: null, target1: null, target2: null, riskRewardRatio: null,
      preceding52WeekLow: null, p0DistancePctFrom52wLow: null, isAtPreceding52WeekLow: false,
      signalStatus: 'MONITORING', signalAge: 0, ruleChecks: []
    };

    if (!candles || candles.length < 35) {
      defaultFail.ruleChecks.push({ id: 'DATA_LENGTH', name: 'Candle History Available', passed: false, actualValue: `${candles?.length || 0} bars`, benchmarkRule: '>= 35 bars', explanation: 'Insufficient history for High-Tight Flag analysis.' });
      return defaultFail;
    }

    const n = candles.length;
    const cmp = candles[n - 1].close;
    defaultFail.cmp = cmp;
    const closePrices = candles.map(c => c.close);
    const highPrices = candles.map(c => c.high ?? c.close);
    const lowPrices = candles.map(c => c.low ?? c.close);
    const volumes = candles.map(c => c.volume || 0);

    const ema10Series = EMA.calculate({ period: 10, values: closePrices });
    const ema20Series = EMA.calculate({ period: 20, values: closePrices });
    const ema10 = ema10Series.length > 0 ? Number(ema10Series[ema10Series.length - 1].toFixed(2)) : null;
    const ema20 = ema20Series.length > 0 ? Number(ema20Series[ema20Series.length - 1].toFixed(2)) : null;

    const poleBase = candles[n - 21]?.close || closePrices[0];
    const flagPoleGainPct = Number((((cmp - poleBase) / poleBase) * 100).toFixed(2));

    const hh10 = Math.max(...highPrices.slice(-10));
    const ll10 = Math.min(...lowPrices.slice(-10));
    const flagRangePct = Number((((hh10 - ll10) / ll10) * 100).toFixed(2));
    const flagLow = Number(ll10.toFixed(2));

    const dailyRanges = candles.slice(-20).map(c => ((c.high ?? c.close) - (c.low ?? c.close)) / c.close * 100);
    const adr20Pct = Number((dailyRanges.reduce((a, b) => a + b, 0) / dailyRanges.length).toFixed(2));

    const breakoutHigh5 = Number(Math.max(...highPrices.slice(-6, -1)).toFixed(2));
    const vol20Avg = volumes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20 || 1;
    const volumeSurgeRatio = Number((volumes[n - 1] / vol20Avg).toFixed(2));
    const recentLows = lowPrices.slice(-3);
    const flagEmaSupport = ema10 !== null && recentLows.every(l => l >= ema10! * 0.99)
      ? true
      : ema20 !== null && recentLows.every(l => l >= ema20! * 0.99);

    const check1Passed = flagPoleGainPct >= 50.0;
    const check2Passed = flagRangePct <= 15.0;
    const check3Passed = adr20Pct >= 5.0;
    const check4Passed = flagEmaSupport;
    const check5Passed = cmp > breakoutHigh5;
    const check6Passed = volumeSurgeRatio >= 1.5;

    const p0Idx = n - 22;
    const low52w = this.getPreceding52WeekLowAt(candles, Math.max(0, p0Idx));
    const check52wLowPassed = low52w.isAtLowestLow;
    const allPassed = check1Passed && check2Passed && check3Passed && check4Passed && check5Passed && check6Passed
      && (!options?.filterPreceding52wLow || check52wLowPassed);

    const stopLoss = flagLow;
    const risk = Math.max(1, cmp - stopLoss);
    const target1 = Number((cmp + risk * 3.0).toFixed(2));
    const target2 = Number((cmp + risk * 5.0).toFixed(2));
    const riskRewardRatio = Number(((target1 - cmp) / risk).toFixed(2));

    const ruleChecks: RuleCheck[] = [
      { id: 'S8_FLAG_POLE', name: 'Flag Pole: 50%+ Gain in 20 Sessions', passed: check1Passed, actualValue: `+${flagPoleGainPct}% over last 20 sessions`, benchmarkRule: 'Close / Close[20] >= 1.50', explanation: check1Passed ? 'Strong flag pole — 50%+ surge confirms momentum thrust.' : `Insufficient pole gain (${flagPoleGainPct}%).` },
      { id: 'S8_TIGHT_FLAG', name: 'Tight Flag Consolidation (<= 15% Range)', passed: check2Passed, actualValue: `Flag range: ${flagRangePct}% (HH10: ₹${hh10.toFixed(0)} / LL10: ₹${ll10.toFixed(0)})`, benchmarkRule: '10-day range <= 15% peak-to-trough', explanation: check2Passed ? 'Tight flag consolidation — sellers exhausted after pole surge.' : `Flag too wide (${flagRangePct}%).` },
      { id: 'S8_ADR_FILTER', name: 'ADR >= 5% (High-Volatility Stock)', passed: check3Passed, actualValue: `ADR(20): ${adr20Pct}%`, benchmarkRule: 'Average Daily Range / Close >= 5%', explanation: check3Passed ? 'High ADR stock — sufficient volatility for meaningful breakout moves.' : `ADR too low (${adr20Pct}%) — stock lacks breakout potential.` },
      { id: 'S8_EMA_SUPPORT', name: 'Flag Resting on EMA 10 or EMA 20', passed: check4Passed, actualValue: `Recent lows vs EMA10 ₹${ema10} / EMA20 ₹${ema20}`, benchmarkRule: 'Flag lows holding above EMA 10 or EMA 20', explanation: check4Passed ? 'Flag consolidating on EMA support — healthy bull flag.' : 'Flag not supported by EMA — potential distribution.' },
      { id: 'S8_BREAKOUT', name: 'Breakout Above 5-Day Flag High', passed: check5Passed, actualValue: `CMP ₹${cmp} vs 5-day high ₹${breakoutHigh5}`, benchmarkRule: 'Close > Highest High of prior 5 sessions', explanation: check5Passed ? 'Breakout confirmed above flag resistance.' : 'Breakout not yet triggered.' },
      { id: 'S8_VOLUME_SURGE', name: 'Volume Surge on Breakout (>= 1.5x)', passed: check6Passed, actualValue: `${volumeSurgeRatio}x 20-day avg`, benchmarkRule: 'Volume > 1.5x 20-day SMA(Volume)', explanation: check6Passed ? 'Volume surge confirms breakout validity.' : `Insufficient volume on breakout (${volumeSurgeRatio}x).` },
      { id: 'S8_PRECEDING_52W_LOW', name: 'Pole Originated at 52-Week Low', passed: check52wLowPassed, actualValue: `52W Low: ₹${low52w.lowestLow} (diff: ${low52w.distancePct}%)`, benchmarkRule: 'Flag pole started from preceding 52-week low', explanation: check52wLowPassed ? 'Epiphany setup from 52-week low — maximum quality.' : `Pole did not start from 52-week low (${low52w.distancePct}% away).` }
    ];

    const signalStatus: Strategy8Result['signalStatus'] = cmp < flagLow ? 'INVALIDATED' : allPassed && cmp > (ema10 || 0) * 1.20 ? 'PASSED_OPPORTUNITY' : allPassed ? 'ACTIVE' : 'MONITORING';

    return { qualified: allPassed, symbol, companyName: resolvedCompanyName, cmp, flagPoleGainPct, flagRangePct, adr20Pct, breakoutHigh5, volumeSurgeRatio, ema10, ema20, flagLow, stopLoss, target1, target2, riskRewardRatio, preceding52WeekLow: low52w.lowestLow, p0DistancePctFrom52wLow: low52w.distancePct, isAtPreceding52WeekLow: low52w.isAtLowestLow, signalStatus, signalAge: 10, ruleChecks };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY 9: Volume Dry-Up & Surging Relative Strength (VDU-RS)
  // ─────────────────────────────────────────────────────────────────────────────

  public evaluateStrategy9(
    candles: Candle[],
    symbolOrInfo: string | { symbol: string; companyName?: string } = 'UNKNOWN',
    companyName: string = '',
    options?: StrategyEvaluationOptions
  ): Strategy9Result {
    const symbol = typeof symbolOrInfo === 'string' ? symbolOrInfo : (symbolOrInfo?.symbol || 'UNKNOWN');
    const resolvedCompanyName = typeof symbolOrInfo === 'object' && symbolOrInfo?.companyName ? symbolOrInfo.companyName : (companyName || symbol);

    const defaultFail: Strategy9Result = {
      qualified: false, symbol, companyName: resolvedCompanyName, cmp: 0,
      sma50: null, adr20Pct: null, vduRatio: null, vduDayLow: null,
      volumeSurgeRatio: null, sma20: null,
      stopLoss: null, target1: null, target2: null, riskRewardRatio: null,
      preceding52WeekLow: null, p0DistancePctFrom52wLow: null, isAtPreceding52WeekLow: false,
      signalStatus: 'MONITORING', signalAge: 0, ruleChecks: []
    };

    if (!candles || candles.length < 60) {
      defaultFail.ruleChecks.push({ id: 'DATA_LENGTH', name: 'Candle History Available', passed: false, actualValue: `${candles?.length || 0} bars`, benchmarkRule: '>= 60 bars', explanation: 'Insufficient history for SMA50 and volume analysis.' });
      return defaultFail;
    }

    const n = candles.length;
    const cmp = candles[n - 1].close;
    const prevHigh = candles[n - 2].high ?? candles[n - 2].close;
    const prevVol = candles[n - 2].volume || 1;
    const prevLow = candles[n - 2].low ?? candles[n - 2].close;
    defaultFail.cmp = cmp;
    const closePrices = candles.map(c => c.close);
    const highPrices = candles.map(c => c.high ?? c.close);
    const lowPrices = candles.map(c => c.low ?? c.close);
    const volumes = candles.map(c => c.volume || 0);

    const sma50Series = SMA.calculate({ period: 50, values: closePrices });
    const sma20Series = SMA.calculate({ period: 20, values: closePrices });
    const sma50 = sma50Series.length > 0 ? Number(sma50Series[sma50Series.length - 1].toFixed(2)) : null;
    const sma20 = sma20Series.length > 0 ? Number(sma20Series[sma20Series.length - 1].toFixed(2)) : null;

    const vol20Avg = volumes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20 || 1;
    const vduRatio = Number((prevVol / vol20Avg).toFixed(2));
    const volumeSurgeRatio = Number((volumes[n - 1] / Math.max(1, prevVol)).toFixed(2));

    const dailyRanges = candles.slice(-20).map(c => ((c.high ?? c.close) - (c.low ?? c.close)) / c.close * 100);
    const adr20Pct = Number((dailyRanges.reduce((a, b) => a + b, 0) / dailyRanges.length).toFixed(2));

    const check1Passed = sma50 !== null && cmp > sma50;
    const check2Passed = adr20Pct >= 5.0;
    const check3Passed = vduRatio <= 0.40;
    const check4Passed = cmp > prevHigh;
    const check5Passed = volumeSurgeRatio >= 2.0;

    const p0Idx = n - 5;
    const low52w = this.getPreceding52WeekLowAt(candles, Math.max(0, p0Idx));
    const check52wLowPassed = low52w.isAtLowestLow;
    const allPassed = check1Passed && check2Passed && check3Passed && check4Passed && check5Passed
      && (!options?.filterPreceding52wLow || check52wLowPassed);

    const stopLoss = Number(prevLow.toFixed(2));
    const risk = Math.max(1, cmp - stopLoss);
    const target1 = Number((cmp + risk * 3.0).toFixed(2));
    const target2 = Number((cmp + risk * 5.0).toFixed(2));
    const riskRewardRatio = Number(((target1 - cmp) / risk).toFixed(2));

    const ruleChecks: RuleCheck[] = [
      { id: 'S9_ABOVE_SMA50', name: 'Price Above SMA 50', passed: check1Passed, actualValue: `CMP ₹${cmp} vs SMA50 ₹${sma50}`, benchmarkRule: 'Close > 50-day SMA', explanation: check1Passed ? 'Stock above 50 SMA — intermediate uptrend intact.' : 'Stock below SMA50 — intermediate trend broken.' },
      { id: 'S9_ADR_FILTER', name: 'ADR >= 5% (Volatile Stock)', passed: check2Passed, actualValue: `ADR(20): ${adr20Pct}%`, benchmarkRule: 'Average Daily Range >= 5%', explanation: check2Passed ? 'Sufficient volatility for VDU-RS strategy.' : `ADR too low (${adr20Pct}%).` },
      { id: 'S9_VOLUME_DRYUP', name: 'Volume Dry-Up (<= 40% of 20-day Average)', passed: check3Passed, actualValue: `VDU ratio: ${vduRatio}x (${(vduRatio * 100).toFixed(0)}% of avg)`, benchmarkRule: 'Prior day volume < 0.40 * 20-day SMA(Volume)', explanation: check3Passed ? 'Extreme volume dry-up — sellers exhausted, stock resting.' : `Volume not dry enough (${vduRatio}x — need <= 0.40x).` },
      { id: 'S9_BREAKOUT', name: 'Breakout: Close > Prior Day High', passed: check4Passed, actualValue: `CMP ₹${cmp} vs Prev High ₹${prevHigh.toFixed(2)}`, benchmarkRule: 'Close > High[1]', explanation: check4Passed ? 'Price broke above prior day high — breakout from VDU base.' : 'Breakout not yet confirmed.' },
      { id: 'S9_VOLUME_SURGE', name: 'Volume Surge: >= 2x Prior VDU Volume', passed: check5Passed, actualValue: `${volumeSurgeRatio}x prior day volume`, benchmarkRule: 'Volume >= 2.0 * Volume[1]', explanation: check5Passed ? 'Strong volume surge from dry-up base confirms institutional re-entry.' : `Volume surge insufficient (${volumeSurgeRatio}x).` },
      { id: 'S9_PRECEDING_52W_LOW', name: 'VDU Base at Preceding 52-Week Low', passed: check52wLowPassed, actualValue: `52W Low: ₹${low52w.lowestLow} (diff: ${low52w.distancePct}%)`, benchmarkRule: 'VDU base within 2.5% of preceding 52-week low', explanation: check52wLowPassed ? 'Highest quality setup — VDU from 52-week low.' : `VDU base not at 52-week low (${low52w.distancePct}% away).` }
    ];

    const signalStatus: Strategy9Result['signalStatus'] = sma20 && cmp < sma20 ? 'INVALIDATED' : allPassed && cmp > (sma50 || 0) * 1.25 ? 'PASSED_OPPORTUNITY' : allPassed ? 'ACTIVE' : 'MONITORING';

    return { qualified: allPassed, symbol, companyName: resolvedCompanyName, cmp, sma50, adr20Pct, vduRatio, vduDayLow: Number(prevLow.toFixed(2)), volumeSurgeRatio, sma20, stopLoss, target1, target2, riskRewardRatio, preceding52WeekLow: low52w.lowestLow, p0DistancePctFrom52wLow: low52w.distancePct, isAtPreceding52WeekLow: low52w.isAtLowestLow, signalStatus, signalAge: 1, ruleChecks };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY 10: Parabolic Trendline + ORB (Intraday Hybrid)
  // ─────────────────────────────────────────────────────────────────────────────

  
  public evaluateStrategy11(
    candles: Candle[],
    symbolOrInfo: string | { symbol: string; companyName?: string; tier?: string } = 'UNKNOWN',
    companyName: string = '',
    options?: StrategyEvaluationOptions
  ): Strategy11Result {
    const symbol = typeof symbolOrInfo === 'string' ? symbolOrInfo : (symbolOrInfo?.symbol || 'UNKNOWN');
    const resolvedCompanyName = typeof symbolOrInfo === 'object' && symbolOrInfo?.companyName ? symbolOrInfo.companyName : (companyName || symbol);

    const defaultFail: Strategy11Result = {
      qualified: false, symbol, companyName: resolvedCompanyName, cmp: 0, sma200: null,
      supportLevel: null, springLow: null, volumeSurgeRatio: null, rsi14: null, bullishDivergence: false,
      stopLoss: null, target1: null, target2: null, riskRewardRatio: null,
      preceding52WeekLow: null, p0DistancePctFrom52wLow: null, isAtPreceding52WeekLow: false, ruleChecks: []
    };

    if (!candles || candles.length < 200) return defaultFail;

    const n = candles.length;
    const cmp = candles[n - 1].close;
    defaultFail.cmp = cmp;

    const closePrices = candles.map(c => c.close);
    const sma200Series = SMA.calculate({ period: 200, values: closePrices });
    const sma200 = sma200Series.length > 0 ? sma200Series[sma200Series.length - 1] : cmp;

    // Lookback 50 days for a strong support level
    let minLow = Infinity;
    for (let i = n - 50; i < n - 5; i++) {
        const l = candles[i].low ?? candles[i].close;
        if (l < minLow) minLow = l;
    }
    const supportLevel = minLow;

    // Check last 5 days for a "Spring" (dip below support, then close above)
    let springCandle = null;
    let springIdx = -1;
    for (let i = n - 5; i < n; i++) {
        const c = candles[i];
        const low = c.low ?? c.close;
        if (low < supportLevel && c.close > supportLevel) {
            springCandle = c;
            springIdx = i;
        }
    }

    const check1Passed = springCandle !== null;

    let volumeSurgeRatio = 0;
    if (springCandle) {
        const volAvg = candles.slice(springIdx - 20, springIdx).reduce((s, c) => s + (c.volume || 1), 0) / 20;
        volumeSurgeRatio = (springCandle.volume || 1) / Math.max(1, volAvg);
    }
    const check2Passed = volumeSurgeRatio >= 2.0;

    const rsiSeries = RSI.calculate({ period: 14, values: closePrices });
    const currentRsi = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1] : 50;
    
    // Simplistic bullish divergence (Price made new low, RSI didn't)
    let bullishDivergence = false;
    if (springIdx > 0) {
       const prevRsiLow = Math.min(...rsiSeries.slice(Math.max(0, rsiSeries.length - 30), rsiSeries.length - 5));
       bullishDivergence = (currentRsi > prevRsiLow);
    }
    const check3Passed = bullishDivergence && currentRsi < 50;

    const allPassed = check1Passed && check2Passed && check3Passed;

    const stopLoss = springCandle ? (springCandle.low ?? springCandle.close) * 0.99 : cmp * 0.95;
    const risk = Math.max(1, cmp - stopLoss);
    const target1 = Number((cmp + risk * 4.0).toFixed(2));
    
    return {
      qualified: allPassed, symbol, companyName: resolvedCompanyName, cmp, sma200,
      supportLevel, springLow: springCandle?.low ?? null, volumeSurgeRatio, rsi14: currentRsi, bullishDivergence,
      stopLoss: Number(stopLoss.toFixed(2)), target1, target2: Number((cmp + risk * 6.0).toFixed(2)), riskRewardRatio: 4.0,
      preceding52WeekLow: null, p0DistancePctFrom52wLow: null, isAtPreceding52WeekLow: false, ruleChecks: []
    };
  }


  public evaluateStrategy10(
    candles: Candle[],
    symbolOrInfo: string | { symbol: string; companyName?: string } = 'UNKNOWN',
    companyName: string = '',
    options?: StrategyEvaluationOptions
  ): Strategy10Result {
    const symbol = typeof symbolOrInfo === 'string' ? symbolOrInfo : (symbolOrInfo?.symbol || 'UNKNOWN');
    const resolvedCompanyName = typeof symbolOrInfo === 'object' && symbolOrInfo?.companyName ? symbolOrInfo.companyName : (companyName || symbol);

    const defaultFail: Strategy10Result = {
      qualified: false, symbol, companyName: resolvedCompanyName, cmp: 0,
      sma200: null, consecutiveLowerHighsCount: 0, trendlineBreakConfirmed: false,
      trendlineBreakLevel: null, atr14: null, requiresIntradayConfirmation: true,
      stopLoss: null, target1: null, target2: null, riskRewardRatio: null,
      preceding52WeekLow: null, p0DistancePctFrom52wLow: null, isAtPreceding52WeekLow: false,
      signalStatus: 'MONITORING', signalAge: 0, ruleChecks: []
    };

    if (!candles || candles.length < 40) {
      defaultFail.ruleChecks.push({ id: 'DATA_LENGTH', name: 'Candle History Available', passed: false, actualValue: `${candles?.length || 0} bars`, benchmarkRule: '>= 40 bars', explanation: 'Insufficient history for trendline compression analysis.' });
      return defaultFail;
    }

    const n = candles.length;
    const cmp = candles[n - 1].close;
    defaultFail.cmp = cmp;
    const closePrices = candles.map(c => c.close);
    const highPrices = candles.map(c => c.high ?? c.close);
    const lowPrices = candles.map(c => c.low ?? c.close);

    const sma200Series = SMA.calculate({ period: 200, values: closePrices });
    const atrSeries = ATR.calculate({ high: highPrices, low: lowPrices, close: closePrices, period: 14 });
    const sma200 = sma200Series.length > 0 ? Number(sma200Series[sma200Series.length - 1].toFixed(2)) : null;
    const atr14 = atrSeries.length > 0 ? Number(atrSeries[atrSeries.length - 1].toFixed(2)) : null;

    // Count consecutive lower highs in last 15 bars
    let consecutiveLowerHighsCount = 0;
    const lookbackBars = Math.min(15, n - 2);
    for (let i = n - 2; i >= n - lookbackBars - 1 && i >= 1; i--) {
      if (highPrices[i] < highPrices[i + 1]) {
        consecutiveLowerHighsCount++;
      } else {
        break;
      }
    }

    // Trendline break: close crosses above the 15-bar declining highest high
    const compressionHighs = highPrices.slice(-16, -1);
    const trendlineBreakLevel = Number(Math.max(...compressionHighs).toFixed(2));
    const trendlineBreakConfirmed = cmp > trendlineBreakLevel;

    // Daily traded value proxy (volume * close in Cr)
    const dailyTradedValue = (candles[n - 1].volume || 0) * cmp / 1e7;
    const adtv5 = candles.slice(-5).reduce((s, c) => s + (c.volume || 0) * c.close / 1e7, 0) / 5;

    const check1Passed = sma200 !== null && cmp > sma200;
    const check2Passed = adtv5 >= 15.0;
    const check3Passed = consecutiveLowerHighsCount >= 3;
    const check4Passed = trendlineBreakConfirmed;

    const p0Idx = n - 16;
    const low52w = this.getPreceding52WeekLowAt(candles, Math.max(0, p0Idx));
    const check52wLowPassed = low52w.isAtLowestLow;
    const allPassed = check1Passed && check2Passed && check3Passed && check4Passed
      && (!options?.filterPreceding52wLow || check52wLowPassed);

    const stopLoss = Number((cmp * 0.99).toFixed(2));
    const risk = Math.max(1, cmp - stopLoss);
    const priorSwingHigh = Number(Math.max(...highPrices.slice(-30, -15)).toFixed(2));
    const target1 = Number(Math.max(priorSwingHigh, cmp + risk * 2.0).toFixed(2));
    const target2 = atr14 ? Number((cmp + atr14 * 2.0).toFixed(2)) : Number((cmp + risk * 3.0).toFixed(2));
    const riskRewardRatio = Number(((target1 - cmp) / risk).toFixed(2));

    const ruleChecks: RuleCheck[] = [
      { id: 'S10_ABOVE_SMA200', name: 'Macro Bull Trend: Above SMA 200', passed: check1Passed, actualValue: `CMP ₹${cmp} vs SMA200 ₹${sma200}`, benchmarkRule: 'Close > 200-day SMA', explanation: check1Passed ? 'Stock in macro uptrend — trendline breakout in bullish context.' : 'Stock below SMA200 — macro trend not bullish.' },
      { id: 'S10_ADTV', name: 'Adequate Liquidity (ADTV >= ₹15 Cr)', passed: check2Passed, actualValue: `ADTV(5): ₹${adtv5.toFixed(1)} Cr`, benchmarkRule: 'Daily Traded Value > ₹15 Cr', explanation: check2Passed ? 'Sufficient liquidity for institutional ORB execution.' : `Insufficient liquidity (₹${adtv5.toFixed(1)} Cr).` },
      { id: 'S10_LOWER_HIGHS', name: 'Trendline Compression: 3+ Consecutive Lower Highs', passed: check3Passed, actualValue: `${consecutiveLowerHighsCount} consecutive lower highs`, benchmarkRule: 'At least 3 consecutive lower highs over 10-20 sessions', explanation: check3Passed ? `${consecutiveLowerHighsCount} lower highs — price compressing along declining trendline.` : `Only ${consecutiveLowerHighsCount} lower highs — compression not sufficient.` },
      { id: 'S10_TRENDLINE_BREAK', name: 'Daily Trendline Break Confirmed', passed: check4Passed, actualValue: `CMP ₹${cmp} vs trendline ₹${trendlineBreakLevel}`, benchmarkRule: 'Close crosses above 15-day declining highest high', explanation: check4Passed ? 'Daily trendline break confirmed — ORB confirmation needed intraday.' : 'Trendline not yet broken on daily chart.' },
      { id: 'S10_INTRADAY_ORB', name: 'Intraday ORB Confirmation Required (15-min, RVOL > 3.0)', passed: true, actualValue: 'Requires intraday Upstox 15-min candles', benchmarkRule: '15-min Close > First 15-min Candle High + RVOL > 3.0', explanation: 'Daily setup confirmed. ORB entry requires separate intraday monitoring via Upstox WebSocket.' },
      { id: 'S10_PRECEDING_52W_LOW', name: 'Compression Originates at 52-Week Low', passed: check52wLowPassed, actualValue: `52W Low: ₹${low52w.lowestLow} (diff: ${low52w.distancePct}%)`, benchmarkRule: 'Trendline compression starts from preceding 52-week low', explanation: check52wLowPassed ? 'Highest quality ORB setup — compression from 52-week low.' : `Compression not from 52-week low (${low52w.distancePct}% away).` }
    ];

    const signalStatus: Strategy10Result['signalStatus'] = cmp < (sma200 || 0) * 0.95 ? 'INVALIDATED' : allPassed && cmp > trendlineBreakLevel * 1.10 ? 'PASSED_OPPORTUNITY' : allPassed ? 'ACTIVE' : 'MONITORING';

    return { qualified: allPassed, symbol, companyName: resolvedCompanyName, cmp, sma200, consecutiveLowerHighsCount, trendlineBreakConfirmed, trendlineBreakLevel, atr14, requiresIntradayConfirmation: true, stopLoss, target1, target2, riskRewardRatio, preceding52WeekLow: low52w.lowestLow, p0DistancePctFrom52wLow: low52w.distancePct, isAtPreceding52WeekLow: low52w.isAtLowestLow, signalStatus, signalAge: consecutiveLowerHighsCount, ruleChecks };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA SOURCE: DailyOHLCV DB → HistoricalPrices fallback → Yahoo fallback
  // ─────────────────────────────────────────────────────────────────────────────

  private async getOHLCVBars(symbol: string, days: number = 600): Promise<Candle[] | null> {
    const db = getDB();
    // Canonical route: Kite-adjusted DuckDB history, with the approved Upstox
    // reconciliation overlay. SQLite remains a legacy fallback only.
    const adjustedBars = await DuckDbAdjustedOhlcvService.getDailyBars(symbol, days);
    if (adjustedBars && adjustedBars.length >= 25) {
      return adjustedBars.reverse().map(bar => ({
        date: bar.trade_date, open: Number(bar.open_adjusted), high: Number(bar.high_adjusted),
        low: Number(bar.low_adjusted), close: Number(bar.close_adjusted), volume: Number(bar.volume_raw) || 0
      }));
    }
    try {
      const rows: any[] = await dbAll(db, `
        SELECT trade_date, open, high, low, close, volume, turnover
        FROM DailyOHLCV INDEXED BY sqlite_autoindex_DailyOHLCV_1
        WHERE symbol = ?
        ORDER BY trade_date DESC
        LIMIT ?
      `, [symbol, days]);

      if (rows && rows.length >= 25) {
        const candles: Candle[] = rows.reverse()
          .filter((r: any) => r.close > 0 && r.open > 0)
          .map((r: any) => ({
            date: r.trade_date,
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
            volume: Number(r.volume) || 0,
            turnover: r.turnover ? Number(r.turnover) : undefined
          }));
        if (candles.length >= 25) return candles;
      }
    } catch {}

    // HistoricalPrices fallback — has close-only data but covers 2150+ symbols
    try {
      let hpRows: any[] = await dbAll(db, `
        SELECT date, close_price
        FROM HistoricalPrices
        WHERE symbol = ?
        ORDER BY date DESC
        LIMIT ?
      `, [symbol, days]);

      if ((!hpRows || hpRows.length < 25) && !symbol.endsWith('.NS')) {
        hpRows = await dbAll(db, `
          SELECT date, close_price
          FROM HistoricalPrices
          WHERE symbol = ?
          ORDER BY date DESC
          LIMIT ?
        `, [symbol + '.NS', days]);
      }

      if (hpRows && hpRows.length >= 25) {
        const candles: Candle[] = hpRows.reverse()
          .filter((r: any) => r.close_price > 0)
          .map((r: any) => {
            const c = Number(r.close_price);
            return { date: r.date, open: c, high: c, low: c, close: c, volume: 0 };
          });
        if (candles.length >= 25) return candles;
      }
    } catch {}

    // In bulk scanner mode, skip slow network fetches to keep scan ultra-fast and prevent timeouts
    if (days >= 500) {
      return null;
    }

    try {
      const data = await fetchTickerData(symbol, days, false);
      if (!data || !data.closePrices || data.closePrices.length < 25) return null;
      const validCandles = data.closePrices.filter((cp: any) => cp.volume !== null && cp.volume !== undefined && Number(cp.volume) > 0);
      if (validCandles.length < 25) return null;

      const candles: Candle[] = validCandles.map((cp: any) => ({
        date: cp.date,
        open: cp.open ?? cp.close,
        high: cp.high ?? cp.close,
        low: cp.low ?? cp.close,
        close: Number(cp.close),
        volume: Number(cp.volume),
        turnover: cp.turnover
      }));

      // Opportunistically store fetched data into DailyOHLCV for next time
      try {
        for (const c of candles) {
          await dbRun(db, `
            INSERT OR IGNORE INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'YAHOO')
          `, [symbol, c.date, c.open, c.high, c.low, c.close, c.volume]);
        }
      } catch {}

      return candles;
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UNIVERSE SCANNER (ALL 3 INDEPENDENT STRATEGIES + MULTI-CONVERGENCE)
  // ─────────────────────────────────────────────────────────────────────────────

  public async scanUniverse(targetSymbols?: string[], forceRefresh: boolean = false, options?: StrategyEvaluationOptions): Promise<IndependentTechnicalScanReport> {
    if (!targetSymbols && !forceRefresh && !options?.filterPreceding52wLow && this.cachedReport && (Date.now() - this.lastScanTime < this.CACHE_TTL_MS)) {
      return this.cachedReport;
    }

    const db = getDB();
    let symbolsToScan: Array<{ symbol: string; companyName: string }> = [];

    if (targetSymbols && targetSymbols.length > 0) {
      symbolsToScan = targetSymbols.map(s => ({ symbol: s, companyName: s }));
    } else {
      // Primary: use symbols that actually have DailyOHLCV data (at least 60 bars)
      // This avoids falling back to slow Yahoo Finance fetches for the bulk scan
      try {
        const ohlcvSymbols = await dbAll(db, `
          SELECT symbol, COUNT(*) as bar_count
          FROM DailyOHLCV
          GROUP BY symbol
          HAVING COUNT(*) >= 60
          ORDER BY COUNT(*) DESC
        `);
        if (ohlcvSymbols && ohlcvSymbols.length > 0) {
          const ohlcvSet = new Set<string>((ohlcvSymbols as any[]).map((r: any) => r.symbol));
          // Try to get company names from MasterTickers for matched symbols
          try {
            const mRows = await dbAll(db, `
        SELECT DISTINCT symbol, COALESCE(company_name, name, symbol) as companyName
              FROM MasterTickers
        WHERE status = 'ACTIVE' AND exchange IN ('NSE', 'BSE')
          AND symbol IS NOT NULL AND symbol != ''
          AND (upstox_key_nse IS NOT NULL OR upstox_key_bse IS NOT NULL)
            `);
            const nameMap = new Map<string, string>();
            (mRows || []).forEach((r: any) => nameMap.set(r.symbol, r.companyName));
            symbolsToScan = (ohlcvSymbols as any[]).map((r: any) => ({
              symbol: r.symbol,
              companyName: nameMap.get(r.symbol) || r.symbol
            }));
          } catch (_e) {
            symbolsToScan = (ohlcvSymbols as any[]).map((r: any) => ({ symbol: r.symbol, companyName: r.symbol }));
          }
        }
      } catch (_e) {}

      // Fallback: use MasterTickers if DailyOHLCV query failed
      if (symbolsToScan.length === 0) {
        try {
          const { UniverseManagerService } = await import('./UniverseManagerService.js');
          const universe = await UniverseManagerService.getInstance().getFullUniverse();
          if (universe.length > 0) {
            symbolsToScan = universe;
          }
        } catch (_e) {}
      }

      if (symbolsToScan.length === 0) {
        try {
          const mRows = await dbAll(db, `
            SELECT DISTINCT symbol, COALESCE(name, symbol) as companyName
            FROM MasterTickers
            WHERE exchange = 'NSE' AND segment = 'EQ' AND symbol IS NOT NULL AND symbol != ''
            ORDER BY COALESCE(market_cap_cr, 0) DESC
          `);
          symbolsToScan = (mRows || []).map((r: any) => ({ symbol: r.symbol, companyName: r.companyName || r.symbol }));
        } catch (e) {}
      }
    }

    PureTechnicalStrategiesEngine.scanProgress = { status: 'SCANNING', scanned: 0, total: symbolsToScan.length, percent: 0, totalUniverse: symbolsToScan.length, duckdbCoveredCount: 0, coverageGapCount: 0, bridgeFailureCount: 0, strategyEvaluatedCount: 0, deepAnalysisCount: 0 };

    const strategy1Matches: Strategy1Result[] = [];
    const strategy2Matches: Strategy2Result[] = [];
    const strategy3Matches: Strategy3Result[] = [];
    const strategy4Matches: Strategy4Result[] = [];
    const strategy5Matches: Strategy5Result[] = [];
    const strategy6Matches: Strategy6Result[] = [];
    const strategy7Matches: Strategy7Result[] = [];
    const strategy8Matches: Strategy8Result[] = [];
    const strategy9Matches: Strategy9Result[] = [];
    const strategy10Matches: Strategy10Result[] = [];
    const multiConvergenceMatches: MultiConvergenceMatch[] = [];
    const dualConvergenceMatches: Array<{
      symbol: string;
      companyName: string;
      cmp: number;
      strategy1: Strategy1Result;
      strategy2: Strategy2Result;
    }> = [];

    // Process in concurrent batches of 10 for high throughput
    const CHUNK_SIZE = 10;
    for (let i = 0; i < symbolsToScan.length; i += CHUNK_SIZE) {
      const chunk = symbolsToScan.slice(i, i + CHUNK_SIZE);
      const scannedCount = Math.min(symbolsToScan.length, i);
      PureTechnicalStrategiesEngine.scanProgress = {
        status: 'SCANNING',
        scanned: scannedCount,
        total: symbolsToScan.length,
        percent: Math.round((scannedCount / (symbolsToScan.length || 1)) * 100)
      };

      await Promise.all(chunk.map(async (item) => {
        try {
          const candles = await this.getOHLCVBars(item.symbol, 600);
          if (!candles || candles.length < 25) return;

          const s1 = this.evaluateStrategy1(candles, item.symbol, item.companyName, options);
          const s2 = this.evaluateStrategy2(candles, item.symbol, item.companyName, options);
          const s3 = this.evaluateStrategy3(candles, item.symbol, item.companyName, options);
          const s4 = this.evaluateStrategy4(candles, item.symbol, item.companyName, options);
          const s5 = this.evaluateStrategy5(candles, item.symbol, item.companyName, options);
          const s6 = this.evaluateStrategy6(candles, item.symbol, item.companyName, options);
          const s7 = this.evaluateStrategy7(candles, item.symbol, item.companyName, options);
          const s8 = this.evaluateStrategy8(candles, item.symbol, item.companyName, options);
          const s9 = this.evaluateStrategy9(candles, item.symbol, item.companyName, options);
          const s10 = this.evaluateStrategy10(candles, item.symbol, item.companyName, options);

          if (s1.qualified) strategy1Matches.push(s1);
          if (s2.qualified) strategy2Matches.push(s2);
          if (s3.qualified) strategy3Matches.push(s3);
          if (s4.qualified) strategy4Matches.push(s4);
          if (s5.qualified) strategy5Matches.push(s5);
          if (s6.qualified) strategy6Matches.push(s6);
          if (s7.qualified) strategy7Matches.push(s7);
          if (s8.qualified) strategy8Matches.push(s8);
          if (s9.qualified) strategy9Matches.push(s9);
          if (s10.qualified) strategy10Matches.push(s10);

          const matchedStrategies: MultiConvergenceMatch['matchedStrategies'] = [];
          if (s1.qualified) matchedStrategies.push('STRATEGY_1');
          if (s2.qualified) matchedStrategies.push('STRATEGY_2');
          if (s3.qualified) matchedStrategies.push('STRATEGY_3');
          if (s4.qualified) matchedStrategies.push('STRATEGY_4');
          if (s5.qualified) matchedStrategies.push('STRATEGY_5');
          if (s6.qualified) matchedStrategies.push('STRATEGY_6');
          if (s7.qualified) matchedStrategies.push('STRATEGY_7');
          if (s8.qualified) matchedStrategies.push('STRATEGY_8');
          if (s9.qualified) matchedStrategies.push('STRATEGY_9');
          if (s10.qualified) matchedStrategies.push('STRATEGY_10');

          if (matchedStrategies.length >= 2) {
            multiConvergenceMatches.push({
              symbol: item.symbol,
              companyName: item.companyName,
              cmp: s1.cmp || s2.cmp || s3.cmp || s4.cmp || s5.cmp || s6.cmp,
              matchedStrategies,
              convergenceCount: matchedStrategies.length,
              strategy1: s1.qualified ? s1 : undefined,
              strategy2: s2.qualified ? s2 : undefined,
              strategy3: s3.qualified ? s3 : undefined,
              strategy4: s4.qualified ? s4 : undefined,
              strategy5: s5.qualified ? s5 : undefined,
              strategy6: s6.qualified ? s6 : undefined,
              strategy7: s7.qualified ? s7 : undefined,
              strategy8: s8.qualified ? s8 : undefined,
              strategy9: s9.qualified ? s9 : undefined,
              strategy10: s10.qualified ? s10 : undefined
            });
          }

          if (s1.qualified && s2.qualified) {
            dualConvergenceMatches.push({
              symbol: item.symbol,
              companyName: item.companyName,
              cmp: s1.cmp,
              strategy1: s1,
              strategy2: s2
            });
          }
        } catch (err) {
          // Ignore single stock failure and continue
        }
      }));
    }

    PureTechnicalStrategiesEngine.scanProgress = { status: 'COMPLETE', scanned: symbolsToScan.length, total: symbolsToScan.length, percent: 100, totalUniverse: symbolsToScan.length };

    const report: IndependentTechnicalScanReport = {
      generatedAt: new Date().toISOString(),
      totalUniverseScanned: symbolsToScan.length,
      strategy1Matches,
      strategy2Matches,
      strategy3Matches,
      strategy4Matches,
      strategy5Matches,
      strategy6Matches,
      strategy7Matches,
      strategy8Matches,
      strategy9Matches,
      strategy10Matches,
      multiConvergenceMatches,
      dualConvergenceMatches
    };

    if (!targetSymbols && !options?.filterPreceding52wLow) {
      this.cachedReport = report;
      this.lastScanTime = Date.now();
    }

    return report;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SINGLE SCRIP ON-DEMAND EVALUATOR
  // ─────────────────────────────────────────────────────────────────────────────

  public async evaluateScripOnDemand(symbol: string, options?: StrategyEvaluationOptions): Promise<{
    symbol: string;
    cmp: number;
    strategy1: Strategy1Result;
    strategy2: Strategy2Result;
    strategy3: Strategy3Result;
    strategy4: Strategy4Result;
    strategy5: Strategy5Result;
    strategy6: Strategy6Result;
    strategy7: Strategy7Result;
    strategy8: Strategy8Result;
    strategy9: Strategy9Result;
    strategy10: Strategy10Result;
    matchedCount: number;
    matchedStrategies: MultiConvergenceMatch['matchedStrategies'];
  }> {
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const candles = await this.getOHLCVBars(cleanSym, 600);

    if (!candles || candles.length < 20) {
      throw new Error(`Insufficient historical price candle data for ${cleanSym}`);
    }

    const s1 = this.evaluateStrategy1(candles, cleanSym, cleanSym, options);
    const s2 = this.evaluateStrategy2(candles, cleanSym, cleanSym, options);
    const s3 = this.evaluateStrategy3(candles, cleanSym, cleanSym, options);
    const s4 = this.evaluateStrategy4(candles, cleanSym, cleanSym, options);
    const s5 = this.evaluateStrategy5(candles, cleanSym, cleanSym, options);
    const s6 = this.evaluateStrategy6(candles, cleanSym, cleanSym, options);
    const s7 = this.evaluateStrategy7(candles, cleanSym, cleanSym, options);
    const s8 = this.evaluateStrategy8(candles, cleanSym, cleanSym, options);
    const s9 = this.evaluateStrategy9(candles, cleanSym, cleanSym, options);
    const s10 = this.evaluateStrategy10(candles, cleanSym, cleanSym, options);

    const matchedStrategies: MultiConvergenceMatch['matchedStrategies'] = [];
    if (s1.qualified) matchedStrategies.push('STRATEGY_1');
    if (s2.qualified) matchedStrategies.push('STRATEGY_2');
    if (s3.qualified) matchedStrategies.push('STRATEGY_3');
    if (s4.qualified) matchedStrategies.push('STRATEGY_4');
    if (s5.qualified) matchedStrategies.push('STRATEGY_5');
    if (s6.qualified) matchedStrategies.push('STRATEGY_6');
    if (s7.qualified) matchedStrategies.push('STRATEGY_7');
    if (s8.qualified) matchedStrategies.push('STRATEGY_8');
    if (s9.qualified) matchedStrategies.push('STRATEGY_9');
    if (s10.qualified) matchedStrategies.push('STRATEGY_10');

    return {
      symbol: cleanSym,
      cmp: s1.cmp || s2.cmp || s3.cmp || s4.cmp || s5.cmp || s6.cmp,
      strategy1: s1, strategy2: s2, strategy3: s3, strategy4: s4,
      strategy5: s5, strategy6: s6, strategy7: s7, strategy8: s8,
      strategy9: s9, strategy10: s10,
      matchedCount: matchedStrategies.length,
      matchedStrategies
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE A: UNIFIED SCANNER FOR PRE-CALCULATION SERVICE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Scan all strategies for pre-calculation caching
   * Takes array of strategy IDs and runs each strategy in sequence
   * Returns results organized by strategy_id for efficient caching
   */
  public async scanUniverseAllStrategies(
    strategyIds: string[],
    options?: StrategyEvaluationOptions & { universeLimit?: number }
  ): Promise<any> {
    const db = getDB();
    let symbolsToScan: Array<{ symbol: string; companyName: string }> = [];

    // Get universe of symbols to scan directly from MasterTickers (ultra-fast 16ms query)
    try {
      const mRows = await dbAll<any>(db, `
        SELECT DISTINCT symbol, COALESCE(company_name, name, symbol) as companyName
        FROM MasterTickers
        WHERE status = 'ACTIVE' AND exchange IN ('NSE', 'BSE')
          AND symbol IS NOT NULL AND symbol != ''
          AND (upstox_key_nse IS NOT NULL OR upstox_key_bse IS NOT NULL)
        ORDER BY symbol ASC
        ${options?.universeLimit ? `LIMIT ${Math.min(options.universeLimit, 1000)}` : ''}
      `);

      if (mRows && mRows.length > 0) {
        symbolsToScan = mRows.map((r: any) => ({
          symbol: r.symbol,
          companyName: r.companyName || r.symbol
        }));
      }
    } catch (_e) {
      // Fallback to minimal list
    }

    if (symbolsToScan.length === 0) {
      PureTechnicalStrategiesEngine.scanProgress = {
        status: 'IDLE',
        scanned: 0,
        total: 0,
        percent: 100,
        currentSymbol: '',
        qualifiedCount: 0,
        strategyMatches: {},
        totalUniverse: 0,
        duckdbCoveredCount: 0,
        coverageGapCount: 0,
        bridgeFailureCount: 0,
        strategyEvaluatedCount: 0,
        deepAnalysisCount: 0,
        lastError: ''
      };
      return {
        strategy_results: {},
        total_scanned: 0,
        total_qualified_across_all: 0
      };
    }

    const strategyResults: { [strategyId: string]: any[] } = {};
    let totalQualified = 0;

    // Map strategy IDs to evaluation functions
    const strategyMap: { [key: string]: (candles: Candle[], sym: string, name: string, opts?: StrategyEvaluationOptions) => any } = {
      'S1_VPA_BASE_BREAKOUT': (c, s, n, o) => this.evaluateStrategy1(c, s, n, o),
      'S2_INSTITUTIONAL_FVG_CE': (c, s, n, o) => this.evaluateStrategy2(c, s, n, o),
      'S3_HH_HL_COMPACTION': (c, s, n, o) => this.evaluateStrategy3(c, s, n, o),
      'S4_HH_HL_SMA200_VPA': (c, s, n, o) => this.evaluateStrategy4(c, s, n, o),
      'S5_50EMA_PULLBACK_VCP': (c, s, n, o) => this.evaluateStrategy5(c, s, n, o),
      'S6_RS_BREAKOUT': (c, s, n, o) => this.evaluateStrategy6(c, s, n, o),
      'S7_RSI_MEAN_REVERSION': (c, s, n, o) => this.evaluateStrategy7(c, s, n, o),
      'S8_HIGH_TIGHT_FLAG': (c, s, n, o) => this.evaluateStrategy8(c, s, n, o),
      'S9_VOLUME_DRYUP_RS': (c, s, n, o) => this.evaluateStrategy9(c, s, n, o),
      'S10_TRENDLINE_ORB': (c, s, n, o) => this.evaluateStrategy10(c, s, n, o),
    };

    // Initialize results array for each strategy
    for (const stratId of strategyIds) {
      strategyResults[stratId] = [];
    }

    PureTechnicalStrategiesEngine.scanProgress = {
      status: 'SCANNING',
      scanned: 0,
      total: symbolsToScan.length,
      percent: 0,
      currentSymbol: symbolsToScan[0]?.symbol || '',
      qualifiedCount: 0,
      strategyMatches: {},
      totalUniverse: symbolsToScan.length,
      duckdbCoveredCount: 0,
      coverageGapCount: 0,
      bridgeFailureCount: 0,
      strategyEvaluatedCount: 0,
      deepAnalysisCount: 0,
      lastError: ''
    };

    // Establish exact coverage gap statistics upfront using filesystem check
    const coverage = DuckDbAdjustedOhlcvService.getDuckDbCoverage(symbolsToScan.map(s => s.symbol));
    let totalBridgeFailures = 0;
    let totalStrategyEvaluated = 0;

    // Scan all symbols in concurrent chunks of 25 for maximum throughput
    const CHUNK_SIZE = 25;
    for (let i = 0; i < symbolsToScan.length; i += CHUNK_SIZE) {
      const chunk = symbolsToScan.slice(i, i + CHUNK_SIZE);
      // A single bounded DuckDB bridge process supplies the entire chunk.
      // Missing symbols alone may use the legacy fallback below.
      const duckdbResult = await DuckDbAdjustedOhlcvService.getDailyBarsForSymbols(chunk.map(item => item.symbol), 600);
      totalBridgeFailures += duckdbResult.bridgeFailureCount;

      await Promise.all(chunk.map(async (item) => {
        try {
          const adjusted = duckdbResult.bars.get(item.symbol.trim().toUpperCase());
          // The strategy gate is deliberately local-only. A missing DuckDB
          // partition is coverage work, not a reason to fan out into live
          // APIs while screening the complete universe.
          if (!adjusted?.length) return;
          totalStrategyEvaluated++;
          const candles = adjusted.map(bar => ({ date: bar.trade_date, open: Number(bar.open_adjusted), high: Number(bar.high_adjusted), low: Number(bar.low_adjusted), close: Number(bar.close_adjusted), volume: Number(bar.volume_raw) || 0 }));
          if (!candles || candles.length < 25) return;

          // Run each requested strategy for this symbol in memory
          for (const stratId of strategyIds) {
            const evaluator = strategyMap[stratId];
            if (!evaluator) continue;

            const result = evaluator(candles, item.symbol, item.companyName, options);
            strategyResults[stratId].push({
              qualified: result.qualified,
              symbol: item.symbol,
              companyName: item.companyName,
              entry_price: result.p0 || null,
              target1: result.target1 || null,
              target2: result.target2 || null,
              stop_loss: result.stopLoss || null,
              rr_ratio: result.riskRewardRatio || null,
              confidence_pct: result.confidence_pct || (result.qualified ? 75 : 0),
              rule_checks: result.qualified ? (result.ruleChecks || null) : null,
              cmp: result.cmp
            });

            if (result.qualified) {
              totalQualified++;
            }
          }
        } catch (e: any) {
          console.error(`[PureTechnicalStrategiesEngine] Error scanning ${item.symbol}:`, e.message || e);
        }
      }));

      // Update live real-time scan progress
      const scannedSoFar = Math.min(symbolsToScan.length, i + chunk.length);
      const percent = Math.min(99, Math.round((scannedSoFar / symbolsToScan.length) * 100));
      const strategyMatchesMap: { [id: string]: number } = {};
      for (const sId of strategyIds) {
        strategyMatchesMap[sId] = strategyResults[sId]?.filter(x => x.qualified).length || 0;
      }

      PureTechnicalStrategiesEngine.scanProgress = {
        status: totalBridgeFailures > 0 ? 'BRIDGE_UNHEALTHY' : 'SCANNING',
        scanned: scannedSoFar,
        total: symbolsToScan.length,
        percent,
        currentSymbol: chunk[chunk.length - 1]?.symbol || '',
        qualifiedCount: totalQualified,
        strategyMatches: strategyMatchesMap,
        totalUniverse: symbolsToScan.length,
        duckdbCoveredCount: coverage.covered.size,
        coverageGapCount: coverage.gaps.size,
        bridgeFailureCount: totalBridgeFailures,
        strategyEvaluatedCount: totalStrategyEvaluated,
        deepAnalysisCount: 0,
        lastError: totalBridgeFailures > 0 ? 'Bridge process failed during chunk fetch' : ''
      };

      // Small 5ms yield to event loop for API responsiveness
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    // Mark scan progress complete
    const finalMatchesMap: { [id: string]: number } = {};
    for (const sId of strategyIds) {
      finalMatchesMap[sId] = strategyResults[sId]?.filter(x => x.qualified).length || 0;
    }
    PureTechnicalStrategiesEngine.scanProgress = {
      status: totalBridgeFailures > 0 ? 'BRIDGE_UNHEALTHY' : 'COMPLETE',
      scanned: symbolsToScan.length,
      total: symbolsToScan.length,
      percent: 100,
      currentSymbol: 'COMPLETE',
      qualifiedCount: totalQualified,
      strategyMatches: finalMatchesMap,
      totalUniverse: symbolsToScan.length,
      duckdbCoveredCount: coverage.covered.size,
      coverageGapCount: coverage.gaps.size,
      bridgeFailureCount: totalBridgeFailures,
      strategyEvaluatedCount: totalStrategyEvaluated,
      deepAnalysisCount: 0,
      lastError: totalBridgeFailures > 0 ? 'Bridge process failed during scan' : ''
    };

    return {
      strategy_results: strategyResults,
      convergence: null,
      total_scanned: symbolsToScan.length,
      total_qualified_across_all: totalQualified,
      total_universe: symbolsToScan.length,
      duckdb_covered: coverage.covered.size,
      coverage_gaps: coverage.gaps.size,
      bridge_failures: totalBridgeFailures,
      strategy_evaluated: totalStrategyEvaluated
    };
  }
}
