import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronDown, ChevronUp, Copy, AlertCircle, Loader2 } from 'lucide-react';
import { safeFetchJson } from '../lib/api.js';

// Types imported from backend config
interface ParameterMeta {
  key: string;
  family: string;
  type: 'number' | 'boolean' | 'enum';
  label: string;
  description: string;
  unit?: string;
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  enumValues?: string[];
  usedBy: string[];
}

interface StrategyMeta {
  id: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  families: string[];
}

interface NewStrategy {
  name: string;
  base_template_id: string;
  parameters_json: string;
  description: string;
}

interface Strategy {
  id: string;
  name: string;
  parameters_json: string;
}

const PARAM_METADATA: ParameterMeta[] = [
  { key: 's5a.priceFloor', family: 's5a', type: 'number', label: 'Price Floor', description: 'Remove stocks below this close', unit: 'INR', default: 50, min: 0, max: 1000, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.weeksInYear', family: 's5a', type: 'number', label: '52-Week Lookback', description: 'Weekly bars used for 52-week measures', default: 52, min: 52, max: 52, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.near52WeekHighMaxDiscountPct', family: 's5a', type: 'number', label: 'Maximum 52-Week High Discount', description: 'Maximum distance below 52-week high', unit: '%', default: 25, min: 0, max: 100, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.above52WeekLowMinPct', family: 's5a', type: 'number', label: 'Minimum Gain From 52-Week Low', description: 'Minimum price gain above 52-week low', unit: '%', default: 100, min: 0, max: 500, step: 5, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.dma200RisingBars', family: 's5a', type: 'number', label: '200 DMA Rising Window', description: 'Daily bars for the three-month rising test', default: 65, min: 1, max: 130, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.sma50Period', family: 's5a', type: 'number', label: '50 DMA Period', description: 'Daily moving average period', default: 50, min: 50, max: 50, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.sma200Period', family: 's5a', type: 'number', label: '200 DMA Period', description: 'Daily moving average period', default: 200, min: 200, max: 200, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.highRecurrenceMinWeeks', family: 's5a', type: 'number', label: '52-Week High Minimum Interval', description: 'Minimum weekly interval between 52-week-high events', default: 16, min: 1, max: 52, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.highRecurrenceMaxWeeks', family: 's5a', type: 'number', label: '52-Week High Maximum Interval', description: 'Maximum weekly interval between 52-week-high events', default: 26, min: 1, max: 52, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.minVcpCandles', family: 's5a', type: 'number', label: 'Minimum VCP Candles', description: 'Minimum candles in each VCP contraction', default: 3, min: 3, max: 3, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.maxVcpCandles', family: 's5a', type: 'number', label: 'Maximum VCP Candles', description: 'Maximum candles in each VCP contraction', default: 5, min: 5, max: 5, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.minVcpCount', family: 's5a', type: 'number', label: 'Minimum Daily VCP Count', description: 'Minimum number of daily contractions', default: 2, min: 2, max: 2, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.maxVcpCount', family: 's5a', type: 'number', label: 'Maximum Daily VCP Count', description: 'Maximum number of daily contractions', default: 3, min: 3, max: 3, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.secondVcpMinContractionPct', family: 's5a', type: 'number', label: 'Second VCP Minimum Contraction', description: 'Minimum contraction if only two VCPs are present', unit: '%', default: 70, min: 0, max: 100, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.supplyDryUpMaxRatio', family: 's5a', type: 'number', label: 'Maximum Supply Dry-Up Ratio', description: 'Final five daily base sessions average volume divided by 20-day VMA', unit: 'ratio', default: 0.85, min: 0, max: 1, step: 0.05, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.atrPeriod', family: 's5a', type: 'number', label: 'ATR Period', description: 'Daily ATR period for stop loss', default: 20, min: 20, max: 20, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.atrMultiple', family: 's5a', type: 'number', label: 'ATR Stop Multiple', description: 'Stop distance in ATR multiples', default: 2, min: 2, max: 2, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's5a.maxStopLossPct', family: 's5a', type: 'number', label: 'Maximum Stop Loss', description: 'Maximum stop-loss distance', unit: '%', default: 10, min: 0, max: 100, step: 1, usedBy: ['S5A_MINERVINI_WINNING_STOCKS'] },
  { key: 's4a.weeklyPivotBars', family: 's4a', type: 'number', label: 'Weekly Pivot Bars', description: 'Confirmed weekly pivot width', default: 5, min: 5, max: 5, step: 1, usedBy: ['S4A_GAP_RUNNING_STOCKS'] },
  { key: 's4a.priceFloor', family: 's4a', type: 'number', label: 'Price Floor', description: 'Remove penny stocks below this close', unit: 'INR', default: 50, min: 0, max: 1000, step: 1, usedBy: ['S4A_GAP_RUNNING_STOCKS'] },
  { key: 's4a.marketCapFloorCr', family: 's4a', type: 'number', label: 'Market Cap Floor', description: 'Large-cap / high market-cap midcap floor', unit: 'Cr', default: 20000, min: 0, max: 100000, step: 100, usedBy: ['S4A_GAP_RUNNING_STOCKS'] },
  { key: 's4a.movingAveragePeriod', family: 's4a', type: 'number', label: 'Market MA Period', description: 'SMA or EMA period for Nifty 500, Midcap and Smallcap', default: 20, min: 2, max: 100, step: 1, usedBy: ['S4A_GAP_RUNNING_STOCKS'] },
  { key: 's4a.gapUpMinPct', family: 's4a', type: 'number', label: 'Minimum Clean Daily Gap-Up', description: 'Daily open above immediately prior trading session close', unit: '%', default: 2, min: 0, max: 20, step: 0.25, usedBy: ['S4A_GAP_RUNNING_STOCKS'] },
  { key: 's4a.pullbackAtrMaxRatio', family: 's4a', type: 'number', label: 'Maximum Pullback ATR / ATR(14)', description: 'Average pullback true range divided by ATR(14)', unit: 'ratio', default: 0.50, min: 0, max: 1, step: 0.05, usedBy: ['S4A_GAP_RUNNING_STOCKS'] },
  { key: 's4a.supplyDryUpMaxRatio', family: 's4a', type: 'number', label: 'Maximum Supply Dry-Up Ratio', description: 'Final five base sessions average volume divided by 20-day VMA', unit: 'ratio', default: 0.85, min: 0, max: 1, step: 0.05, usedBy: ['S4A_GAP_RUNNING_STOCKS'] },
  { key: 's4a.stopBelowLowestLowPct', family: 's4a', type: 'number', label: 'Stop Below Lowest Daily Low', description: 'Stop loss below the lowest daily low', unit: '%', default: 1, min: 0, max: 10, step: 0.25, usedBy: ['S4A_GAP_RUNNING_STOCKS'] },
  { key: 's3a.smaPeriod', family: 's3a', type: 'number', label: 'SMA Period', description: 'Rising floor period', default: 50, min: 10, max: 250, step: 1, usedBy: ['S3A_HH_HL_ATR_COMPRESSION'] },
  { key: 's3a.smaRiseBars', family: 's3a', type: 'number', label: 'SMA Rise Bars', description: 'Slope comparison bars', default: 1, min: 1, max: 20, step: 1, usedBy: ['S3A_HH_HL_ATR_COMPRESSION'] },
  { key: 's3a.atrPeriod', family: 's3a', type: 'number', label: 'ATR Period', description: 'True-range averaging period', default: 14, min: 2, max: 50, step: 1, usedBy: ['S3A_HH_HL_ATR_COMPRESSION'] },
  { key: 's3a.pivotRadius', family: 's3a', type: 'number', label: 'Pivot Radius', description: 'Bars on each side of pivot', default: 2, min: 1, max: 5, step: 1, usedBy: ['S3A_HH_HL_ATR_COMPRESSION'] },
  { key: 's3a.structureLookbackBars', family: 's3a', type: 'number', label: 'Structure Lookback', description: 'Daily candles searched for four pivots', default: 60, min: 15, max: 200, step: 1, usedBy: ['S3A_HH_HL_ATR_COMPRESSION'] },
  { key: 's3a.precedingMoveLookbackBars', family: 's3a', type: 'number', label: 'Prior Move Sessions', description: 'Maximum trading sessions from P0 low to H1 high', default: 5, min: 1, max: 20, step: 1, usedBy: ['S3A_HH_HL_ATR_COMPRESSION'] },
  { key: 's3a.precedingMoveMinPct', family: 's3a', type: 'number', label: 'Minimum Prior Move', description: 'P0 low to H1 high', unit: '%', default: 20, min: 0, max: 100, step: 1, usedBy: ['S3A_HH_HL_ATR_COMPRESSION'] },
  { key: 's3a.atrCompressionMaxRatio', family: 's3a', type: 'number', label: 'ATR Compression Ratio', description: 'Second pullback ATR / first pullback ATR', default: 1, min: 0.1, max: 1.5, step: 0.05, usedBy: ['S3A_HH_HL_ATR_COMPRESSION'] },
  { key: 's3a.requireBullishPivotCandles', family: 's3a', type: 'boolean', label: 'S1a Bullish Pivot Candles', description: 'Require bullish pattern at all four pivots', default: true, usedBy: ['S3A_HH_HL_ATR_COMPRESSION'] },
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

const STRATEGY_CATALOG: StrategyMeta[] = [
  { id: 'S1_VPA_BASE_BREAKOUT', name: 'VPA Base Breakout', shortName: 'S1', category: 'BREAKOUT', description: 'NR candle + EMA alignment + RSI confirmation at base of impulse move', families: ['trend', 'impulse', 'pullback', 'volume', 'volatility', 'entry', 'risk', 'filters'] },
  { id: 'S2_INSTITUTIONAL_FVG_CE', name: 'Institutional FVG/CE', shortName: 'S2', category: 'PULLBACK', description: 'Fair Value Gap with Consequent Encroachment entry after institutional impulse', families: ['impulse', 'pullback', 'volume', 'volatility', 'entry', 'smartMoney', 'risk', 'filters'] },
  { id: 'S3_HH_HL_COMPACTION', name: 'HH/HL Compaction', shortName: 'S3', category: 'BREAKOUT', description: 'Higher-Highs / Higher-Lows with range compaction at L2 level', families: ['trend', 'impulse', 'pullback', 'volume', 'entry', 'smartMoney', 'risk', 'filters'] },
  { id: 'S3A_HH_HL_ATR_COMPRESSION', name: 'HH/HL ATR Compression', shortName: 'S3a', category: 'BREAKOUT', description: 'Strict HH/HL above rising SMA50, ATR compression, S1a bullish pivots, 20% impulse', families: ['s3a'] },
  { id: 'S4A_GAP_RUNNING_STOCKS', name: 'Gap Running Stocks', shortName: 'S4a', category: 'BREAKOUT', description: 'Weekly pivot-5, bullish broad market, gap-up, VPA pullback contraction and stated breakout entry', families: ['s4a'] },
  { id: 'S5A_MINERVINI_WINNING_STOCKS', name: 'Minervini Winning Stocks', shortName: 'S5a', category: 'BREAKOUT', description: 'Weekly 52-week strength and VCP qualification with daily breakout and ATR stop', families: ['s5a'] },
  { id: 'S4_HH_HL_SMA200_VPA', name: 'HH/HL + SMA200 + VPA', shortName: 'S4', category: 'BREAKOUT', description: 'HH/HL compaction with SMA200 proximity and volume-price contraction', families: ['trend', 'impulse', 'pullback', 'volume', 'volatility', 'entry', 'smartMoney', 'risk', 'filters'] },
  { id: 'S5_50EMA_PULLBACK_VCP', name: '50 EMA Pullback VCP', shortName: 'S5', category: 'PULLBACK', description: 'Volatility Contraction Pattern at 50-EMA with drying volume', families: ['universe', 'trend', 'pullback', 'volume', 'volatility', 'entry', 'risk'] },
  { id: 'S6_RS_BREAKOUT', name: 'RS Breakout (Nifty 500)', shortName: 'S6', category: 'BREAKOUT', description: 'Relative Strength breakout from tight base near 52-week highs', families: ['universe', 'trend', 'impulse', 'pullback', 'volume', 'entry', 'risk'] },
  { id: 'S7_RSI_MEAN_REVERSION', name: 'RSI Mean-Reversion Dip', shortName: 'S7', category: 'MEAN_REVERSION', description: 'Oversold RSI with reversal candle in a rising 200-SMA context', families: ['trend', 'pullback', 'volatility', 'entry', 'risk'] },
  { id: 'S8_HIGH_TIGHT_FLAG', name: 'High-Tight Flag', shortName: 'S8', category: 'MOMENTUM', description: '50%+ pole gain followed by tight flag consolidation', families: ['universe', 'impulse', 'pullback', 'volume', 'entry', 'risk'] },
  { id: 'S9_VOLUME_DRYUP_RS', name: 'Volume Dry-Up RS', shortName: 'S9', category: 'MOMENTUM', description: 'Volume dry-up in relative strength leader with surge breakout', families: ['universe', 'trend', 'impulse', 'volume', 'entry', 'risk'] },
  { id: 'S10_TRENDLINE_ORB', name: 'Trendline ORB', shortName: 'S10', category: 'INTRADAY_HYBRID', description: 'Declining trendline break confirmed by Opening Range Breakout', families: ['universe', 'trend', 'pullback', 'volume', 'volatility', 'entry', 'risk'] },
  { id: 'S11_INSTITUTIONAL_SPRING', name: 'Institutional Spring Accumulation', shortName: 'S11', category: 'SMART_MONEY', description: 'Wyckoff spring accumulation phase detection', families: ['trend', 'volume', 'smartMoney', 'entry', 'risk'] },
  { id: 'S12_EPISODIC_PIVOT', name: 'Episodic Pivot Gap-Up', shortName: 'S12', category: 'BREAKOUT', description: 'Gap up on high relative volume acting as a pivot', families: ['impulse', 'volume', 'entry', 'risk'] },
  { id: 'S13_EARNINGS_ACCEL', name: 'Earnings Acceleration Momentum', shortName: 'S13', category: 'FUNDAMENTAL', description: 'Momentum breakout backed by earnings acceleration', families: ['trend', 'volume', 'entry', 'risk'] },
  { id: 'S14_BEARISH_HEDGE', name: 'Bearish Short Futures Hedge', shortName: 'S14', category: 'HEDGE', description: 'Short futures hedge during bearish regimes', families: ['trend', 'volatility', 'entry', 'risk'] },
  { id: 'S15_CREDIT_SPREADS', name: 'Option Credit Spreads Harvest', shortName: 'S15', category: 'OPTIONS', description: 'Harvesting premium via credit spreads', families: ['trend', 'volatility', 'entry', 'risk'] },
  { id: 'S16_OPERATING_LEVERAGE', name: 'Operating Leverage Inflection', shortName: 'S16', category: 'FUNDAMENTAL', description: 'Margin expansion and operating leverage inflection', families: ['trend', 'entry', 'risk'] },
  { id: 'S17_PROMOTER_SAST', name: 'Promoter SAST Creeping Squeeze', shortName: 'S17', category: 'FUNDAMENTAL', description: 'Creeping acquisition by promoters under SAST', families: ['trend', 'volume', 'entry', 'risk'] },
  { id: 'S18_BLOCK_ACCUMULATION', name: 'Institutional Block Accumulation', shortName: 'S18', category: 'SMART_MONEY', description: 'Sustained institutional block deals', families: ['volume', 'smartMoney', 'entry', 'risk'] },
  { id: 'S19_DELIVERY_SPIKE', name: 'Delivery Volume Spike Threshold', shortName: 'S19', category: 'SMART_MONEY', description: 'Massive spikes in delivery volume percentage', families: ['volume', 'smartMoney', 'entry', 'risk'] },
  { id: 'NEOWAVE', name: 'Glenn Neely NEoWave Engine', shortName: 'NEOWAVE', category: 'STRUCTURAL', description: 'Deterministic NEoWave structural wave 3 kickoff', families: ['trend', 'volatility', 'entry', 'risk'] },
];

const FAMILY_LABELS: Record<string, string> = {
  s3a: 'S3a Structure & Confirmation',
  s4a: 'S4a Gap Running Stocks',
  s5a: 'S5a Minervini Winning Stocks',
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

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (strategy: NewStrategy) => Promise<void>;
  baseTemplate?: Strategy;
}

export function StrategyBuilderPanel({ isOpen, onClose, onSave, baseTemplate }: Props) {
  const [strategyName, setStrategyName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('S1_VPA_BASE_BREAKOUT');
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set(['universe', 'trend', 'impulse']));
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());

  // Initialize on mount or when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (baseTemplate) {
      setSelectedTemplate(baseTemplate.id);
      try {
        const parsed = JSON.parse(baseTemplate.parameters_json);
        setParameters(parsed);
      } catch {
        setParameters({});
      }
    } else {
      setSelectedTemplate('S1_VPA_BASE_BREAKOUT');
      initializeDefaultParameters();
    }

    // Fetch existing strategy names for duplicate detection
    fetchExistingNames();
  }, [isOpen]);

  const initializeDefaultParameters = () => {
    const defaults: Record<string, any> = {};
    PARAM_METADATA.forEach(pm => {
      defaults[pm.key] = pm.default;
    });
    setParameters(defaults);
  };

  const fetchExistingNames = async () => {
    const res = await safeFetchJson<{ strategies: any[] }>('/api/strategies/library');
    if (res.ok && res.data?.strategies) {
      const names = new Set(res.data.strategies.map((s: any) => s.name.toLowerCase()));
      setExistingNames(names);
    }
  };

  const selectedTemplateData = useMemo(() => {
    return STRATEGY_CATALOG.find(s => s.id === selectedTemplate);
  }, [selectedTemplate]);

  const relevantFamilies = useMemo(() => {
    return (selectedTemplateData?.families || []).sort();
  }, [selectedTemplateData]);

  const familyParameters = useMemo(() => {
    return PARAM_METADATA.filter(p => selectedTemplateData?.families.includes(p.family));
  }, [selectedTemplateData]);

  const toggleFamily = (family: string) => {
    const newExpanded = new Set(expandedFamilies);
    if (newExpanded.has(family)) {
      newExpanded.delete(family);
    } else {
      newExpanded.add(family);
    }
    setExpandedFamilies(newExpanded);
  };

  const handleParameterChange = (key: string, value: any) => {
    setParameters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const validateStrategy = (): boolean => {
    setValidationError('');

    const name = strategyName.trim();
    if (!name) {
      setValidationError('Strategy name is required');
      return false;
    }

    if (name.length < 3 || name.length > 50) {
      setValidationError('Strategy name must be 3-50 characters');
      return false;
    }

    if (!/^[a-zA-Z0-9\s]+$/.test(name)) {
      setValidationError('Strategy name can only contain letters, numbers, and spaces');
      return false;
    }

    if (existingNames.has(name.toLowerCase())) {
      setValidationError('A strategy with this name already exists');
      return false;
    }

    // Validate numeric ranges
    for (const param of familyParameters) {
      if (param.type === 'number') {
        const val = parameters[param.key];
        if (typeof val === 'number') {
          if (param.min !== undefined && val < param.min) {
            setValidationError(`${param.label} must be >= ${param.min}`);
            return false;
          }
          if (param.max !== undefined && val > param.max) {
            setValidationError(`${param.label} must be <= ${param.max}`);
            return false;
          }
        }
      }
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateStrategy()) return;

    setIsSaving(true);
    try {
      const strategy: NewStrategy = {
        name: strategyName.trim(),
        base_template_id: selectedTemplate,
        parameters_json: JSON.stringify(parameters),
        description: `Custom variant based on ${selectedTemplateData?.name || 'Unknown'}`
      };

      await onSave(strategy);
      setStrategyName('');
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    const name = strategyName.trim();
    if (!name) {
      setValidationError('Enter a name first to copy');
      return;
    }

    const newName = `${name} (copy)`;
    if (newName.length > 50) {
      setValidationError('Copied name would exceed 50 characters');
      return;
    }

    setStrategyName(newName);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
        />

        {/* Modal Panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden z-10 flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-800/60 flex-shrink-0">
            <h3 className="font-display font-bold text-slate-100 text-lg">Create New Strategy</h3>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content (scrollable) */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Strategy Name */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                  Strategy Name
                </label>
                <input
                  type="text"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  placeholder="e.g., My Custom VPA v2"
                  maxLength={50}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>

              {/* Base Template */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                  Base Template
                </label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500/50 transition-colors cursor-pointer"
                >
                  {STRATEGY_CATALOG.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.shortName}: {s.name}
                    </option>
                  ))}
                </select>
                {selectedTemplateData && (
                  <p className="text-xs text-slate-500 mt-2">{selectedTemplateData.description}</p>
                )}
              </div>

              {/* Validation Error */}
              {validationError && (
                <div className="flex items-start gap-2 p-3 bg-rose-950/50 border border-rose-900/50 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-200">{validationError}</p>
                </div>
              )}

              {/* Parameters Divider */}
              <div className="pt-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Parameters</p>
              </div>

              {/* Parameter Families */}
              <div className="space-y-3">
                {relevantFamilies.map(family => {
                  const familyParams = familyParameters.filter(p => p.family === family);
                  const isExpanded = expandedFamilies.has(family);

                  return (
                    <div key={family} className="border border-slate-800 rounded-lg overflow-hidden">
                      {/* Family Header */}
                      <button
                        onClick={() => toggleFamily(family)}
                        className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors bg-slate-850"
                      >
                        <span className="text-sm font-semibold text-slate-200">{FAMILY_LABELS[family] || family}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      {/* Family Parameters */}
                      {isExpanded && (
                        <div className="p-3 space-y-3 bg-slate-900/50">
                          {familyParams.map(param => (
                            <ParameterControl
                              key={param.key}
                              param={param}
                              value={parameters[param.key]}
                              onChange={(val) => handleParameterChange(param.key, val)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 p-5 bg-slate-950/40 border-t border-slate-800/60 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={isSaving || !strategyName.trim()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              title="Copy current strategy name"
            >
              <Copy className="w-4 h-4 inline mr-1" />
              Copy
            </button>
            <button
              type="button"
              disabled={isSaving || !strategyName.trim()}
              onClick={handleSave}
              className={`px-5 py-2 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md flex items-center gap-2 ${
                isSaving || !strategyName.trim()
                  ? 'bg-blue-950 text-blue-500/50 border border-blue-900/50 cursor-not-allowed opacity-50'
                  : 'bg-blue-500 hover:bg-blue-600 text-white border border-blue-600'
              }`}
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Strategy
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// Parameter Control Component
interface ParameterControlProps {
  key?: any;
  param: ParameterMeta;
  value: any;
  onChange: (value: any) => void;
}

function ParameterControl({ param, value, onChange }: ParameterControlProps) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  if (param.type === 'boolean') {
    return (
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 mt-1 rounded border-slate-700 bg-slate-800 cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <label className="text-xs font-semibold text-slate-300 block cursor-pointer">{param.label}</label>
          <p className="text-xs text-slate-500 mt-0.5">{param.description}</p>
        </div>
      </div>
    );
  }

  if (param.type === 'enum' && param.enumValues) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-300">{param.label}</label>
          {param.unit && <span className="text-xs text-slate-500">{param.unit}</span>}
        </div>
        <select
          value={value || param.default}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500/50"
        >
          {param.enumValues.map(ev => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">{param.description}</p>
      </div>
    );
  }

  if (param.type === 'number') {
    const numValue = typeof value === 'number' ? value : param.default;
    const min = param.min ?? 0;
    const max = param.max ?? 100;
    const step = param.step ?? 1;

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-300">{param.label}</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={numValue}
              onChange={(e) => onChange(parseFloat(e.target.value) || param.default)}
              className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500/50"
            />
            {param.unit && <span className="text-xs text-slate-500 min-w-fit">{param.unit}</span>}
          </div>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={numValue}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <p className="text-xs text-slate-500 mt-1">{param.description}</p>
      </div>
    );
  }

  return null;
}

export default StrategyBuilderPanel;
