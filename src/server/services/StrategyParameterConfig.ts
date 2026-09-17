// ─── Type Definitions ───────────────────────────────────────────────────────

export type ParameterFamily =
  | 'universe' | 'trend' | 'impulse' | 'pullback' | 'volume'
  | 'volatility' | 'entry' | 'smartMoney' | 'risk' | 'filters';

export type StrategyId =
  | 'S1_VPA_BASE_BREAKOUT' | 'S2_INSTITUTIONAL_FVG_CE'
  | 'S3_HH_HL_COMPACTION' | 'S4_HH_HL_SMA200_VPA'
  | 'S5_50EMA_PULLBACK_VCP' | 'S6_RS_BREAKOUT'
  | 'S7_RSI_MEAN_REVERSION' | 'S8_HIGH_TIGHT_FLAG'
  | 'S9_VOLUME_DRYUP_RS' | 'S10_TRENDLINE_ORB';

export type StrategyCategory =
  | 'BREAKOUT' | 'PULLBACK' | 'MEAN_REVERSION' | 'MOMENTUM' | 'INTRADAY_HYBRID';

export type EntryTriggerType =
  | 'CLOSE_ABOVE_PREV_HIGH' | 'N_DAY_HIGH_BREAK' | 'FVG_CE_REENTRY'
  | 'L2_COMPACTION_ZONE' | 'VPA_BASE_BREAKOUT' | 'ORB_15MIN' | 'REVERSAL_CANDLE';

export type StopLossMethod =
  | 'FIXED_PCT_BELOW_P0' | 'FIXED_PCT_BELOW_L2' | 'FVG_BOTTOM_OFFSET'
  | 'SWING_LOW' | 'FIXED_PCT_BELOW_ENTRY' | 'ORB_CANDLE_LOW';

export type TargetMethod =
  | 'RR_MULTIPLE' | 'PEAK_RETEST' | 'H2_RETEST' | 'PRIOR_SWING_HIGH' | 'MEAN_REVERSION_SMA';

export type TrailingStopMethod = 'EMA_CLOSE' | 'ATR_TRAIL' | 'NONE';

// ─── Parameter Config Interface ─────────────────────────────────────────────

export interface UniverseParams {
  marketCapFloorCr: number;
  adtvFloorCr: number;
  closePriceFloor: number;
  indexMembership: string;
  circuitBandMinPct: number;
  freeFloatMaxPct: number;
  promoterHoldingMinPct: number;
  publicFloatMaxShares: number;
  adrMinPct: number;
}

export interface TrendParams {
  priceAboveSma200: boolean;
  emaShortAboveSmaLong: boolean;
  emaShortPeriod: number;
  emaLongPeriod: number;
  emaProximityMultiplier: number;
  sma200TolerancePct: number;
  sma200SlopeRising: boolean;
  priceAboveSma50: boolean;
  rsiPeriod: number;
  rsiBullishFloor: number;
  rsiPullbackLow: number;
  rsiPullbackHigh: number;
  rsiBreakoutLow: number;
  rsiBreakoutHigh: number;
  rsiOversoldThreshold: number;
}

export interface ImpulseParams {
  impulseGainMinPct: number;
  impulseGainIsOrWithTurnover: boolean;
  cumulativeTurnoverFloorCr: number;
  impulseDurationMinBars: number;
  impulseDurationMaxBars: number;
  flagPoleGainMinPct: number;
  flagPoleLookbackBars: number;
  rsConsecutiveSessionsMin: number;
  rsOutperformanceMinPct: number;
  near52wHighPct: number;
  moveWindowBars: number;
  p0SearchExtensionBars: number;
}

export interface PullbackParams {
  baseDurationMinBars: number;
  baseDurationMaxBars: number;
  retracementFloorMultiplier: number;
  pullbackDropMinPct: number;
  emaPullbackProximityLow: number;
  emaPullbackProximityHigh: number;
  entryZoneLowerBand: number;
  entryZoneUpperBand: number;
  consolidationRangeMaxPct: number;
  consolidationRangeLookback: number;
  bbPeriod: number;
  bbStdDev: number;
  lowerHighsMinCount: number;
  trendlineCompressionBars: number;
  swingGapMinBars: number;
  l2SearchWindow: number;
}

export interface VolumeParams {
  volumeDryingRatio: number;
  vpaAsymmetryRatioMin: number;
  volumeSurgeMultiplier: number;
  volumeDryUpThreshold: number;
  volumeBelowAverage: boolean;
  entryVolDryingRatio: number;
  entryVolImpulseRatio: number;
  rvolIntradayMin: number;
  pullbackVolDryingRatio: number;
}

export interface VolatilityParams {
  atrContractionRatioMax: number;
  atrShortPeriod: number;
  atrLongPeriod: number;
  nrLookbackWindow: number;
  nr4Enabled: boolean;
  nr7Enabled: boolean;
  entryRangeContractionRatio: number;
  atrBelowAverage: boolean;
  capitulationAtrMultiplier: number;
  atrTrailingStopMultiplier: number;
}

export interface EntryParams {
  entryTriggerType: EntryTriggerType;
  breakoutLookbackBars: number;
  fvgDetectionEnabled: boolean;
  ceEntryEnabled: boolean;
  fvgLookbackBars: number;
  orbEnabled: boolean;
  orbTimeframeMinutes: number;
  reversalCandleRequired: boolean;
  flagEmaSupport: number;
  vpaContractionAtEntryRequired: boolean;
  entrySliceBars: number;
}

export interface SmartMoneyParams {
  institutionalTurnoverFloorCr: number;
  smartMoneyVolRatio: number;
  absorptionClosePctMin: number;
  adtMultiplier: number;
  adtFloorCr: number;
  smartMoneyEnabled: boolean;
}

export interface RiskParams {
  stopLossMethod: StopLossMethod;
  stopLossPct: number;
  stopLossFvgMultiplier: number;
  target1RRMultiplier: number;
  target2RRMultiplier: number;
  target1Method: TargetMethod;
  target2FibExtension: number;
  target2PeakMultiplier: number;
  trailingStopMethod: TrailingStopMethod;
  trailingStopEmaPeriod: number;
  partialExitPct: number;
  maxPortfolioRiskPct: number;
  passedOpportunityThreshold: number;
  meanReversionMaxDays: number;
}

export interface FiltersParams {
  filterPreceding52wLow: boolean;
  preceding52wTolerancePct: number;
  preceding52wLookbackBars: number;
  preceding52wImpulseMinPct: number;
  filterSma200Proximity: boolean;
  secondaryRuleMinCount: number;
}

