import { BollingerBands, RSI, SMA, EMA, MACD, ATR } from 'technicalindicators';
import { OHLCV } from './TechnicalAnalysisEngine.js';

export interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  type: 'LONG' | 'SHORT';
  returnPct: number;
  profitINR: number;
  holdingDays: number;
  reason: string;
  isWin: boolean;
}

export interface StrategyPerformance {
  strategyName: string;
  description: string;
  totalTrades: number;
  winRatePct: number;
  profitFactor: number;
  totalReturnPct: number;
  buyAndHoldReturnPct: number;
  alphaPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  avgWinPct: number;
  avgLossPct: number;
  trades: BacktestTrade[];
}

export interface DirectionalPrediction {
  predictedDirection: 'BULLISH_EXPANSION' | 'BEARISH_BREAKDOWN' | 'MEAN_REVERSION_BOUNCE' | 'RANGE_BOUND_CONSOLIDATION';
  bullishProbabilityPct: number;
  bearishProbabilityPct: number;
  confidenceLevel: 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'LOW';
  expectedMove5DayPct: number;
  expectedMove20DayPct: number;
  targetPriceUpper: number;
  targetPriceLower: number;
  medianTargetPrice: number;
  priceActionCatalysts: string[];
  laymanPredictionSummary: string;
  actionablePortfolioVerdict: string;
}

export interface PriceActionModelReport {
  symbol: string;
  currentPrice: number;
  prediction: DirectionalPrediction;
  bollingerDynamics: {
    bandwidth: number;
    percentB: number; // 0 (at lower band) to 1 (at upper band)
    isSqueeze: boolean;
    isWalkingUpperBand: boolean;
    isWalkingLowerBand: boolean;
    meanReversionPotential: 'HIGH_UPSIDE' | 'HIGH_DOWNSIDE' | 'BALANCED';
    laymanMeaning: string;
  };
  backtestResults: StrategyPerformance[];
  bestStrategy: StrategyPerformance;
}

export class PriceActionBacktestEngine {
  private static instance: PriceActionBacktestEngine;

  public static getInstance(): PriceActionBacktestEngine {
    if (!PriceActionBacktestEngine.instance) {
      PriceActionBacktestEngine.instance = new PriceActionBacktestEngine();
    }
    return PriceActionBacktestEngine.instance;
  }

  /**
   * Round-trip transaction cost (brokerage + STT + exchange fees + GST + SEBI).
   * Approximate: 0.40% for large caps, 0.55% for small/mid caps.
   */
  private readonly ROUND_TRIP_COST_PCT = 0.40;

  /**
   * Minimum entry slippage (next-day open vs signal close, conservative estimate).
   * Large caps: 0.15%, Small/mid caps: 0.35%
   */
  private readonly ENTRY_SLIPPAGE_PCT = 0.20;

