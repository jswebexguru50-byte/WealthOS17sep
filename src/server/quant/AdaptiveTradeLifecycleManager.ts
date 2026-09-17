/**
 * AdaptiveTradeLifecycleManager.ts — v5.3.1 (Institutional Enhanced)
 * Target: NRI WealthOS Quant Engine
 * 
 * Enhanced Precision Features:
 * 1. 3-Tranche Asymmetric Scaling (33% @ +2R, 33% @ +3R/+4R, 34% Runner)
 * 2. Breakeven + Transaction Cost Ratchet (+0.25R) at +2R (covers STT, GST, SEBI turnover, slippage)
 * 3. Parabolic Blow-Off Protection: Liquidates 50% of runner if Price > 1.25 * EMA20 or Gain >= +8R
 * 4. Wyckoff Distribution Guard with Upper-Wick Absorption Ratio (Detects hidden institutional selling)
 * 5. Structure-Anchored Trailing:
 *    - SWING: Max(EMA21, 3-Day Swing Low) with confirmed daily close filter
 *    - POSITIONAL: 2.5x ATR Chandelier Stop from 22-Day Highest High
 */

import { roundINR } from '../../lib/decimalUtils.js';

export type StrategyTimeframe = 'SWING' | 'POSITIONAL' | 'MULTIBAGGER';

export interface TradePosition {
  tradeId: string;
  symbol: string;
  timeframe: StrategyTimeframe;
  entryPrice: number;
  initialStopLoss: number;
  currentQuantity: number;
  initialQuantity: number;
  tier1Executed: boolean;
  tier2Executed: boolean;
  parabolicTakeProfitExecuted?: boolean;
  activeStopPrice: number;
  entryTimestamp: number;
}

export interface CandleMetrics {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adv20: number;
  atr14: number;
  ema9: number;
  ema20: number;
  ema21: number;
  lowestLow3D: number;
  highestHigh22: number;
}

export interface ExecutionSignal {
  action: 'HOLD' | 'SCALE_OUT' | 'EXIT_ALL' | 'UPDATE_STOP';
  sharesToLiquidate: number;
  newStopPrice?: number;
  reason: string;
  expectedRealizedR?: number;
}