export interface StrategyParameterConfig {
  universe: UniverseParams;
  trend: TrendParams;
  impulse: ImpulseParams;
  pullback: PullbackParams;
  volume: VolumeParams;
  volatility: VolatilityParams;
  entry: EntryParams;
  smartMoney: SmartMoneyParams;
  risk: RiskParams;
  filters: FiltersParams;
}

// ─── Default Configs Per Strategy ───────────────────────────────────────────

const BASE_DEFAULTS: StrategyParameterConfig = {
  universe: {
    marketCapFloorCr: 0,
    adtvFloorCr: 0,
    closePriceFloor: 0,
    indexMembership: 'ANY',
    circuitBandMinPct: 0,
    freeFloatMaxPct: 100,
    promoterHoldingMinPct: 0,
    publicFloatMaxShares: 999999,
    adrMinPct: 0,
  },
  trend: {
    priceAboveSma200: false,
    emaShortAboveSmaLong: false,
    emaShortPeriod: 9,
    emaLongPeriod: 21,
    emaProximityMultiplier: 0.985,
    sma200TolerancePct: 2.0,
    sma200SlopeRising: false,
    priceAboveSma50: false,
    rsiPeriod: 14,
    rsiBullishFloor: 50,
    rsiPullbackLow: 42,
    rsiPullbackHigh: 55,
    rsiBreakoutLow: 60,
    rsiBreakoutHigh: 78,
    rsiOversoldThreshold: 32,
  },
  impulse: {
    impulseGainMinPct: 15,
    impulseGainIsOrWithTurnover: false,
    cumulativeTurnoverFloorCr: 50,
    impulseDurationMinBars: 4,
    impulseDurationMaxBars: 25,
    flagPoleGainMinPct: 50,
    flagPoleLookbackBars: 20,
    rsConsecutiveSessionsMin: 20,
    rsOutperformanceMinPct: 15,
    near52wHighPct: 95,
    moveWindowBars: 15,
    p0SearchExtensionBars: 10,
  },
  pullback: {
    baseDurationMinBars: 10,
    baseDurationMaxBars: 30,
    retracementFloorMultiplier: 0.45,
    pullbackDropMinPct: 1.5,
    emaPullbackProximityLow: 0.98,
    emaPullbackProximityHigh: 1.02,
    entryZoneLowerBand: 0.985,
    entryZoneUpperBand: 1.045,
    consolidationRangeMaxPct: 12,
    consolidationRangeLookback: 20,
    bbPeriod: 20,
    bbStdDev: 2.0,
    lowerHighsMinCount: 3,
    trendlineCompressionBars: 15,
    swingGapMinBars: 2,
    l2SearchWindow: 10,
  },
  volume: {
    volumeDryingRatio: 0.80,
    vpaAsymmetryRatioMin: 1.15,
    volumeSurgeMultiplier: 2.0,
    volumeDryUpThreshold: 0.40,
    volumeBelowAverage: false,
    entryVolDryingRatio: 0.85,
    entryVolImpulseRatio: 0.80,
    rvolIntradayMin: 3.0,
    pullbackVolDryingRatio: 0.90,
  },
  volatility: {
    atrContractionRatioMax: 0.85,
    atrShortPeriod: 5,
    atrLongPeriod: 14,
    nrLookbackWindow: 5,
    nr4Enabled: true,
    nr7Enabled: true,
    entryRangeContractionRatio: 0.85,
    atrBelowAverage: false,
    capitulationAtrMultiplier: 1.5,
    atrTrailingStopMultiplier: 2.0,
  },
  entry: {
    entryTriggerType: 'VPA_BASE_BREAKOUT',
    breakoutLookbackBars: 20,
    fvgDetectionEnabled: false,
    ceEntryEnabled: false,
    fvgLookbackBars: 35,
    orbEnabled: false,
    orbTimeframeMinutes: 15,
    reversalCandleRequired: false,
    flagEmaSupport: 10,
    vpaContractionAtEntryRequired: false,
    entrySliceBars: 3,
  },
  smartMoney: {
    institutionalTurnoverFloorCr: 2.0,
    smartMoneyVolRatio: 1.3,
    absorptionClosePctMin: 0.60,
    adtMultiplier: 2.5,
    adtFloorCr: 1.0,
    smartMoneyEnabled: false,
  },
  risk: {
    stopLossMethod: 'FIXED_PCT_BELOW_P0',
    stopLossPct: 2.0,
    stopLossFvgMultiplier: 0.985,
    target1RRMultiplier: 2.0,
    target2RRMultiplier: 3.5,
    target1Method: 'RR_MULTIPLE',
    target2FibExtension: 0.618,
    target2PeakMultiplier: 1.10,
    trailingStopMethod: 'NONE',
    trailingStopEmaPeriod: 20,
    partialExitPct: 50,
    maxPortfolioRiskPct: 1.0,
    passedOpportunityThreshold: 1.15,
    meanReversionMaxDays: 7,
  },
  filters: {
    filterPreceding52wLow: false,
    preceding52wTolerancePct: 2.5,
    preceding52wLookbackBars: 252,
    preceding52wImpulseMinPct: 20.0,
    filterSma200Proximity: false,
    secondaryRuleMinCount: 3,
  },
};