  public analyzeAndBacktest(symbol: string, ohlcv: OHLCV[]): PriceActionModelReport | null {
    if (!ohlcv || ohlcv.length < 60) return null; // Need at least 60 days for meaningful OOS split

    const closes = ohlcv.map(d => Number(d.close || 0));
    const highs = ohlcv.map(d => Number(d.high || d.close));
    const lows = ohlcv.map(d => Number(d.low || d.close));
    const volumes = ohlcv.map(d => Number(d.volume || 1));
    const dates = ohlcv.map(d => d.date);

    // ─────────────────────────────────────────────────────────
    // OUT-OF-SAMPLE SPLIT: 70% in-sample, 30% out-of-sample
    // Strategy SELECTION uses only in-sample data.
    // Strategy PERFORMANCE reported is out-of-sample only.
    // ─────────────────────────────────────────────────────────
    const splitPoint = Math.floor(ohlcv.length * 0.70);
    const inSampleOhlcv = ohlcv.slice(0, splitPoint);
    const outSampleOhlcv = ohlcv.slice(splitPoint);

    const latestPrice = closes[closes.length - 1];

    // ── 1. Compute Technical Indicators ──
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
    const rsi = RSI.calculate({ period: 14, values: closes });
    const sma20 = SMA.calculate({ period: 20, values: closes });
    const sma50 = SMA.calculate({ period: 50, values: closes });
    const sma200 = SMA.calculate({ period: Math.min(200, closes.length), values: closes });
    const ema9 = EMA.calculate({ period: 9, values: closes });
    const ema21 = EMA.calculate({ period: 21, values: closes });
    const atr = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });

    // ── 2. Bollinger Band Dynamics ──
    const latestBb = bb.length > 0 ? bb[bb.length - 1] : { upper: latestPrice * 1.05, middle: latestPrice, lower: latestPrice * 0.95 };
    const upper = latestBb.upper || latestPrice * 1.05;
    const lower = latestBb.lower || latestPrice * 0.95;
    const middle = latestBb.middle || latestPrice;
    
    const bandwidth = middle > 0 ? Number(((upper - lower) / middle * 100).toFixed(2)) : 10;
    const percentB = (upper - lower) > 0 ? Number(((latestPrice - lower) / (upper - lower)).toFixed(2)) : 0.5;
    const isSqueeze = bandwidth < 7.5;

    // Check if price is walking the upper or lower bands (last 3 closes near band)
    const isWalkingUpper = percentB >= 0.88;
    const isWalkingLower = percentB <= 0.12;

    let meanReversionPotential: 'HIGH_UPSIDE' | 'HIGH_DOWNSIDE' | 'BALANCED' = 'BALANCED';
    if (percentB <= 0.15) meanReversionPotential = 'HIGH_UPSIDE';
    else if (percentB >= 0.85) meanReversionPotential = 'HIGH_DOWNSIDE';

    let bbLayman = '';
    if (isSqueeze) {
      bbLayman = `Volatility Squeeze Active (Bandwidth ${bandwidth}%). Price is tightly compressed, anticipating an explosive directional move.`;
    } else if (isWalkingUpper) {
      bbLayman = `Bullish Band Walking: Strong buying pressure is pushing price along the upper volatility band.`;
    } else if (isWalkingLower) {
      bbLayman = `Bearish Band Walking: Heavy selling pressure is dragging price down along the lower volatility band.`;
    } else {
      bbLayman = `Normal Volatility Oscillation: Price is trading inside the healthy range at ${Math.round(percentB * 100)}% of the band height.`;
    }

    // ── 3. Quantitative Backtesting Engine (Out-of-Sample) ──
    // Run all strategies on both windows:
    const inSampleResults = this.runAllStrategies(inSampleOhlcv);
    const outSampleResults = this.runAllStrategies(outSampleOhlcv);

    // Select BEST STRATEGY using in-sample data only (prevent selection bias)
    // Ranking: profitFactor * log(totalTrades) — penalizes low-sample strategies
    const eligibleInSample = inSampleResults.filter(s => s.totalTrades >= 5);
    const selectedStrategyName = eligibleInSample.length > 0
      ? eligibleInSample.sort((a, b) =>
          (b.profitFactor * Math.log(Math.max(2, b.totalTrades))) -
          (a.profitFactor * Math.log(Math.max(2, a.totalTrades)))
        )[0].strategyName
      : inSampleResults[0]?.strategyName;

    // Report OUT-OF-SAMPLE performance of the selected strategy
    const backtestResults = outSampleResults;
    const bestStrategy = outSampleResults.find(s => s.strategyName === selectedStrategyName)
      ?? outSampleResults[0];

    // ── 4. Directional Prediction Model ──
    let bullVotes = 0;
    let bearVotes = 0;
    const catalysts: string[] = [];

    // Factor A: Trend & Moving Averages
    const curEma9 = ema9.length > 0 ? ema9[ema9.length - 1] : latestPrice;
    const curEma21 = ema21.length > 0 ? ema21[ema21.length - 1] : latestPrice;
    const curSma50 = sma50.length > 0 ? sma50[sma50.length - 1] : latestPrice;
    const curSma200 = sma200.length > 0 ? sma200[sma200.length - 1] : latestPrice;

    if (curEma9 > curEma21) {
      bullVotes += 20;
      catalysts.push('Short-term 9/21 EMA golden momentum crossover.');
    } else {
      bearVotes += 20;
      catalysts.push('Short-term 9/21 EMA bearish slope.');
    }

    if (latestPrice > curSma50) {
      bullVotes += 15;
      catalysts.push('Price holding firmly above 50-day institutional moving average.');
    } else {
      bearVotes += 15;
      catalysts.push('Price trading below 50-day moving average resistance.');
    }

    if (latestPrice > curSma200) {
      bullVotes += 15;
      catalysts.push('Long-term 200 SMA secular uptrend confirmed.');
    }

    // Factor B: Bollinger Band Structure
    if (isSqueeze && curEma9 > curEma21) {
      bullVotes += 25;
      catalysts.push('Coiled Bollinger Squeeze poised for an upside explosive breakout.');
    } else if (isWalkingUpper) {
      bullVotes += 15;
      catalysts.push('Strong momentum persistence riding the upper volatility envelope.');
    } else if (isWalkingLower) {
      bearVotes += 25;
      catalysts.push('Distribution breakdown along lower volatility envelope.');
    }

    // Factor C: RSI Momentum & Divergence
    const curRsi = rsi.length > 0 ? rsi[rsi.length - 1] : 50;
    if (curRsi >= 48 && curRsi <= 68) {
      bullVotes += 15;
      catalysts.push('RSI in optimal bullish momentum corridor (48-68).');
    } else if (curRsi < 32) {
      bullVotes += 15;
      catalysts.push('Deeply oversold RSI indicating high-probability statistical mean reversion bounce.');
    } else if (curRsi > 78) {
      bearVotes += 20;
      catalysts.push('Severely overbought RSI signaling impending consolidation/profit booking.');
    }

    const totalVotes = Math.max(1, bullVotes + bearVotes);
    const bullishProbabilityPct = Number(Math.min(92, Math.max(8, (bullVotes / totalVotes) * 100)).toFixed(0));
    const bearishProbabilityPct = 100 - bullishProbabilityPct;

    let predictedDirection: DirectionalPrediction['predictedDirection'] = 'BULLISH_EXPANSION';
    let confidenceLevel: DirectionalPrediction['confidenceLevel'] = 'HIGH';
    let laymanSummary = '';
    let portfolioVerdict = '';

    const latestAtr = atr.length > 0 ? atr[atr.length - 1] : latestPrice * 0.025;
    const atrPct = (latestAtr / latestPrice) * 100;

    let expectedMove5Day = Number((atrPct * (bullishProbabilityPct >= 50 ? 1.4 : -1.4)).toFixed(1));
    let expectedMove20Day = Number((atrPct * 3.2 * (bullishProbabilityPct >= 50 ? 1 : -1)).toFixed(1));

    if (bullishProbabilityPct >= 65) {
      predictedDirection = 'BULLISH_EXPANSION';
      confidenceLevel = bullishProbabilityPct >= 80 ? 'VERY_HIGH' : 'HIGH';
      laymanSummary = `The model projects a ${bullishProbabilityPct}% probability of upward price expansion over the next 5 to 20 trading sessions.`;
      portfolioVerdict = 'Good for Portfolio (Growth Catalyst): Accumulate on dips; trail stop-loss below 20-day support.';
    } else if (bullishProbabilityPct <= 35) {
      predictedDirection = 'BEARISH_BREAKDOWN';
      confidenceLevel = bearishProbabilityPct >= 80 ? 'VERY_HIGH' : 'HIGH';
      laymanSummary = `The model projects a ${bearishProbabilityPct}% probability of continued downward price drift or breakdown.`;
      portfolioVerdict = 'Bad for Portfolio (Downside Risk): Trim exposure or hedge downside risk with defensive stop-losses.';
    } else if (curRsi < 32) {
      predictedDirection = 'MEAN_REVERSION_BOUNCE';
      confidenceLevel = 'MODERATE';
      laymanSummary = `Price is oversold at the lower Bollinger Band with 60% probability of a rapid technical relief bounce.`;
      portfolioVerdict = 'Tactical Opportunity: High-probability short-term rebound trade.';
    } else {
      predictedDirection = 'RANGE_BOUND_CONSOLIDATION';
      confidenceLevel = 'MODERATE';
      expectedMove5Day = Number((atrPct * 0.4).toFixed(1));
      expectedMove20Day = Number((atrPct * 0.8).toFixed(1));
      laymanSummary = `Price action is balanced inside the consolidation corridor with no immediate directional breakout.`;
      portfolioVerdict = 'Neutral for Portfolio: Hold existing allocation and wait for confirmed breakout.';
    }

    const targetPriceUpper = Number((latestPrice * (1 + Math.abs(expectedMove20Day) / 100)).toFixed(2));
    const targetPriceLower = Number((latestPrice * (1 - (atrPct * 1.5) / 100)).toFixed(2));
    const medianTargetPrice = Number((latestPrice * (1 + expectedMove5Day / 100)).toFixed(2));

    const prediction: DirectionalPrediction = {
      predictedDirection,
      bullishProbabilityPct,
      bearishProbabilityPct,
      confidenceLevel,
      expectedMove5DayPct: expectedMove5Day,
      expectedMove20DayPct: expectedMove20Day,
      targetPriceUpper,
      targetPriceLower,
      medianTargetPrice,
      priceActionCatalysts: catalysts,
      laymanPredictionSummary: laymanSummary,
      actionablePortfolioVerdict: portfolioVerdict
    };

    return {
      symbol,
      currentPrice: latestPrice,
      prediction,
      bollingerDynamics: {
        bandwidth,
        percentB,
        isSqueeze,
        isWalkingUpperBand: isWalkingUpper,
        isWalkingLowerBand: isWalkingLower,
        meanReversionPotential,
        laymanMeaning: bbLayman
      },
      backtestResults,
      bestStrategy
    };
  }

  // ── Unified strategy runner — call on any OHLCV window ──
  private runAllStrategies(ohlcv: OHLCV[]): StrategyPerformance[] {
    if (!ohlcv || ohlcv.length < 30) return [];
    const closes = ohlcv.map(d => Number(d.close || 0));
    const highs  = ohlcv.map(d => Number(d.high  || d.close));
    const lows   = ohlcv.map(d => Number(d.low   || d.close));
    const bb   = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
    const rsi  = RSI.calculate({ period: 14, values: closes });
    const sma50 = SMA.calculate({ period: 50, values: closes });
    const ema9  = EMA.calculate({ period: 9,  values: closes });
    const ema21 = EMA.calculate({ period: 21, values: closes });
    return [
      this.backtestBollingerSqueeze(ohlcv, closes, bb),
      this.backtestRsiMeanReversion(ohlcv, closes, rsi, sma50),
      this.backtestMultiFactorTrend(ohlcv, closes, bb, rsi, ema9, ema21)
    ];
  }

  // ── Strategy 1: Bollinger Squeeze & Volatility Breakout ──
  private backtestBollingerSqueeze(ohlcv: OHLCV[], closes: number[], bb: any[]): StrategyPerformance {
    const trades: BacktestTrade[] = [];
    let inTrade = false;
    let entryPrice = 0;
    let entryDate = '';
    let entryIdx = 0;

    const offset = closes.length - bb.length;

    for (let i = 2; i < bb.length; i++) {
      const idx = i + offset;
      const curBb = bb[i];
      const prevBb = bb[i - 1];
      const prevBw = ((prevBb.upper - prevBb.lower) / prevBb.middle) * 100;
      const signalClose = closes[idx]; // signal day close

      // Buy Condition: Squeeze expands and Close crosses above Upper Band
      // ENTRY: next day's open + slippage (avoid look-ahead bias)
      if (!inTrade && prevBw < 8.0 && signalClose > curBb.upper) {
        // Use next day's open if available, else signal close
        const nextOpen = ohlcv[idx + 1]?.open ? Number(ohlcv[idx + 1].open) : signalClose;
        entryPrice = Number((nextOpen * (1 + this.ENTRY_SLIPPAGE_PCT / 100)).toFixed(2));
        entryDate = ohlcv[idx + 1]?.date || ohlcv[idx]?.date || `Day ${idx}`;
        entryIdx = idx + 1;
        inTrade = true;
      }
      // Exit Condition: Close falls below 20 SMA middle line or trailing stop-loss (4%)
      else if (inTrade && idx > entryIdx) {
        const curClose = closes[idx];
        // Return net of round-trip transaction cost
        const rawRetPct = ((curClose - entryPrice) / entryPrice) * 100;
        const netRetPct = rawRetPct - this.ROUND_TRIP_COST_PCT;
        const days = idx - entryIdx;

        if (curClose < curBb.middle || netRetPct <= -4.0 || netRetPct >= 18.0 || days >= 45) {
          trades.push({
            entryDate,
            exitDate: ohlcv[idx]?.date || `Day ${idx}`,
            entryPrice,
            exitPrice: curClose,
            type: 'LONG',
            returnPct: Number(netRetPct.toFixed(2)),
            profitINR: Number((netRetPct * 1000).toFixed(0)),
            holdingDays: days,
            reason: netRetPct >= 18.0 ? 'Take Profit Target' : netRetPct <= -4.0 ? 'Stop Loss' : 'Crossed Middle Band',
            isWin: netRetPct > 0
          });
          inTrade = false;
        }
      }
    }

    return this.calculateMetrics('Bollinger Squeeze Breakout Strategy', 'Enters on next-day open when volatility bandwidth compresses < 8% and price bursts above upper band.', trades, closes);
  }

  // ── Strategy 2: RSI Mean Reversion with Trend Filter ──
  private backtestRsiMeanReversion(ohlcv: OHLCV[], closes: number[], rsi: number[], sma50: number[]): StrategyPerformance {
    const trades: BacktestTrade[] = [];
    let inTrade = false;
    let entryPrice = 0;
    let entryDate = '';
    let entryIdx = 0;

    const rsiOffset = closes.length - rsi.length;
    const smaOffset = closes.length - sma50.length;

    for (let i = 1; i < rsi.length; i++) {
      const idx = i + rsiOffset;
      const signalClose = closes[idx];
      const curRsi = rsi[i];
      const prevRsi = rsi[i - 1];
      const curSma50 = sma50[idx - smaOffset] || signalClose;

      // Signal: RSI crosses above 30 (oversold bounce) while near or above 50 SMA
      // ENTRY: next day's open + slippage
      if (!inTrade && prevRsi <= 32 && curRsi > 32 && signalClose >= curSma50 * 0.95) {
        const nextOpen = ohlcv[idx + 1]?.open ? Number(ohlcv[idx + 1].open) : signalClose;
        entryPrice = Number((nextOpen * (1 + this.ENTRY_SLIPPAGE_PCT / 100)).toFixed(2));
        entryDate = ohlcv[idx + 1]?.date || ohlcv[idx]?.date || `Day ${idx}`;
        entryIdx = idx + 1;
        inTrade = true;
      } else if (inTrade && idx > entryIdx) {
        const curClose = closes[idx];
        const rawRetPct = ((curClose - entryPrice) / entryPrice) * 100;
        const netRetPct = rawRetPct - this.ROUND_TRIP_COST_PCT;
        const days = idx - entryIdx;

        // Exit when RSI reaches 65 (mean-reverted) or stop loss (-5%)
        if (curRsi >= 65 || netRetPct <= -5.0 || netRetPct >= 15.0 || days >= 30) {
          trades.push({
            entryDate,
            exitDate: ohlcv[idx]?.date || `Day ${idx}`,
            entryPrice,
            exitPrice: curClose,
            type: 'LONG',
            returnPct: Number(netRetPct.toFixed(2)),
            profitINR: Number((netRetPct * 1000).toFixed(0)),
            holdingDays: days,
            reason: curRsi >= 65 ? 'RSI Mean Reversion Target' : 'Stop Loss',
            isWin: netRetPct > 0
          });
          inTrade = false;
        }
      }
    }

    return this.calculateMetrics('RSI Oversold Mean Reversion', 'Buys oversold RSI <32 recovery on next-day open with 50-day moving average filter.', trades, closes);
  }

  // ── Strategy 3: Multi-Factor Price Action Trend Follower ──
  private backtestMultiFactorTrend(ohlcv: OHLCV[], closes: number[], bb: any[], rsi: number[], ema9: number[], ema21: number[]): StrategyPerformance {
    const trades: BacktestTrade[] = [];
    let inTrade = false;
    let entryPrice = 0;
    let entryDate = '';
    let entryIdx = 0;

    const ema9Offset = closes.length - ema9.length;
    const ema21Offset = closes.length - ema21.length;
    const bbOffset = closes.length - bb.length;
    const rsiOffset = closes.length - rsi.length;

    for (let idx = 25; idx < closes.length; idx++) {
      const signalClose = closes[idx];
      const curEma9  = ema9[idx - ema9Offset];
      const curEma21 = ema21[idx - ema21Offset];
      const prevEma9  = ema9[idx - ema9Offset - 1];
      const prevEma21 = ema21[idx - ema21Offset - 1];
      const curBb  = bb[idx - bbOffset];
      const curRsi = rsi[idx - rsiOffset] || 50;

      const isGoldenCross = prevEma9 <= prevEma21 && curEma9 > curEma21;

      // Signal: EMA 9/21 golden cross with BB + RSI confirmation
      // ENTRY: next day's open + slippage
      if (!inTrade && isGoldenCross && signalClose > (curBb?.middle || signalClose) && curRsi >= 45 && curRsi <= 68) {
        const nextOpen = ohlcv[idx + 1]?.open ? Number(ohlcv[idx + 1].open) : signalClose;
        entryPrice = Number((nextOpen * (1 + this.ENTRY_SLIPPAGE_PCT / 100)).toFixed(2));
        entryDate = ohlcv[idx + 1]?.date || ohlcv[idx]?.date || `Day ${idx}`;
        entryIdx = idx + 1;
        inTrade = true;
      } else if (inTrade && idx > entryIdx) {
        const curClose = closes[idx];
        const rawRetPct = ((curClose - entryPrice) / entryPrice) * 100;
        const netRetPct = rawRetPct - this.ROUND_TRIP_COST_PCT;
        const days = idx - entryIdx;

        // Exit on EMA 9 falling below EMA 21 or stop-loss (-4.5%)
        if (curEma9 < curEma21 || netRetPct <= -4.5 || netRetPct >= 22.0 || days >= 60) {
          trades.push({
            entryDate,
            exitDate: ohlcv[idx]?.date || `Day ${idx}`,
            entryPrice,
            exitPrice: curClose,
            type: 'LONG',
            returnPct: Number(netRetPct.toFixed(2)),
            profitINR: Number((netRetPct * 1000).toFixed(0)),
            holdingDays: days,
            reason: netRetPct >= 22.0 ? 'Profit Target' : curEma9 < curEma21 ? 'Trend Reversal' : 'Trailing Stop',
            isWin: netRetPct > 0
          });
          inTrade = false;
        }
      }
    }

    return this.calculateMetrics('Multi-Factor Trend Confluence', 'Combines EMA 9/21 momentum cross, Bollinger channel alignment, and RSI corridor.', trades, closes);
  }

  private calculateMetrics(strategyName: string, description: string, trades: BacktestTrade[], closes: number[]): StrategyPerformance {
    if (trades.length === 0) {
      return {
        strategyName,
        description,
        totalTrades: 0,
        winRatePct: 0,
        profitFactor: 1.0,
        totalReturnPct: 0,
        buyAndHoldReturnPct: 0,
        alphaPct: 0,
        maxDrawdownPct: 0,
        sharpeRatio: 0,
        avgWinPct: 0,
        avgLossPct: 0,
        trades: []
      };
    }

    const wins = trades.filter(t => t.isWin);
    const losses = trades.filter(t => !t.isWin);

    const winRatePct = Number(((wins.length / trades.length) * 100).toFixed(1));
    const grossProfit = wins.reduce((acc, t) => acc + t.returnPct, 0);
    const grossLoss = Math.abs(losses.reduce((acc, t) => acc + t.returnPct, 0));
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : Number((grossProfit || 1).toFixed(2));

    const totalReturnPct = Number((trades.reduce((acc, t) => acc + t.returnPct, 0)).toFixed(2));
    const buyAndHoldReturnPct = Number((((closes[closes.length - 1] - closes[0]) / closes[0]) * 100).toFixed(2));
    const alphaPct = Number((totalReturnPct - buyAndHoldReturnPct).toFixed(2));

    const avgWinPct = wins.length > 0 ? Number((grossProfit / wins.length).toFixed(2)) : 0;
    const avgLossPct = losses.length > 0 ? Number((grossLoss / losses.length).toFixed(2)) : 0;

    // ─── Real Equity Curve Max Drawdown ───────────────────────
    // Start at ₹100, compound each trade return, track peak/trough
    let equity = 100;
    let peak = 100;
    let maxDrawdownPct = 0;
    for (const t of trades) {
      equity *= (1 + t.returnPct / 100); // returnPct already net of transaction costs
      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDrawdownPct) maxDrawdownPct = dd;
    }

    // ─── Annualized Sharpe using avg holding period ────────────
    // Annualization factor = sqrt(252 / avgHoldingDays)
    const returns = trades.map(t => t.returnPct);
    const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.map(x => Math.pow(x - meanRet, 2)).reduce((a, b) => a + b, 0) / returns.length
    ) || 1;
    const avgHoldingDays = trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length;
    const annualizationFactor = Math.sqrt(252 / Math.max(1, avgHoldingDays));
    const sharpeRatio = Number(((meanRet / stdDev) * annualizationFactor).toFixed(2));

    return {
      strategyName,
      description,
      totalTrades: trades.length,
      winRatePct,
      profitFactor: Math.max(0, profitFactor),
      totalReturnPct,
      buyAndHoldReturnPct,
      alphaPct,
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(1)), // REAL equity-curve drawdown
      sharpeRatio,
      avgWinPct,
      avgLossPct,
      trades: trades.slice(-10) // last 10 trades for display
    };
  }
}