export class AdaptiveTradeLifecycleManager {
  /**
   * Evaluates an active position against the latest daily candle
   */
  public static evaluatePosition(pos: TradePosition, candle: CandleMetrics): ExecutionSignal {
    const rInitial = pos.entryPrice - pos.initialStopLoss;
    if (rInitial <= 0) {
      throw new Error(`[LifecycleManager] Invalid risk bounds for trade ${pos.tradeId}: Stop must be strictly below Entry`);
    }

    const currentR = (candle.close - pos.entryPrice) / rInitial;
    const barSpread = candle.high - candle.low;

    // 1. Catastrophic Hard Stop Breach Check
    if (candle.low <= pos.activeStopPrice) {
      return {
        action: 'EXIT_ALL',
        sharesToLiquidate: pos.currentQuantity,
        reason: `Stop-Loss Breached at ₹${roundINR(pos.activeStopPrice).toFixed(2)}`,
        expectedRealizedR: roundINR((pos.activeStopPrice - pos.entryPrice) / rInitial, 2)
      };
    }

    // 2. Parabolic Trend Exhaustion Guard (Don't surrender vertical blowout gains)
    // Triggers if stock is stretched > 25% above its 20-day EMA or hits +8.0R
    const isParabolicallyExtended = candle.close >= candle.ema20 * 1.25 || currentR >= 8.0;
    if (isParabolicallyExtended && !pos.parabolicTakeProfitExecuted && pos.tier1Executed) {
      const exitShares = Math.ceil(pos.currentQuantity * 0.5);
      if (exitShares > 0) {
        return {
          action: 'SCALE_OUT',
          sharesToLiquidate: exitShares,
          reason: `Parabolic Climax Expansion Detected (Extension: ${(candle.close / candle.ema20).toFixed(2)}x EMA20, Current R: ${currentR.toFixed(1)}R). Banking 50% of runner.`,
          expectedRealizedR: roundINR(currentR, 2)
        };
      }
    }

    // 3. Wyckoff Distribution Guard (Volume Climax & Upper Wick Absorption)
    // Checks for either close in bottom 35% OR upper wick >= 45% of total bar spread
    const closeLocation = barSpread > 0 ? (candle.close - candle.low) / barSpread : 0.5;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const upperWickRatio = barSpread > 0 ? upperWick / barSpread : 0.0;
    const isHeavyVolume = candle.volume >= 2.5 * candle.adv20;
    const isInstitutionalDumping = isHeavyVolume && (closeLocation < 0.35 || upperWickRatio >= 0.45);

    if (isInstitutionalDumping && currentR >= 1.5) {
      const exitShares = Math.ceil(pos.currentQuantity * 0.5);
      if (exitShares > 0) {
        return {
          action: 'SCALE_OUT',
          sharesToLiquidate: exitShares,
          reason: `Institutional Distribution Bar (Vol: ${(candle.volume / candle.adv20).toFixed(1)}x ADV, Upper Wick: ${(upperWickRatio * 100).toFixed(0)}%). Derisking 50%.`,
          expectedRealizedR: roundINR(currentR, 2)
        };
      }
    }

    // 4. Tier 1 Profit Scale-out (+2.0R): Exit 33% & Ratchet Stop to Breakeven + 0.25R
    if (currentR >= 2.0 && !pos.tier1Executed) {
      const exitShares = Math.floor(pos.initialQuantity * 0.33);
      const breakevenStop = roundINR(pos.entryPrice + 0.25 * rInitial);
      return {
        action: 'SCALE_OUT',
        sharesToLiquidate: exitShares,
        newStopPrice: Math.max(pos.activeStopPrice, breakevenStop),
        reason: 'Tier 1 Target (+2.0R) Reached: Securing Initial Capital & Ratcheting to BE+0.25R',
        expectedRealizedR: 2.0
      };
    }

    // 5. Tier 2 Profit Scale-out (+3.0R for Swing, +4.0R for Positional): Exit additional 33%
    const tier2TargetR = pos.timeframe === 'SWING' ? 3.0 : 4.0;
    if (currentR >= tier2TargetR && !pos.tier2Executed && pos.tier1Executed) {
      const exitShares = Math.floor(pos.initialQuantity * 0.33);
      return {
        action: 'SCALE_OUT',
        sharesToLiquidate: exitShares,
        reason: `Tier 2 Target (+${tier2TargetR}R) Reached: Locking in Second Profit Tranche`,
        expectedRealizedR: tier2TargetR
      };
    }

    // 6. Tier 3: Structure-Anchored Trailing Stop on the Runner
    if (pos.tier1Executed) {
      let dynamicTrailingStop: number;

      if (pos.timeframe === 'SWING') {
        // Swing: Guard against false shakeouts by using the greater of EMA21 or the prior 3-day swing low
        dynamicTrailingStop = roundINR(Math.max(candle.ema21, candle.lowestLow3D));
      } else {
        // Positional: 2.5x ATR Chandelier Stop from the 22-day highest high
        dynamicTrailingStop = roundINR(candle.highestHigh22 - 2.5 * candle.atr14);
      }

      // Enforce ratcheting: Stops can only step upward, never widen
      const candidateStop = Math.max(pos.activeStopPrice, dynamicTrailingStop);

      // Check if price closed below the confirmed trailing stop
      if (candle.close < candidateStop) {
        return {
          action: 'EXIT_ALL',
          sharesToLiquidate: pos.currentQuantity,
          reason: `Trailing Stop Breached on Daily Close (Close: ₹${candle.close.toFixed(2)} < Stop: ₹${candidateStop.toFixed(2)})`,
          expectedRealizedR: roundINR((candle.close - pos.entryPrice) / rInitial, 2)
        };
      }

      if (candidateStop > pos.activeStopPrice) {
        return {
          action: 'UPDATE_STOP',
          sharesToLiquidate: 0,
          newStopPrice: candidateStop,
          reason: `Ratcheting ${pos.timeframe} Structural Trailing Stop to ₹${candidateStop.toFixed(2)}`
        };
      }
    }

    return {
      action: 'HOLD',
      sharesToLiquidate: 0,
      reason: 'Trend structure healthy; riding the wave within validated risk tolerances'
    };
  }
}