export const STRATEGY_DEFAULTS: Record<StrategyId, Partial<StrategyParameterConfig>> = {
  S1_VPA_BASE_BREAKOUT: {
    trend: {
      ...BASE_DEFAULTS.trend,
      emaShortPeriod: 9,
      emaLongPeriod: 21,
      emaProximityMultiplier: 0.985,
      rsiPeriod: 14,
      rsiBullishFloor: 50,
    },
    impulse: {
      ...BASE_DEFAULTS.impulse,
      impulseGainMinPct: 15,
      impulseDurationMinBars: 4,
      impulseDurationMaxBars: 25,
    },
    pullback: {
      ...BASE_DEFAULTS.pullback,
      baseDurationMinBars: 10,
      baseDurationMaxBars: 30,
      retracementFloorMultiplier: 0.45,
    },
    volume: {
      ...BASE_DEFAULTS.volume,
      volumeDryingRatio: 0.80,
      vpaAsymmetryRatioMin: 1.15,
    },
    volatility: {
      ...BASE_DEFAULTS.volatility,
      atrContractionRatioMax: 0.85,
      atrShortPeriod: 5,
      atrLongPeriod: 14,
      nr4Enabled: true,
      nr7Enabled: true,
    },
    entry: {
      ...BASE_DEFAULTS.entry,
      entryTriggerType: 'VPA_BASE_BREAKOUT',
    },
    risk: {
      ...BASE_DEFAULTS.risk,
      stopLossMethod: 'FIXED_PCT_BELOW_P0',
      stopLossPct: 2.0,
      target1RRMultiplier: 2.0,
      target2RRMultiplier: 3.5,
      passedOpportunityThreshold: 1.15,
    },
    filters: {
      ...BASE_DEFAULTS.filters,
      secondaryRuleMinCount: 3,
    },
  },
  S2_INSTITUTIONAL_FVG_CE: {
    impulse: {
      ...BASE_DEFAULTS.impulse,
      impulseGainMinPct: 20,
      impulseGainIsOrWithTurnover: true,
      cumulativeTurnoverFloorCr: 50,
      moveWindowBars: 15,
      p0SearchExtensionBars: 10,
    },
    pullback: {
      ...BASE_DEFAULTS.pullback,
      pullbackDropMinPct: 1.5,
    },
    volume: {
      ...BASE_DEFAULTS.volume,
      volumeDryingRatio: 0.75,
      entryVolDryingRatio: 0.85,
      entryVolImpulseRatio: 0.80,
    },
    volatility: {
      ...BASE_DEFAULTS.volatility,
      entryRangeContractionRatio: 0.85,
    },
    entry: {
      ...BASE_DEFAULTS.entry,
      entryTriggerType: 'FVG_CE_REENTRY',
      fvgDetectionEnabled: true,
      ceEntryEnabled: true,
      fvgLookbackBars: 35,
      entrySliceBars: 3,
    },
    smartMoney: {
      ...BASE_DEFAULTS.smartMoney,
      institutionalTurnoverFloorCr: 2.0,
      smartMoneyEnabled: true,
    },
    risk: {
      ...BASE_DEFAULTS.risk,
      stopLossMethod: 'FVG_BOTTOM_OFFSET',
      stopLossFvgMultiplier: 0.985,
      target1Method: 'PEAK_RETEST',
      target2PeakMultiplier: 1.10,
    },
  },
  S3_HH_HL_COMPACTION: {
    trend: {
      ...BASE_DEFAULTS.trend,
      sma200TolerancePct: 2.0,
    },
    impulse: {
      ...BASE_DEFAULTS.impulse,
      impulseGainMinPct: 20,
      impulseGainIsOrWithTurnover: true,
      cumulativeTurnoverFloorCr: 50,
      impulseDurationMinBars: 8,
    },
    pullback: {
      ...BASE_DEFAULTS.pullback,
      entryZoneLowerBand: 0.985,
      entryZoneUpperBand: 1.045,
      swingGapMinBars: 2,
      l2SearchWindow: 10,
    },
    volume: {
      ...BASE_DEFAULTS.volume,
      volumeDryingRatio: 0.90,
      pullbackVolDryingRatio: 0.90,
    },
    entry: {
      ...BASE_DEFAULTS.entry,
      entryTriggerType: 'L2_COMPACTION_ZONE',
    },
    smartMoney: {
      ...BASE_DEFAULTS.smartMoney,
      institutionalTurnoverFloorCr: 2.0,
      smartMoneyVolRatio: 1.3,
      absorptionClosePctMin: 0.60,
      adtMultiplier: 2.5,
      adtFloorCr: 1.0,
      smartMoneyEnabled: true,
    },
    risk: {
      ...BASE_DEFAULTS.risk,
      stopLossMethod: 'FIXED_PCT_BELOW_L2',
      stopLossPct: 2.0,
      target1Method: 'H2_RETEST',
      target2FibExtension: 0.618,
    },
  },
  S4_HH_HL_SMA200_VPA: {
    trend: {
      ...BASE_DEFAULTS.trend,
      sma200TolerancePct: 2.0,
    },
    impulse: {
      ...BASE_DEFAULTS.impulse,
      impulseGainMinPct: 20,
      impulseGainIsOrWithTurnover: true,
      cumulativeTurnoverFloorCr: 50,
      impulseDurationMinBars: 8,
    },
    pullback: {
      ...BASE_DEFAULTS.pullback,
      entryZoneLowerBand: 0.985,
      entryZoneUpperBand: 1.045,
      swingGapMinBars: 2,
      l2SearchWindow: 10,
    },
    volume: {
      ...BASE_DEFAULTS.volume,
      volumeDryingRatio: 0.90,
      pullbackVolDryingRatio: 0.90,
      entryVolDryingRatio: 0.85,
      entryVolImpulseRatio: 0.80,
    },
    volatility: {
      ...BASE_DEFAULTS.volatility,
      entryRangeContractionRatio: 0.85,
    },
    entry: {
      ...BASE_DEFAULTS.entry,
      entryTriggerType: 'L2_COMPACTION_ZONE',
      vpaContractionAtEntryRequired: true,
      entrySliceBars: 3,
    },
    smartMoney: {
      ...BASE_DEFAULTS.smartMoney,
      institutionalTurnoverFloorCr: 2.0,
      smartMoneyVolRatio: 1.3,
      absorptionClosePctMin: 0.60,
      adtMultiplier: 2.5,
      adtFloorCr: 1.0,
      smartMoneyEnabled: true,
    },
    risk: {
      ...BASE_DEFAULTS.risk,
      stopLossMethod: 'FIXED_PCT_BELOW_L2',
      stopLossPct: 2.0,
      target1Method: 'H2_RETEST',
      target2FibExtension: 0.618,
    },
  },
  S5_50EMA_PULLBACK_VCP: {
    universe: {
      ...BASE_DEFAULTS.universe,
      marketCapFloorCr: 2000,
      adtvFloorCr: 10,
      closePriceFloor: 50,
    },
    trend: {
      ...BASE_DEFAULTS.trend,
      priceAboveSma200: true,
      emaShortAboveSmaLong: true,
      emaShortPeriod: 50,
      emaLongPeriod: 200,
      rsiPeriod: 14,
      rsiPullbackLow: 42,
      rsiPullbackHigh: 55,
    },
    pullback: {
      ...BASE_DEFAULTS.pullback,
      emaPullbackProximityLow: 0.98,
      emaPullbackProximityHigh: 1.02,
    },
    volume: {
      ...BASE_DEFAULTS.volume,
      volumeBelowAverage: true,
    },
    volatility: {
      ...BASE_DEFAULTS.volatility,
      atrBelowAverage: true,
    },
    entry: {
      ...BASE_DEFAULTS.entry,
      entryTriggerType: 'CLOSE_ABOVE_PREV_HIGH',
    },
    risk: {
      ...BASE_DEFAULTS.risk,
      stopLossMethod: 'SWING_LOW',
      target1Method: 'PRIOR_SWING_HIGH',
      trailingStopMethod: 'EMA_CLOSE',
      trailingStopEmaPeriod: 20,
      partialExitPct: 50,
    },
  },
  S6_RS_BREAKOUT: {
    universe: {
      ...BASE_DEFAULTS.universe,
      indexMembership: 'NIFTY_500',
      circuitBandMinPct: 10,
    },
    trend: {
      ...BASE_DEFAULTS.trend,
      rsiPeriod: 14,
      rsiBreakoutLow: 60,
      rsiBreakoutHigh: 78,
    },
    impulse: {
      ...BASE_DEFAULTS.impulse,
      rsConsecutiveSessionsMin: 20,
      near52wHighPct: 95,
    },
    pullback: {
      ...BASE_DEFAULTS.pullback,
      consolidationRangeMaxPct: 12,
      consolidationRangeLookback: 20,
    },
    volume: {
      ...BASE_DEFAULTS.volume,
      volumeSurgeMultiplier: 2.0,
    },
    entry: {
      ...BASE_DEFAULTS.entry,
      entryTriggerType: 'N_DAY_HIGH_BREAK',
      breakoutLookbackBars: 20,
    },
    risk: {
      ...BASE_DEFAULTS.risk,
      stopLossMethod: 'SWING_LOW',
      target1Method: 'RR_MULTIPLE',
      target1RRMultiplier: 2.0,
      trailingStopMethod: 'EMA_CLOSE',
      trailingStopEmaPeriod: 20,
      partialExitPct: 50,
    },
  },
  S7_RSI_MEAN_REVERSION: {
    trend: {
      ...BASE_DEFAULTS.trend,
      priceAboveSma200: true,
      sma200SlopeRising: true,
      rsiPeriod: 14,
      rsiOversoldThreshold: 32,
    },
    pullback: {
      ...BASE_DEFAULTS.pullback,
      bbPeriod: 20,
      bbStdDev: 2.0,
    },
    volatility: {
      ...BASE_DEFAULTS.volatility,
      capitulationAtrMultiplier: 1.5,
    },
    entry: {
      ...BASE_DEFAULTS.entry,
      entryTriggerType: 'REVERSAL_CANDLE',
      reversalCandleRequired: true,
    },
    risk: {
      ...BASE_DEFAULTS.risk,
      stopLossMethod: 'SWING_LOW',
      target1Method: 'MEAN_REVERSION_SMA',
      meanReversionMaxDays: 7,
    },
  },
  S8_HIGH_TIGHT_FLAG: {
    universe: {
      ...BASE_DEFAULTS.universe,
      promoterHoldingMinPct: 65,
      publicFloatMaxShares: 50,
      adrMinPct: 5,
    },
    impulse: {
      ...BASE_DEFAULTS.impulse,
      flagPoleGainMinPct: 50,
      flagPoleLookbackBars: 20,
    },
    pullback: {
      ...BASE_DEFAULTS.pullback,
      consolidationRangeMaxPct: 15,
      consolidationRangeLookback: 10,
    },
    volume: {
      ...BASE_DEFAULTS.volume,
      volumeSurgeMultiplier: 1.5,
    },
    entry: {
      ...BASE_DEFAULTS.entry,
      entryTriggerType: 'N_DAY_HIGH_BREAK',
      breakoutLookbackBars: 5,
      flagEmaSupport: 10,
    },
    risk: {
      ...BASE_DEFAULTS.risk,
      stopLossMethod: 'SWING_LOW',
      target1Method: 'RR_MULTIPLE',
      target1RRMultiplier: 2.0,
      trailingStopMethod: 'EMA_CLOSE',
      trailingStopEmaPeriod: 10,
      partialExitPct: 50,
    },
  },
  S9_VOLUME_DRYUP_RS: {
    universe: {
      ...BASE_DEFAULTS.universe,
      freeFloatMaxPct: 25,
      adrMinPct: 5,
    },
    trend: {
      ...BASE_DEFAULTS.trend,
      priceAboveSma50: true,
    },
    impulse: {
      ...BASE_DEFAULTS.impulse,
      rsOutperformanceMinPct: 15,
    },
    volume: {
      ...BASE_DEFAULTS.volume,
      volumeDryUpThreshold: 0.40,
      volumeSurgeMultiplier: 2.0,
    },
    entry: {
      ...BASE_DEFAULTS.entry,
      entryTriggerType: 'CLOSE_ABOVE_PREV_HIGH',
    },
    risk: {
      ...BASE_DEFAULTS.risk,
      stopLossMethod: 'SWING_LOW',
      target1Method: 'RR_MULTIPLE',
      target1RRMultiplier: 2.0,
      partialExitPct: 50,
    },
  },
  S10_TRENDLINE_ORB: {
    universe: {
      ...BASE_DEFAULTS.universe,
      adtvFloorCr: 15,
      adrMinPct: 5,
    },
    trend: {
      ...BASE_DEFAULTS.trend,
      priceAboveSma200: true,
    },
    pullback: {
      ...BASE_DEFAULTS.pullback,
      lowerHighsMinCount: 3,
      trendlineCompressionBars: 15,
    },
    volume: {
      ...BASE_DEFAULTS.volume,
      rvolIntradayMin: 3.0,
    },
    volatility: {
      ...BASE_DEFAULTS.volatility,
      atrTrailingStopMultiplier: 2.0,
    },
    entry: {
      ...BASE_DEFAULTS.entry,
      entryTriggerType: 'ORB_15MIN',
      orbEnabled: true,
      orbTimeframeMinutes: 15,
    },
    risk: {
      ...BASE_DEFAULTS.risk,
      stopLossMethod: 'ORB_CANDLE_LOW',
      stopLossPct: 1.0,
      target1Method: 'PRIOR_SWING_HIGH',
      trailingStopMethod: 'ATR_TRAIL',
    },
  },
};

// ─── Strategy Metadata ──────────────────────────────────────────────────────

export interface StrategyMeta {
  id: StrategyId;
  name: string;
  shortName: string;
  category: StrategyCategory;
  description: string;
  families: ParameterFamily[];
}

export const STRATEGY_CATALOG: StrategyMeta[] = [
  { id: 'S1_VPA_BASE_BREAKOUT', name: 'VPA Base Breakout', shortName: 'S1', category: 'BREAKOUT', description: 'NR candle + EMA alignment + RSI confirmation at base of impulse move', families: ['trend', 'impulse', 'pullback', 'volume', 'volatility', 'entry', 'risk', 'filters'] },
  { id: 'S2_INSTITUTIONAL_FVG_CE', name: 'Institutional FVG/CE', shortName: 'S2', category: 'PULLBACK', description: 'Fair Value Gap with Consequent Encroachment entry after institutional impulse', families: ['impulse', 'pullback', 'volume', 'volatility', 'entry', 'smartMoney', 'risk', 'filters'] },
  { id: 'S3_HH_HL_COMPACTION', name: 'HH/HL Compaction', shortName: 'S3', category: 'BREAKOUT', description: 'Higher-Highs / Higher-Lows with range compaction at L2 level', families: ['trend', 'impulse', 'pullback', 'volume', 'entry', 'smartMoney', 'risk', 'filters'] },
  { id: 'S4_HH_HL_SMA200_VPA', name: 'HH/HL + SMA200 + VPA', shortName: 'S4', category: 'BREAKOUT', description: 'HH/HL compaction with SMA200 proximity and volume-price contraction', families: ['trend', 'impulse', 'pullback', 'volume', 'volatility', 'entry', 'smartMoney', 'risk', 'filters'] },
  { id: 'S5_50EMA_PULLBACK_VCP', name: '50 EMA Pullback VCP', shortName: 'S5', category: 'PULLBACK', description: 'Volatility Contraction Pattern at 50-EMA with drying volume', families: ['universe', 'trend', 'pullback', 'volume', 'volatility', 'entry', 'risk'] },
  { id: 'S6_RS_BREAKOUT', name: 'RS Breakout (Nifty 500)', shortName: 'S6', category: 'BREAKOUT', description: 'Relative Strength breakout from tight base near 52-week highs', families: ['universe', 'trend', 'impulse', 'pullback', 'volume', 'entry', 'risk'] },
  { id: 'S7_RSI_MEAN_REVERSION', name: 'RSI Mean-Reversion Dip', shortName: 'S7', category: 'MEAN_REVERSION', description: 'Oversold RSI with reversal candle in a rising 200-SMA context', families: ['trend', 'pullback', 'volatility', 'entry', 'risk'] },
  { id: 'S8_HIGH_TIGHT_FLAG', name: 'High-Tight Flag', shortName: 'S8', category: 'MOMENTUM', description: '50%+ pole gain followed by tight flag consolidation', families: ['universe', 'impulse', 'pullback', 'volume', 'entry', 'risk'] },
  { id: 'S9_VOLUME_DRYUP_RS', name: 'Volume Dry-Up RS', shortName: 'S9', category: 'MOMENTUM', description: 'Volume dry-up in relative strength leader with surge breakout', families: ['universe', 'trend', 'impulse', 'volume', 'entry', 'risk'] },
  { id: 'S10_TRENDLINE_ORB', name: 'Trendline ORB', shortName: 'S10', category: 'INTRADAY_HYBRID', description: 'Declining trendline break confirmed by Opening Range Breakout', families: ['universe', 'trend', 'pullback', 'volume', 'volatility', 'entry', 'risk'] },
];

// ─── Parameter Metadata for UI ──────────────────────────────────────────────

export interface ParameterMeta {
  key: string;
  family: ParameterFamily;
  type: 'number' | 'boolean' | 'enum';
  label: string;
  description: string;
  unit?: string;
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  enumValues?: string[];
  usedBy: StrategyId[];
}

export const PARAM_METADATA: ParameterMeta[] = [
  // Universe
  { key: 'universe.marketCapFloorCr', family: 'universe', type: 'number', label: 'Market Cap Floor', description: 'Minimum market capitalization', unit: 'Cr', default: 0, min: 0, max: 100000, step: 100, usedBy: ['S5_50EMA_PULLBACK_VCP'] },
  { key: 'universe.adtvFloorCr', family: 'universe', type: 'number', label: 'ADTV Floor', description: '20-day avg daily traded value minimum', unit: 'Cr', default: 0, min: 0, max: 500, step: 1, usedBy: ['S5_50EMA_PULLBACK_VCP', 'S10_TRENDLINE_ORB'] },
  { key: 'universe.closePriceFloor', family: 'universe', type: 'number', label: 'Close Price Floor', description: 'Minimum close price', unit: 'INR', default: 0, min: 0, max: 1000, step: 5, usedBy: ['S5_50EMA_PULLBACK_VCP'] },
  { key: 'universe.indexMembership', family: 'universe', type: 'enum', label: 'Index Membership', description: 'Restrict to index members', default: 'ANY', enumValues: ['ANY', 'NIFTY_50', 'NIFTY_500', 'NIFTY_NEXT_50'], usedBy: ['S6_RS_BREAKOUT'] },
  { key: 'universe.adrMinPct', family: 'universe', type: 'number', label: 'Min ADR %', description: '20-day Average Daily Range minimum', unit: '%', default: 0, min: 0, max: 20, step: 0.5, usedBy: ['S8_HIGH_TIGHT_FLAG', 'S9_VOLUME_DRYUP_RS', 'S10_TRENDLINE_ORB'] },
  { key: 'universe.promoterHoldingMinPct', family: 'universe', type: 'number', label: 'Promoter Holding Min', description: 'Minimum promoter holding %', unit: '%', default: 0, min: 0, max: 100, step: 1, usedBy: ['S8_HIGH_TIGHT_FLAG'] },
  { key: 'universe.freeFloatMaxPct', family: 'universe', type: 'number', label: 'Free Float Max', description: 'Maximum free float %', unit: '%', default: 100, min: 1, max: 100, step: 1, usedBy: ['S9_VOLUME_DRYUP_RS'] },

  // Trend
  { key: 'trend.emaShortPeriod', family: 'trend', type: 'number', label: 'EMA Short Period', description: 'Short-term EMA period', unit: 'bars', default: 9, min: 3, max: 100, step: 1, usedBy: ['S1_VPA_BASE_BREAKOUT', 'S5_50EMA_PULLBACK_VCP'] },
  { key: 'trend.emaLongPeriod', family: 'trend', type: 'number', label: 'EMA Long Period', description: 'Long-term EMA/SMA period', unit: 'bars', default: 21, min: 5, max: 200, step: 1, usedBy: ['S1_VPA_BASE_BREAKOUT', 'S5_50EMA_PULLBACK_VCP'] },
  { key: 'trend.priceAboveSma200', family: 'trend', type: 'boolean', label: 'Price > SMA200', description: 'Close must be above 200-day SMA', default: false, usedBy: ['S5_50EMA_PULLBACK_VCP', 'S7_RSI_MEAN_REVERSION', 'S10_TRENDLINE_ORB'] },
  { key: 'trend.rsiPeriod', family: 'trend', type: 'number', label: 'RSI Period', description: 'RSI calculation period', unit: 'bars', default: 14, min: 5, max: 30, step: 1, usedBy: ['S1_VPA_BASE_BREAKOUT', 'S5_50EMA_PULLBACK_VCP', 'S6_RS_BREAKOUT', 'S7_RSI_MEAN_REVERSION'] },
  { key: 'trend.rsiBullishFloor', family: 'trend', type: 'number', label: 'RSI Bullish Floor', description: 'Min RSI for bullish territory', default: 50, min: 20, max: 80, step: 1, usedBy: ['S1_VPA_BASE_BREAKOUT'] },
  { key: 'trend.rsiOversoldThreshold', family: 'trend', type: 'number', label: 'RSI Oversold', description: 'RSI threshold for oversold signal', default: 32, min: 10, max: 45, step: 1, usedBy: ['S7_RSI_MEAN_REVERSION'] },
  { key: 'trend.sma200TolerancePct', family: 'trend', type: 'number', label: 'SMA200 Tolerance', description: 'P0 within ±X% of SMA 200', unit: '%', default: 2.0, min: 0.5, max: 10, step: 0.5, usedBy: ['S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA'] },

  // Impulse
  { key: 'impulse.impulseGainMinPct', family: 'impulse', type: 'number', label: 'Impulse Gain Min', description: 'Minimum % gain for impulse qualification', unit: '%', default: 15, min: 5, max: 100, step: 1, usedBy: ['S1_VPA_BASE_BREAKOUT', 'S2_INSTITUTIONAL_FVG_CE', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA', 'S8_HIGH_TIGHT_FLAG'] },
  { key: 'impulse.impulseDurationMinBars', family: 'impulse', type: 'number', label: 'Impulse Duration Min', description: 'Minimum impulse leg duration', unit: 'bars', default: 4, min: 2, max: 50, step: 1, usedBy: ['S1_VPA_BASE_BREAKOUT', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA'] },
  { key: 'impulse.cumulativeTurnoverFloorCr', family: 'impulse', type: 'number', label: 'Turnover Floor', description: 'Cumulative turnover alternative threshold', unit: 'Cr', default: 50, min: 5, max: 500, step: 5, usedBy: ['S2_INSTITUTIONAL_FVG_CE', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA'] },
  { key: 'impulse.flagPoleGainMinPct', family: 'impulse', type: 'number', label: 'Flag Pole Gain Min', description: 'High-Tight Flag min gain over N bars', unit: '%', default: 50, min: 20, max: 200, step: 5, usedBy: ['S8_HIGH_TIGHT_FLAG'] },
  { key: 'impulse.near52wHighPct', family: 'impulse', type: 'number', label: 'Near 52W High %', description: 'Close proximity to 52-week high', unit: '%', default: 95, min: 80, max: 100, step: 1, usedBy: ['S6_RS_BREAKOUT'] },

  // Pullback
  { key: 'pullback.baseDurationMinBars', family: 'pullback', type: 'number', label: 'Base Duration Min', description: 'Minimum base/consolidation duration', unit: 'bars', default: 10, min: 3, max: 60, step: 1, usedBy: ['S1_VPA_BASE_BREAKOUT'] },
  { key: 'pullback.baseDurationMaxBars', family: 'pullback', type: 'number', label: 'Base Duration Max', description: 'Maximum base/consolidation duration', unit: 'bars', default: 30, min: 5, max: 120, step: 1, usedBy: ['S1_VPA_BASE_BREAKOUT'] },
  { key: 'pullback.entryZoneLowerBand', family: 'pullback', type: 'number', label: 'Entry Zone Lower', description: 'CMP >= L2 * X for entry zone', unit: 'ratio', default: 0.985, min: 0.95, max: 1.00, step: 0.005, usedBy: ['S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA'] },
  { key: 'pullback.entryZoneUpperBand', family: 'pullback', type: 'number', label: 'Entry Zone Upper', description: 'CMP <= L2 * X for entry zone', unit: 'ratio', default: 1.045, min: 1.00, max: 1.10, step: 0.005, usedBy: ['S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA'] },
  { key: 'pullback.consolidationRangeMaxPct', family: 'pullback', type: 'number', label: 'Consolidation Range Max', description: 'Max peak-to-trough % in N days', unit: '%', default: 12, min: 3, max: 25, step: 1, usedBy: ['S6_RS_BREAKOUT', 'S8_HIGH_TIGHT_FLAG'] },
  { key: 'pullback.bbPeriod', family: 'pullback', type: 'number', label: 'Bollinger Band Period', description: 'BB calculation period', unit: 'bars', default: 20, min: 10, max: 50, step: 1, usedBy: ['S7_RSI_MEAN_REVERSION'] },

  // Volume
  { key: 'volume.volumeDryingRatio', family: 'volume', type: 'number', label: 'Volume Drying Ratio', description: 'Base vol / impulse vol must be <= X', unit: 'ratio', default: 0.80, min: 0.20, max: 1.00, step: 0.05, usedBy: ['S1_VPA_BASE_BREAKOUT', 'S2_INSTITUTIONAL_FVG_CE', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA'] },
  { key: 'volume.vpaAsymmetryRatioMin', family: 'volume', type: 'number', label: 'VPA Asymmetry Ratio', description: 'Up-day vol / down-day vol >= X', unit: 'ratio', default: 1.15, min: 1.00, max: 2.00, step: 0.05, usedBy: ['S1_VPA_BASE_BREAKOUT'] },
  { key: 'volume.volumeSurgeMultiplier', family: 'volume', type: 'number', label: 'Volume Surge Multiplier', description: 'Breakout volume >= X * SMA(Volume)', unit: 'ratio', default: 2.0, min: 1.2, max: 5.0, step: 0.1, usedBy: ['S6_RS_BREAKOUT', 'S8_HIGH_TIGHT_FLAG', 'S9_VOLUME_DRYUP_RS'] },
  { key: 'volume.volumeDryUpThreshold', family: 'volume', type: 'number', label: 'Volume Dry-Up', description: 'Volume < X * SMA(Volume)', unit: 'ratio', default: 0.40, min: 0.10, max: 0.80, step: 0.05, usedBy: ['S9_VOLUME_DRYUP_RS'] },

  // Volatility
  { key: 'volatility.atrContractionRatioMax', family: 'volatility', type: 'number', label: 'ATR Contraction Ratio', description: 'ATR short / ATR long must be <= X', unit: 'ratio', default: 0.85, min: 0.30, max: 1.00, step: 0.05, usedBy: ['S1_VPA_BASE_BREAKOUT'] },
  { key: 'volatility.capitulationAtrMultiplier', family: 'volatility', type: 'number', label: 'Capitulation ATR Mult', description: '(High-Low) > X * ATR(14) for capitulation', unit: 'ratio', default: 1.5, min: 1.0, max: 3.0, step: 0.1, usedBy: ['S7_RSI_MEAN_REVERSION'] },
  { key: 'volatility.atrTrailingStopMultiplier', family: 'volatility', type: 'number', label: 'ATR Trailing Stop', description: 'Trailing stop = X * ATR', unit: 'ratio', default: 2.0, min: 1.0, max: 4.0, step: 0.5, usedBy: ['S10_TRENDLINE_ORB'] },

  // Entry
  { key: 'entry.entryTriggerType', family: 'entry', type: 'enum', label: 'Entry Trigger', description: 'How entry signal fires', default: 'VPA_BASE_BREAKOUT', enumValues: ['CLOSE_ABOVE_PREV_HIGH', 'N_DAY_HIGH_BREAK', 'FVG_CE_REENTRY', 'L2_COMPACTION_ZONE', 'VPA_BASE_BREAKOUT', 'ORB_15MIN', 'REVERSAL_CANDLE'], usedBy: ['S1_VPA_BASE_BREAKOUT', 'S2_INSTITUTIONAL_FVG_CE', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA', 'S5_50EMA_PULLBACK_VCP', 'S6_RS_BREAKOUT', 'S7_RSI_MEAN_REVERSION', 'S8_HIGH_TIGHT_FLAG', 'S9_VOLUME_DRYUP_RS', 'S10_TRENDLINE_ORB'] },
  { key: 'entry.breakoutLookbackBars', family: 'entry', type: 'number', label: 'Breakout Lookback', description: 'N-day high break lookback', unit: 'bars', default: 20, min: 3, max: 60, step: 1, usedBy: ['S6_RS_BREAKOUT', 'S8_HIGH_TIGHT_FLAG'] },
  { key: 'entry.fvgDetectionEnabled', family: 'entry', type: 'boolean', label: 'FVG Detection', description: 'Scan for Fair Value Gaps', default: false, usedBy: ['S2_INSTITUTIONAL_FVG_CE'] },
  { key: 'entry.orbEnabled', family: 'entry', type: 'boolean', label: 'ORB Enabled', description: 'Opening Range Breakout (intraday)', default: false, usedBy: ['S10_TRENDLINE_ORB'] },

  // SmartMoney
  { key: 'smartMoney.smartMoneyEnabled', family: 'smartMoney', type: 'boolean', label: 'Smart Money Detect', description: 'Enable institutional footprint detection', default: false, usedBy: ['S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA'] },
  { key: 'smartMoney.institutionalTurnoverFloorCr', family: 'smartMoney', type: 'number', label: 'Inst. Turnover Floor', description: 'Single-day turnover threshold', unit: 'Cr', default: 2.0, min: 0.5, max: 50, step: 0.5, usedBy: ['S2_INSTITUTIONAL_FVG_CE', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA'] },
  { key: 'smartMoney.smartMoneyVolRatio', family: 'smartMoney', type: 'number', label: 'Smart Money Vol Ratio', description: 'Volume / avg volume for smart money flag', unit: 'ratio', default: 1.3, min: 1.0, max: 3.0, step: 0.1, usedBy: ['S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA'] },

  // Risk
  { key: 'risk.stopLossMethod', family: 'risk', type: 'enum', label: 'Stop Loss Method', description: 'How stop loss is calculated', default: 'FIXED_PCT_BELOW_P0', enumValues: ['FIXED_PCT_BELOW_P0', 'FIXED_PCT_BELOW_L2', 'FVG_BOTTOM_OFFSET', 'SWING_LOW', 'FIXED_PCT_BELOW_ENTRY', 'ORB_CANDLE_LOW'], usedBy: ['S1_VPA_BASE_BREAKOUT', 'S2_INSTITUTIONAL_FVG_CE', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA', 'S5_50EMA_PULLBACK_VCP', 'S6_RS_BREAKOUT', 'S7_RSI_MEAN_REVERSION', 'S8_HIGH_TIGHT_FLAG', 'S9_VOLUME_DRYUP_RS', 'S10_TRENDLINE_ORB'] },
  { key: 'risk.stopLossPct', family: 'risk', type: 'number', label: 'Stop Loss %', description: 'Fixed % below reference point', unit: '%', default: 2.0, min: 0.5, max: 10, step: 0.5, usedBy: ['S1_VPA_BASE_BREAKOUT', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA', 'S10_TRENDLINE_ORB'] },
  { key: 'risk.target1RRMultiplier', family: 'risk', type: 'number', label: 'Target 1 R:R', description: 'Target 1 = CMP + risk * X', unit: 'ratio', default: 2.0, min: 1.0, max: 5.0, step: 0.5, usedBy: ['S1_VPA_BASE_BREAKOUT', 'S6_RS_BREAKOUT', 'S8_HIGH_TIGHT_FLAG', 'S9_VOLUME_DRYUP_RS'] },
  { key: 'risk.target2RRMultiplier', family: 'risk', type: 'number', label: 'Target 2 R:R', description: 'Target 2 = CMP + risk * X', unit: 'ratio', default: 3.5, min: 1.5, max: 10.0, step: 0.5, usedBy: ['S1_VPA_BASE_BREAKOUT'] },
  { key: 'risk.trailingStopMethod', family: 'risk', type: 'enum', label: 'Trailing Stop', description: 'Trailing stop method', default: 'NONE', enumValues: ['EMA_CLOSE', 'ATR_TRAIL', 'NONE'], usedBy: ['S5_50EMA_PULLBACK_VCP', 'S6_RS_BREAKOUT', 'S8_HIGH_TIGHT_FLAG', 'S10_TRENDLINE_ORB'] },
  { key: 'risk.partialExitPct', family: 'risk', type: 'number', label: 'Partial Exit %', description: '% of position to exit at T1', unit: '%', default: 50, min: 25, max: 75, step: 5, usedBy: ['S5_50EMA_PULLBACK_VCP', 'S6_RS_BREAKOUT', 'S8_HIGH_TIGHT_FLAG', 'S9_VOLUME_DRYUP_RS'] },
  { key: 'risk.maxPortfolioRiskPct', family: 'risk', type: 'number', label: 'Max Portfolio Risk', description: 'Max % of portfolio risked per trade', unit: '%', default: 1.0, min: 0.25, max: 5.0, step: 0.25, usedBy: ['S1_VPA_BASE_BREAKOUT', 'S2_INSTITUTIONAL_FVG_CE', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA', 'S5_50EMA_PULLBACK_VCP', 'S6_RS_BREAKOUT', 'S7_RSI_MEAN_REVERSION', 'S8_HIGH_TIGHT_FLAG', 'S9_VOLUME_DRYUP_RS', 'S10_TRENDLINE_ORB'] },

  // Filters
  { key: 'filters.filterPreceding52wLow', family: 'filters', type: 'boolean', label: '52-Week Low Filter', description: 'P0 must be at 52-week low with 20%+ impulse', default: false, usedBy: ['S1_VPA_BASE_BREAKOUT', 'S2_INSTITUTIONAL_FVG_CE', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA'] },
  { key: 'filters.preceding52wTolerancePct', family: 'filters', type: 'number', label: '52W Low Tolerance', description: 'Tolerance for 52-week low proximity', unit: '%', default: 2.5, min: 0.5, max: 10, step: 0.5, usedBy: ['S1_VPA_BASE_BREAKOUT', 'S2_INSTITUTIONAL_FVG_CE', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA'] },
  { key: 'filters.secondaryRuleMinCount', family: 'filters', type: 'number', label: 'Secondary Rule Min', description: 'Min secondary rules that must pass', default: 3, min: 1, max: 7, step: 1, usedBy: ['S1_VPA_BASE_BREAKOUT'] },
];

// ─── Utility Functions ──────────────────────────────────────────────────────

export function getDefaultsForStrategy(strategyId: StrategyId): StrategyParameterConfig {
  const overrides = STRATEGY_DEFAULTS[strategyId] || {};
  return mergeWithDefaults(overrides);
}

export function mergeWithDefaults(partial: Partial<StrategyParameterConfig>): StrategyParameterConfig {
  return {
    universe: { ...BASE_DEFAULTS.universe, ...partial.universe },
    trend: { ...BASE_DEFAULTS.trend, ...partial.trend },
    impulse: { ...BASE_DEFAULTS.impulse, ...partial.impulse },
    pullback: { ...BASE_DEFAULTS.pullback, ...partial.pullback },
    volume: { ...BASE_DEFAULTS.volume, ...partial.volume },
    volatility: { ...BASE_DEFAULTS.volatility, ...partial.volatility },
    entry: { ...BASE_DEFAULTS.entry, ...partial.entry },
    smartMoney: { ...BASE_DEFAULTS.smartMoney, ...partial.smartMoney },
    risk: { ...BASE_DEFAULTS.risk, ...partial.risk },
    filters: { ...BASE_DEFAULTS.filters, ...partial.filters },
  };
}

export function getParamMetadataForStrategy(strategyId: StrategyId): ParameterMeta[] {
  return PARAM_METADATA.filter(p => p.usedBy.includes(strategyId));
}

export function getParamMetadataByFamily(family: ParameterFamily): ParameterMeta[] {
  return PARAM_METADATA.filter(p => p.family === family);
}

export function getParamValue(config: StrategyParameterConfig, path: string): any {
  const parts = path.split('.');
  let obj: any = config;
  for (const p of parts) {
    if (obj == null) return undefined;
    obj = obj[p];
  }
  return obj;
}

export function setParamValue(config: StrategyParameterConfig, path: string, value: any): StrategyParameterConfig {
  const result = JSON.parse(JSON.stringify(config));
  const parts = path.split('.');
  let obj: any = result;
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
  return result;
}

export const FAMILY_LABELS: Record<ParameterFamily, string> = {
  universe: 'Universe & Liquidity',
  trend: 'Trend Alignment',
  impulse: 'Impulse / Momentum',
  pullback: 'Pullback / Retracement',
  volume: 'Volume Signatures',
  volatility: 'Volatility Compression',
  entry: 'Entry Triggers',
  smartMoney: 'Smart Money Detection',
  risk: 'Risk Management',
  filters: 'Optional Filters',
};

// ─── Database Seeding (Phase 1: Data Layer) ──────────────────────────────────

export interface StrategyPresetRow {
  id: string;
  name: string;
  short_name: string;
  category: StrategyCategory;
  description: string;
  is_preset: number;
  preset_order: number;
  color_accent: string;
  parameters_json: string;
  base_template_id: string;
  is_active: number;
}

export async function seedBuiltInPresets(db: any): Promise<void> {
  // Import dynamically to avoid circular deps at module load time
  const { dbAll, dbRun } = await import('../database.js');

  const presets: StrategyPresetRow[] = STRATEGY_CATALOG.map((catalog, idx) => ({
    id: catalog.id,
    name: catalog.name,
    short_name: catalog.shortName,
    category: catalog.category,
    description: catalog.description,
    is_preset: 1,
    preset_order: idx + 1,
    color_accent: getColorForStrategy(catalog.id),
    parameters_json: JSON.stringify(getDefaultsForStrategy(catalog.id)),
    base_template_id: catalog.id,
    is_active: 1,
  }));

  // Check if presets already exist
  const existing = await dbAll(db, `SELECT COUNT(*) as cnt FROM CustomStrategies WHERE is_preset = 1`);
  if (existing && existing[0]?.cnt > 0) {
    console.log(`[StrategyPresetSeeding] Presets already seeded (${existing[0].cnt} found), skipping.`);
    return;
  }

  // Insert all presets as a batch
  for (const preset of presets) {
    try {
      await dbRun(
        db,
        `INSERT OR IGNORE INTO CustomStrategies
         (id, name, short_name, description, category, is_preset, preset_order, color_accent, parameters_json, base_template_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          preset.id,
          preset.name,
          preset.short_name,
          preset.description,
          preset.category,
          preset.is_preset,
          preset.preset_order,
          preset.color_accent,
          preset.parameters_json,
          preset.base_template_id,
          preset.is_active,
        ]
      );
    } catch (err: any) {
      console.warn(`[StrategyPresetSeeding] Failed to seed preset ${preset.id}:`, err.message);
    }
  }

  console.log(`[StrategyPresetSeeding] Seeded ${presets.length} built-in strategy presets`);
}

function getColorForStrategy(strategyId: StrategyId): string {
  const colorMap: Record<StrategyId, string> = {
    'S1_VPA_BASE_BREAKOUT': '#ef4444',      // Red
    'S2_INSTITUTIONAL_FVG_CE': '#f97316',   // Orange
    'S3_HH_HL_COMPACTION': '#eab308',       // Yellow
    'S4_HH_HL_SMA200_VPA': '#84cc16',       // Lime
    'S5_50EMA_PULLBACK_VCP': '#22c55e',     // Green
    'S6_RS_BREAKOUT': '#10b981',            // Emerald
    'S7_RSI_MEAN_REVERSION': '#06b6d4',     // Cyan
    'S8_HIGH_TIGHT_FLAG': '#0ea5e9',        // Sky
    'S9_VOLUME_DRYUP_RS': '#3b82f6',        // Blue
    'S10_TRENDLINE_ORB': '#8b5cf6',         // Violet
  };
  return colorMap[strategyId] || '#6b7280';
}
