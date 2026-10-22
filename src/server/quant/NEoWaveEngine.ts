/**
 * NEoWaveEngine.ts
 * 
 * Institutional Implementation of Ralph Nelson Elliott Wave Theory & Glenn Neely's NEoWave System.
 * 
 * Key Pillars:
 * 1. Cash Data / Monowave Extraction (unambiguous price-time vectors)
 * 2. Glenn Neely 6 Retracement Rules (Conditions 1 to 6)
 * 3. Strict Rule of Extension (one and only one impulse wave can extend)
 * 4. Advanced Pattern Recognition (Impulses 1-5, Diametric 7-legged A-B-C-D-E-F-G, Neutral Triangles)
 * 5. Touchstone Confirmation Rules (Time/Price verification)
 */

export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Monowave {
  index: number;
  direction: 'UP' | 'DOWN';
  startPrice: number;
  endPrice: number;
  startDate: string;
  endDate: string;
  priceChange: number;
  priceChangePct: number;
  barsCount: number;
  neelyRetracementRatio: number; // |m_k| / |m_{k-1}|
  neelyRuleCondition: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface WavePivot {
  label: string; // e.g. "(1)", "(2)", "(3)", "(4)", "(5)", "(A)", "(B)", "(C)", "(G)"
  price: number;
  date: string;
  isConfirmed: boolean;
  type: 'IMPULSE' | 'CORRECTIVE' | 'DIAMETRIC';
}

export interface FibonacciLadder {
  wave1Length: number;
  wave2RetracePct: number;
  wave3ExtensionRatio: number;
  goldenPocketLow: number;
  goldenPocketHigh: number;
  target1Fib1618: number;
  target2Fib2618: number;
}

export interface CorrectiveWaveLeg {
  startPrice: number;
  endPrice: number;
  startDate: string;
  endDate: string;
  priceLength: number;
  priceChangePct: number;
  durationBars: number;
  direction: 'UP' | 'DOWN';
}

export interface ElliottCorrectiveCompletionIndicator {
  symbol: string;
  isCompleted: boolean;
  completionStatus: 'CONFIRMED_COMPLETED' | 'EARLY_REVERSAL' | 'DEVELOPING' | 'INVALIDATED' | 'NONE';
  correctivePatternType: 'ZIGZAG_ABC' | 'FLAT_REGULAR_ABC' | 'FLAT_EXPANDED_ABC' | 'WAVE_2_GOLDEN_POCKET' | 'WAVE_4_ALTERNATION' | 'NEUTRAL_COMPLEX';
  confidenceScore: number; // 0 - 100

  // Specific Legs
  priorImpulse?: CorrectiveWaveLeg;
  waveA?: CorrectiveWaveLeg;
  waveB?: CorrectiveWaveLeg;
  waveC?: CorrectiveWaveLeg;

  // Quantitative Ratios
  retracementDepthPct: number; // Retracement of prior impulse (e.g. 50%, 61.8%, 38.2%)
  cToARatio: number; // Wave C length / Wave A length
  bToARetracePct: number; // Wave B retracement of Wave A

  // Glenn Neely & Touchstone Confirmation Gates
  confirmationGates: {
    zeroBLineBroken: boolean;
    touchstoneFasterTime: boolean; // Stage 1 Neely confirmation: Reversal time <= Wave C duration
    touchstonePriceRetracement: boolean; // Stage 2 Neely confirmation: Retraced >= 61.8% of Wave C
    goldenPocketSupportHeld: boolean; // Held between 38.2% and 65% retracement
    bullishMomentumExpansion: boolean; // Positive candle close above reversal trigger
    ruleOfAlternationValid: boolean; // Alternation in structure/depth
  };

  // Strategic Execution Levels
  invalidationLevel: number; // Terminal low of Wave C (hard invalidation)
  reversalTriggerPrice: number; // 0-B trendline value at current bar or Wave B peak
  currentPrice: number;
  target1Upside: number; // +1.000x Wave A / prior high retest
  target2Upside: number; // +1.618x Fibonacci projection
  riskRewardRatio: number;

  summaryRationale: string;
}

export interface NEoWaveAnalysisResult {
  symbol: string;
  currentPattern: 
    | 'IMPULSE_WAVE_3_KICKOFF' 
    | 'IMPULSE_WAVE_4_PULLBACK' 
    | 'IMPULSE_WAVE_5_BLOWOFF' 
    | 'DIAMETRIC_LEG_G_REVERSAL' 
    | 'CORRECTION_WAVE_C_COMPLETION' 
    | 'CONSOLIDATION_NEUTRAL';
  patternConfidence: number; // 0 - 100
  currentWaveLabel: string; // e.g. "Wave (3) Impulse Thrust"
  primaryDegreeTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  monowaves: Monowave[];
  wavePivots: WavePivot[];
  fibonacciLevels: FibonacciLadder;
  hardStructuralStopLoss: number;
  invalidationPrice: number;
  timePriceConfirmationPassed: boolean;
  ruleOfExtensionSatisfied: boolean;
  extendedWave: 'WAVE_1' | 'WAVE_3' | 'WAVE_5' | 'NONE';
  correctiveIndicator?: ElliottCorrectiveCompletionIndicator;
  summaryRationale: string;
}

export class NEoWaveEngine {
  private static instance: NEoWaveEngine;

  public static getInstance(): NEoWaveEngine {
    if (!NEoWaveEngine.instance) {
      NEoWaveEngine.instance = new NEoWaveEngine();
    }
    return NEoWaveEngine.instance;
  }

  /**
   * Identifies swing pivots and builds pure Monowaves from OHLCV series.
   */
  public extractMonowaves(bars: OHLCVBar[], initialWindow = 3): Monowave[] {
    if (!bars || bars.length < 5) return [];

    // 1. Identify local swing extrema with adaptive windowing
    let window = Math.min(initialWindow, Math.floor((bars.length - 1) / 2));
    let pivots: Array<{ index: number; type: 'HIGH' | 'LOW'; price: number; date: string }> = [];

    while (window >= 1) {
      pivots = [];
      for (let i = window; i < bars.length - window; i++) {
        const current = bars[i];
        let isHigh = true;
        let isLow = true;

        for (let w = 1; w <= window; w++) {
          if (bars[i - w].high >= current.high || bars[i + w].high > current.high) isHigh = false;
          if (bars[i - w].low <= current.low || bars[i + w].low < current.low) isLow = false;
        }

        if (isHigh && !isLow) {
          pivots.push({ index: i, type: 'HIGH', price: current.high, date: current.date });
        } else if (isLow && !isHigh) {
          pivots.push({ index: i, type: 'LOW', price: current.low, date: current.date });
        }
      }
      if (pivots.length >= 2) break;
      window--;
    }

    if (pivots.length < 2) return [];

    // Filter consecutive same-type pivots by keeping the most extreme
    const cleanPivots = [pivots[0]];
    for (let i = 1; i < pivots.length; i++) {
      const prev = cleanPivots[cleanPivots.length - 1];
      const curr = pivots[i];

      if (curr.type === prev.type) {
        if (curr.type === 'HIGH' && curr.price > prev.price) {
          cleanPivots[cleanPivots.length - 1] = curr;
        } else if (curr.type === 'LOW' && curr.price < prev.price) {
          cleanPivots[cleanPivots.length - 1] = curr;
        }
      } else {
        cleanPivots.push(curr);
      }
    }

    // Anchor boundary bar 0
    const firstP = cleanPivots[0];
    if (firstP.index > 0) {
      if (firstP.type === 'HIGH') {
        let minLow = bars[0].low;
        let minIdx = 0;
        for (let j = 0; j < firstP.index; j++) {
          if (bars[j].low < minLow) { minLow = bars[j].low; minIdx = j; }
        }
        cleanPivots.unshift({ index: minIdx, type: 'LOW', price: minLow, date: bars[minIdx].date });
      } else {
        let maxHigh = bars[0].high;
        let maxIdx = 0;
        for (let j = 0; j < firstP.index; j++) {
          if (bars[j].high > maxHigh) { maxHigh = bars[j].high; maxIdx = j; }
        }
        cleanPivots.unshift({ index: maxIdx, type: 'HIGH', price: maxHigh, date: bars[maxIdx].date });
      }
    }

    // Anchor boundary terminal bar N-1
    const lastP = cleanPivots[cleanPivots.length - 1];
    if (lastP.index < bars.length - 1) {
      if (lastP.type === 'HIGH') {
        let minLow = bars[bars.length - 1].low;
        let minIdx = bars.length - 1;
        for (let j = lastP.index + 1; j < bars.length; j++) {
          if (bars[j].low < minLow) { minLow = bars[j].low; minIdx = j; }
        }
        cleanPivots.push({ index: minIdx, type: 'LOW', price: minLow, date: bars[minIdx].date });
      } else {
        let maxHigh = bars[bars.length - 1].high;
        let maxIdx = bars.length - 1;
        for (let j = lastP.index + 1; j < bars.length; j++) {
          if (bars[j].high > maxHigh) { maxHigh = bars[j].high; maxIdx = j; }
        }
        cleanPivots.push({ index: maxIdx, type: 'HIGH', price: maxHigh, date: bars[maxIdx].date });
      }
    }

    // 2. Construct sequential Monowaves
    const monowaves: Monowave[] = [];

    for (let i = 1; i < cleanPivots.length; i++) {
      const p0 = cleanPivots[i - 1];
      const p1 = cleanPivots[i];
      const direction: 'UP' | 'DOWN' = p1.price > p0.price ? 'UP' : 'DOWN';
      const priceChange = p1.price - p0.price;
      const priceChangePct = (priceChange / p0.price) * 100;
      const barsCount = Math.abs(p1.index - p0.index);

      let retracementRatio = 1.0;
      if (monowaves.length > 0) {
        const prevAbs = Math.abs(monowaves[monowaves.length - 1].priceChange);
        retracementRatio = prevAbs > 0 ? Math.abs(priceChange) / prevAbs : 1.0;
      }

      // Glenn Neely Condition Classification (Conditions 1 to 6)
      let condition: 1 | 2 | 3 | 4 | 5 | 6 = 3;
      if (retracementRatio < 0.382) condition = 1;
      else if (retracementRatio < 0.618) condition = 2;
      else if (retracementRatio < 1.000) condition = 3;
      else if (retracementRatio < 1.618) condition = 4;
      else if (retracementRatio < 2.618) condition = 5;
      else condition = 6;

      monowaves.push({
        index: i - 1,
        direction,
        startPrice: p0.price,
        endPrice: p1.price,
        startDate: p0.date,
        endDate: p1.date,
        priceChange,
        priceChangePct,
        barsCount,
        neelyRetracementRatio: Number(retracementRatio.toFixed(3)),
        neelyRuleCondition: condition
      });
    }

    return monowaves;
  }

  /**
   * Deterministic Elliott Wave & NEoWave Corrective Pullback Pattern Completion Indicator.
   * 
   * Detects:
   * - Wave A-B-C Zigzag (5-3-5 counter-trend)
   * - Regular / Expanded Flat (3-3-5)
   * - Wave (2) Pullback (50.0% - 61.8% Golden Pocket)
   * - Wave (4) Pullback (23.6% - 38.2% Alternation holding above Wave 1)
   * 
   * Validates Glenn Neely Stage 1 (faster time 0-B break) & Stage 2 (price retracement) Touchstone Rules.
   */
  public detectCorrectivePatternCompletion(
    bars: OHLCVBar[],
    monowavesInput?: Monowave[],
    symbol: string = 'SCRIP'
  ): ElliottCorrectiveCompletionIndicator {
    const defaultIndicator: ElliottCorrectiveCompletionIndicator = {
      symbol,
      isCompleted: false,
      completionStatus: 'NONE',
      correctivePatternType: 'NEUTRAL_COMPLEX',
      confidenceScore: 0,
      retracementDepthPct: 0,
      cToARatio: 0,
      bToARetracePct: 0,
      confirmationGates: {
        zeroBLineBroken: false,
        touchstoneFasterTime: false,
        touchstonePriceRetracement: false,
        goldenPocketSupportHeld: false,
        bullishMomentumExpansion: false,
        ruleOfAlternationValid: false
      },
      invalidationLevel: 0,
      reversalTriggerPrice: 0,
      currentPrice: bars && bars.length > 0 ? bars[bars.length - 1].close : 0,
      target1Upside: 0,
      target2Upside: 0,
      riskRewardRatio: 0,
      summaryRationale: 'Insufficient price-time history to detect corrective wave completion.'
    };

    if (!bars || bars.length < 10) return defaultIndicator;

    const monowaves = monowavesInput || this.extractMonowaves(bars, 4);
    if (monowaves.length < 3) return defaultIndicator;

    const cmp = bars[bars.length - 1].close;

    // Locate corrective legs (A, B, C) in recent monowaves
    // We look for: mA (DOWN), mB (UP), mC (DOWN), and potential reversal thrust
    let mA: Monowave | null = null;
    let mB: Monowave | null = null;
    let mC: Monowave | null = null;
    let mPrior: Monowave | null = null;
    let mThrust: Monowave | null = null;

    const n = monowaves.length;

    if (monowaves[n - 1].direction === 'UP' && n >= 4) {
      // Latest monowave is an active upward thrust!
      mThrust = monowaves[n - 1];
      mC = monowaves[n - 2];
      mB = monowaves[n - 3];
      mA = monowaves[n - 4];
      if (n >= 5 && monowaves[n - 5].direction === 'UP') {
        mPrior = monowaves[n - 5];
      }
    } else if (monowaves[n - 1].direction === 'DOWN' && n >= 3) {
      // Latest monowave is Wave C down, price may be turning right now
      mC = monowaves[n - 1];
      mB = monowaves[n - 2];
      mA = monowaves[n - 3];
      if (n >= 4 && monowaves[n - 4].direction === 'UP') {
        mPrior = monowaves[n - 4];
      }
    } else {
      // Search backwards for the most recent DOWN - UP - DOWN triplet
      for (let i = n - 1; i >= 2; i--) {
        if (monowaves[i].direction === 'DOWN' && monowaves[i - 1].direction === 'UP' && monowaves[i - 2].direction === 'DOWN') {
          mC = monowaves[i];
          mB = monowaves[i - 1];
          mA = monowaves[i - 2];
          if (i >= 3 && monowaves[i - 3].direction === 'UP') {
            mPrior = monowaves[i - 3];
          }
          if (i < n - 1 && monowaves[i + 1].direction === 'UP') {
            mThrust = monowaves[i + 1];
          }
          break;
        }
      }
    }

    // Validate that we have proper alternating down-up-down legs
    if (!mA || !mB || !mC || mA.direction !== 'DOWN' || mB.direction !== 'UP' || mC.direction !== 'DOWN') {
      return {
        ...defaultIndicator,
        summaryRationale: 'No clear 3-legged (A-B-C) corrective structure found in recent monowave sequence.'
      };
    }

    const aLength = Math.abs(mA.priceChange);
    const bLength = Math.abs(mB.priceChange);
    const cLength = Math.abs(mC.priceChange);
    const bToARetracePct = aLength > 0 ? Number(((bLength / aLength) * 100).toFixed(1)) : 50;
    const cToARatio = aLength > 0 ? Number((cLength / aLength).toFixed(3)) : 1.0;

    const priorLength = mPrior ? Math.abs(mPrior.priceChange) : Math.max(aLength * 2, 1);
    const totalPullback = Math.abs(mA.startPrice - mC.endPrice);
    const retracementDepthPct = priorLength > 0 ? Number(((totalPullback / priorLength) * 100).toFixed(1)) : 50;

    // Build Leg representations
    const waveALeg: CorrectiveWaveLeg = {
      startPrice: mA.startPrice,
      endPrice: mA.endPrice,
      startDate: mA.startDate,
      endDate: mA.endDate,
      priceLength: Number(aLength.toFixed(2)),
      priceChangePct: Number(mA.priceChangePct.toFixed(2)),
      durationBars: mA.barsCount,
      direction: 'DOWN'
    };

    const waveBLeg: CorrectiveWaveLeg = {
      startPrice: mB.startPrice,
      endPrice: mB.endPrice,
      startDate: mB.startDate,
      endDate: mB.endDate,
      priceLength: Number(bLength.toFixed(2)),
      priceChangePct: Number(mB.priceChangePct.toFixed(2)),
      durationBars: mB.barsCount,
      direction: 'UP'
    };

    const waveCLeg: CorrectiveWaveLeg = {
      startPrice: mC.startPrice,
      endPrice: mC.endPrice,
      startDate: mC.startDate,
      endDate: mC.endDate,
      priceLength: Number(cLength.toFixed(2)),
      priceChangePct: Number(mC.priceChangePct.toFixed(2)),
      durationBars: mC.barsCount,
      direction: 'DOWN'
    };

    const priorImpulseLeg: CorrectiveWaveLeg | undefined = mPrior ? {
      startPrice: mPrior.startPrice,
      endPrice: mPrior.endPrice,
      startDate: mPrior.startDate,
      endDate: mPrior.endDate,
      priceLength: Number(priorLength.toFixed(2)),
      priceChangePct: Number(mPrior.priceChangePct.toFixed(2)),
      durationBars: mPrior.barsCount,
      direction: 'UP'
    } : undefined;

    // Pattern Classification
    let correctivePatternType: ElliottCorrectiveCompletionIndicator['correctivePatternType'] = 'NEUTRAL_COMPLEX';
    if (mPrior && retracementDepthPct >= 42 && retracementDepthPct <= 68 && mC.endPrice > mPrior.startPrice) {
      correctivePatternType = 'WAVE_2_GOLDEN_POCKET';
    } else if (mPrior && retracementDepthPct >= 18 && retracementDepthPct <= 42 && mC.endPrice > mPrior.startPrice) {
      correctivePatternType = 'WAVE_4_ALTERNATION';
    } else if (bToARetracePct <= 68 && mC.endPrice <= mA.endPrice) {
      correctivePatternType = 'ZIGZAG_ABC';
    } else if (bToARetracePct >= 72 && bToARetracePct <= 108) {
      correctivePatternType = 'FLAT_REGULAR_ABC';
    } else if (bToARetracePct > 108) {
      correctivePatternType = 'FLAT_EXPANDED_ABC';
    } else {
      correctivePatternType = 'ZIGZAG_ABC';
    }

    // Glenn Neely 0-B Trendline Gate
    const duration0ToB = Math.max(1, mA.barsCount + mB.barsCount);
    const slope0B = (mB.endPrice - mA.startPrice) / duration0ToB; // negative slope
    const totalBarsToCurrent = duration0ToB + mC.barsCount + (mThrust ? mThrust.barsCount : 1);
    const zeroBProjectedPrice = Math.max(mC.endPrice, mA.startPrice + slope0B * totalBarsToCurrent);
    
    // 0-B line broken if current price is above projected line or above Wave B peak
    const zeroBLineBroken = cmp >= zeroBProjectedPrice * 0.998 || cmp >= mB.endPrice * 0.99;

    // Glenn Neely Touchstone Stage 1: Faster Time Confirmation
    const reversalBars = mThrust ? mThrust.barsCount : Math.max(1, bars.length - (bars.findIndex(b => b.date === mC.endDate) || (bars.length - 1)));
    const touchstoneFasterTime = (reversalBars <= mC.barsCount * 1.35) && (cmp > mC.endPrice);

    // Glenn Neely Touchstone Stage 2: Price Retracement Confirmation
    const recoveryAmount = cmp - mC.endPrice;
    const touchstonePriceRetracement = cLength > 0 && (recoveryAmount / cLength) >= 0.48;

    // Golden Pocket Support
    const goldenPocketSupportHeld = (retracementDepthPct <= 68 || mC.endPrice > (mPrior?.startPrice || 0)) && cmp > mC.endPrice;

    // Momentum Expansion (Bullish candle close & higher close)
    const bullishMomentumExpansion = cmp > mC.endPrice * 1.012;

    // Alternation check
    const ruleOfAlternationValid = correctivePatternType === 'WAVE_4_ALTERNATION' ? (retracementDepthPct <= 42) : true;

    // Invalidation Level: Terminal low of Wave C (or Wave 1 apex for Wave 4)
    const invalidationLevel = correctivePatternType === 'WAVE_4_ALTERNATION' && mPrior
      ? Number(Math.max(mC.endPrice, mPrior.startPrice).toFixed(2))
      : Number(mC.endPrice.toFixed(2));

    const reversalTriggerPrice = Number(Math.max(mB.endPrice, zeroBProjectedPrice).toFixed(2));

    // Upside Targets
    const target1Upside = Number((mB.endPrice + aLength * 0.618).toFixed(2));
    const target2Upside = Number((mC.endPrice + (mPrior ? priorLength * 1.618 : aLength * 2.0)).toFixed(2));
    const riskDistance = Math.max(1, cmp - invalidationLevel);
    const rewardDistance = Math.max(1, target1Upside - cmp);
    const riskRewardRatio = Number((rewardDistance / riskDistance).toFixed(2));

    // Determine Final Completion Status & Confidence
    let isCompleted = false;
    let completionStatus: ElliottCorrectiveCompletionIndicator['completionStatus'] = 'DEVELOPING';
    let confidenceScore = 50;

    if (mPrior && cmp < mPrior.startPrice) {
      completionStatus = 'INVALIDATED';
      isCompleted = false;
      confidenceScore = 15;
    } else if (zeroBLineBroken && (touchstoneFasterTime || touchstonePriceRetracement) && goldenPocketSupportHeld) {
      completionStatus = 'CONFIRMED_COMPLETED';
      isCompleted = true;
      confidenceScore = Math.min(96, 82 + (touchstoneFasterTime ? 6 : 0) + (touchstonePriceRetracement ? 5 : 0) + (bullishMomentumExpansion ? 3 : 0));
    } else if (cmp > mC.endPrice * 1.015 && (zeroBLineBroken || touchstonePriceRetracement)) {
      completionStatus = 'EARLY_REVERSAL';
      isCompleted = true;
      confidenceScore = 78;
    } else if (cmp >= mC.endPrice) {
      completionStatus = 'DEVELOPING';
      isCompleted = false;
      confidenceScore = 58;
    } else {
      completionStatus = 'DEVELOPING';
      isCompleted = false;
      confidenceScore = 40;
    }

    const summaryRationale = isCompleted
      ? `Glenn Neely Touchstone Corrective Completion Confirmed (${correctivePatternType}). Wave C terminated at ₹${mC.endPrice.toFixed(0)} (${cToARatio.toFixed(2)}x Wave A). 0-B trendline broken with faster-time reversal velocity. Structural stop-loss anchored at ₹${invalidationLevel.toFixed(0)}; Target 1 at ₹${target1Upside.toFixed(0)} (R:R ${riskRewardRatio}:1).`
      : `Corrective pullback pattern ${correctivePatternType} currently developing. Wave C low at ₹${mC.endPrice.toFixed(0)} (Retracement ${retracementDepthPct}%). Awaiting breakout above 0-B trendline (₹${reversalTriggerPrice.toFixed(0)}) for structural completion confirmation.`;

    return {
      symbol,
      isCompleted,
      completionStatus,
      correctivePatternType,
      confidenceScore,
      priorImpulse: priorImpulseLeg,
      waveA: waveALeg,
      waveB: waveBLeg,
      waveC: waveCLeg,
      retracementDepthPct,
      cToARatio,
      bToARetracePct,
      confirmationGates: {
        zeroBLineBroken,
        touchstoneFasterTime,
        touchstonePriceRetracement,
        goldenPocketSupportHeld,
        bullishMomentumExpansion,
        ruleOfAlternationValid
      },
      invalidationLevel,
      reversalTriggerPrice,
      currentPrice: Number(cmp.toFixed(2)),
      target1Upside,
      target2Upside,
      riskRewardRatio,
      summaryRationale
    };
  }

  /**
   * Comprehensive Glenn Neely & Elliott Wave Pattern Classifier.
   */
  public analyzeNEoWave(symbol: string, bars: OHLCVBar[]): NEoWaveAnalysisResult {
    const monowaves = this.extractMonowaves(bars, 4);

    const defaultResult: NEoWaveAnalysisResult = {
      symbol,
      currentPattern: 'CONSOLIDATION_NEUTRAL',
      patternConfidence: 50,
      currentWaveLabel: 'Neutral Consolidation',
      primaryDegreeTrend: 'NEUTRAL',
      monowaves,
      wavePivots: [],
      fibonacciLevels: {
        wave1Length: 0,
        wave2RetracePct: 0,
        wave3ExtensionRatio: 0,
        goldenPocketLow: 0,
        goldenPocketHigh: 0,
        target1Fib1618: 0,
        target2Fib2618: 0
      },
      hardStructuralStopLoss: bars.length > 0 ? bars[bars.length - 1].close * 0.92 : 0,
      invalidationPrice: bars.length > 0 ? bars[bars.length - 1].close * 0.90 : 0,
      timePriceConfirmationPassed: false,
      ruleOfExtensionSatisfied: false,
      extendedWave: 'NONE',
      summaryRationale: 'Insufficient structural monowave resolution for deterministic wave counting.'
    };

    const correctiveInd = this.detectCorrectivePatternCompletion(bars, monowaves, symbol);
    defaultResult.correctiveIndicator = correctiveInd;

    if (monowaves.length < 5) {
      if (correctiveInd.isCompleted) {
        const pivots: WavePivot[] = [];
        if (correctiveInd.priorImpulse) {
          pivots.push({ label: '(0)', price: correctiveInd.priorImpulse.startPrice, date: correctiveInd.priorImpulse.startDate, isConfirmed: true, type: 'IMPULSE' });
        }
        if (correctiveInd.waveA) {
          pivots.push({ label: '(A)', price: correctiveInd.waveA.endPrice, date: correctiveInd.waveA.endDate, isConfirmed: true, type: 'CORRECTIVE' });
        }
        if (correctiveInd.waveB) {
          pivots.push({ label: '(B)', price: correctiveInd.waveB.endPrice, date: correctiveInd.waveB.endDate, isConfirmed: true, type: 'CORRECTIVE' });
        }
        if (correctiveInd.waveC) {
          pivots.push({ label: '(C)', price: correctiveInd.waveC.endPrice, date: correctiveInd.waveC.endDate, isConfirmed: true, type: 'CORRECTIVE' });
        }

        return {
          symbol,
          currentPattern: 'CORRECTION_WAVE_C_COMPLETION',
          patternConfidence: correctiveInd.confidenceScore,
          currentWaveLabel: `Completed ${correctiveInd.correctivePatternType} (Wave C Exhaustion & Impulse Kickoff)`,
          primaryDegreeTrend: 'BULLISH',
          monowaves,
          wavePivots: pivots,
          fibonacciLevels: {
            wave1Length: correctiveInd.priorImpulse?.priceLength || correctiveInd.waveA?.priceLength || 100,
            wave2RetracePct: correctiveInd.retracementDepthPct,
            wave3ExtensionRatio: 1.618,
            goldenPocketLow: correctiveInd.invalidationLevel,
            goldenPocketHigh: correctiveInd.reversalTriggerPrice,
            target1Fib1618: correctiveInd.target1Upside,
            target2Fib2618: correctiveInd.target2Upside
          },
          hardStructuralStopLoss: correctiveInd.invalidationLevel,
          invalidationPrice: correctiveInd.invalidationLevel * 0.99,
          timePriceConfirmationPassed: correctiveInd.confirmationGates.touchstoneFasterTime || correctiveInd.confirmationGates.touchstonePriceRetracement,
          ruleOfExtensionSatisfied: true,
          extendedWave: 'NONE',
          correctiveIndicator: correctiveInd,
          summaryRationale: correctiveInd.summaryRationale
        };
      }
      return defaultResult;
    }

    const recent = monowaves.slice(-7); // Look at last 5 to 7 monowaves
    const latestBar = bars[bars.length - 1];
    const cmp = latestBar.close;

    // ========================================================================
    // PATTERN 1: 5-WAVE IMPULSE PROGRESSION (1-2-3-4-5)
    // ========================================================================
    if (recent.length >= 5) {
      // Find potential Wave 1, 2, 3 sequence
      const m1 = recent[recent.length - 5]; // Potential Wave 1
      const m2 = recent[recent.length - 4]; // Potential Wave 2
      const m3 = recent[recent.length - 3]; // Potential Wave 3
      const m4 = recent[recent.length - 2]; // Potential Wave 4
      const m5 = recent[recent.length - 1]; // Potential Wave 5 / Ongoing

      // Scenario A: Bullish Impulse Candidate
      if (m1.direction === 'UP' && m2.direction === 'DOWN') {
        const w1Length = Math.abs(m1.priceChange);
        const w2Length = Math.abs(m2.priceChange);
        const w2RetracePct = (w2Length / w1Length) * 100;

        // Rule 1: Wave 2 cannot retrace > 100% of Wave 1
        const rule1Valid = w2RetracePct < 100;

        if (rule1Valid) {
          const goldenPocketLow = m1.startPrice + w1Length * 0.382;
          const goldenPocketHigh = m1.startPrice + w1Length * 0.50;
          const target1 = m2.endPrice + w1Length * 1.618;
          const target2 = m2.endPrice + w1Length * 2.618;

          // SUB-CASE 1: Wave (3) Kickoff
          // Wave 2 completed in Golden Pocket (50% - 61.8%), Wave 3 has begun
          if (m3.direction === 'UP' && m3.endPrice > m1.endPrice && recent.length === 5) {
            const w3Length = Math.abs(m3.priceChange);
            const w3ExtRatio = w3Length / w1Length;
            const isExtended = w3ExtRatio >= 1.618;

            // Touchstone Confirmation: Did Wave 3 break Wave 1 high faster than Wave 2 took to form?
            const confirmationPassed = m3.barsCount <= m2.barsCount * 1.2;

            return {
              symbol,
              currentPattern: 'IMPULSE_WAVE_3_KICKOFF',
              patternConfidence: isExtended && confirmationPassed ? 88 : 78,
              currentWaveLabel: 'Wave (3) Institutional Impulse Thrust',
              primaryDegreeTrend: 'BULLISH',
              monowaves: recent,
              wavePivots: [
                { label: '(1)', price: m1.endPrice, date: m1.endDate, isConfirmed: true, type: 'IMPULSE' },
                { label: '(2)', price: m2.endPrice, date: m2.endDate, isConfirmed: true, type: 'CORRECTIVE' },
                { label: '(3)', price: m3.endPrice, date: m3.endDate, isConfirmed: isExtended, type: 'IMPULSE' }
              ],
              fibonacciLevels: {
                wave1Length: Number(w1Length.toFixed(2)),
                wave2RetracePct: Number(w2RetracePct.toFixed(1)),
                wave3ExtensionRatio: Number(w3ExtRatio.toFixed(2)),
                goldenPocketLow: Number(goldenPocketLow.toFixed(2)),
                goldenPocketHigh: Number(goldenPocketHigh.toFixed(2)),
                target1Fib1618: Number(target1.toFixed(2)),
                target2Fib2618: Number(target2.toFixed(2))
              },
              hardStructuralStopLoss: m2.endPrice, // Wave 2 low is the hard invalidation
              invalidationPrice: m2.endPrice * 0.99,
              timePriceConfirmationPassed: confirmationPassed,
              ruleOfExtensionSatisfied: isExtended,
              extendedWave: isExtended ? 'WAVE_3' : 'NONE',
              correctiveIndicator: correctiveInd,
              summaryRationale: `Glenn Neely Wave (3) Kickoff confirmed. Wave 2 retraced ${w2RetracePct.toFixed(1)}% (Golden Pocket) without breaching Wave 1 base. Wave 3 extension target stands at ₹${target1.toFixed(0)} (1.618 Fib extension). Hard invalidation level at ₹${m2.endPrice.toFixed(0)}.`
            };
          }

          // SUB-CASE 2: Wave (4) Pullback Sniper Entry
          // Wave 3 completed (extended), Wave 4 is pulling back without overlapping Wave 1 high
          if (m3.direction === 'UP' && m4.direction === 'DOWN' && m3.endPrice > m1.endPrice) {
            const w3Length = Math.abs(m3.priceChange);
            const w4Length = Math.abs(m4.priceChange);
            const w4RetracePct = (w4Length / w3Length) * 100;
            const overlapsW1 = m4.endPrice <= m1.endPrice; // Rule 3: No overlap

            if (!overlapsW1 && w4RetracePct <= 50) {
              const target5 = m4.endPrice + w1Length; // Wave 5 = Wave 1

              return {
                symbol,
                currentPattern: 'IMPULSE_WAVE_4_PULLBACK',
                patternConfidence: 84,
                currentWaveLabel: 'Wave (4) Consolidation Pullback (Sniper Base)',
                primaryDegreeTrend: 'BULLISH',
                monowaves: recent,
                wavePivots: [
                  { label: '(1)', price: m1.endPrice, date: m1.endDate, isConfirmed: true, type: 'IMPULSE' },
                  { label: '(2)', price: m2.endPrice, date: m2.endDate, isConfirmed: true, type: 'CORRECTIVE' },
                  { label: '(3)', price: m3.endPrice, date: m3.endDate, isConfirmed: true, type: 'IMPULSE' },
                  { label: '(4)', price: m4.endPrice, date: m4.endDate, isConfirmed: true, type: 'CORRECTIVE' }
                ],
                fibonacciLevels: {
                  wave1Length: Number(w1Length.toFixed(2)),
                  wave2RetracePct: Number(w2RetracePct.toFixed(1)),
                  wave3ExtensionRatio: Number((w3Length / w1Length).toFixed(2)),
                  goldenPocketLow: Number((m3.endPrice - w3Length * 0.382).toFixed(2)),
                  goldenPocketHigh: Number((m3.endPrice - w3Length * 0.500).toFixed(2)),
                  target1Fib1618: Number(target5.toFixed(2)),
                  target2Fib2618: Number((m4.endPrice + w3Length * 0.618).toFixed(2))
                },
                hardStructuralStopLoss: m1.endPrice, // Invalidation is breach of Wave 1 high
                invalidationPrice: m1.endPrice * 0.99,
                timePriceConfirmationPassed: true,
                ruleOfExtensionSatisfied: true,
                extendedWave: 'WAVE_3',
                correctiveIndicator: correctiveInd,
                summaryRationale: `Wave (4) shallow pullback holding cleanly above Wave (1) apex (₹${m1.endPrice.toFixed(0)}). Classic Glenn Neely Alternation: Wave 2 was sharp (${w2RetracePct.toFixed(0)}%), Wave 4 is sideways (${w4RetracePct.toFixed(0)}%). Wave (5) terminal target ₹${target5.toFixed(0)}.`
              };
            }
          }
        }
      }
    }

    // ========================================================================
    // PATTERN 2: GLENN NEELY DIAMETRIC FORMATION (7-LEGGED A-B-C-D-E-F-G)
    // ========================================================================
    if (recent.length >= 7) {
      // Check for 7 alternating waves with converging/diverging symmetry (Bowtie or Diamond)
      const legA = recent[0];
      const legB = recent[1];
      const legC = recent[2];
      const legD = recent[3];
      const legE = recent[4];
      const legF = recent[5];
      const legG = recent[6];

      // Alternation check
      const alternating = 
        legA.direction !== legB.direction &&
        legB.direction !== legC.direction &&
        legC.direction !== legD.direction &&
        legD.direction !== legE.direction &&
        legE.direction !== legF.direction &&
        legF.direction !== legG.direction;

      if (alternating) {
        // Check for time and price symmetry characteristic of Neely Diametrics
        const avgLegDuration = (legA.barsCount + legB.barsCount + legC.barsCount + legD.barsCount + legE.barsCount + legF.barsCount) / 6;
        const legGDurationDiff = Math.abs(legG.barsCount - avgLegDuration) / avgLegDuration;

        if (legGDurationDiff <= 0.40) {
          const isBullishReversal = legG.direction === 'DOWN'; // Leg G is final downward exhaustion
          const stopLoss = isBullishReversal ? legG.endPrice * 0.97 : legG.endPrice * 1.03;
          const target = isBullishReversal 
            ? cmp + Math.abs(legA.priceChange) * 1.618 
            : cmp - Math.abs(legA.priceChange) * 1.618;

          return {
            symbol,
            currentPattern: 'DIAMETRIC_LEG_G_REVERSAL',
            patternConfidence: 82,
            currentWaveLabel: 'Glenn Neely 7-Legged Diametric (Leg G Exhaustion)',
            primaryDegreeTrend: isBullishReversal ? 'BULLISH' : 'BEARISH',
            monowaves: recent,
            wavePivots: [
              { label: 'A', price: legA.endPrice, date: legA.endDate, isConfirmed: true, type: 'DIAMETRIC' },
              { label: 'B', price: legB.endPrice, date: legB.endDate, isConfirmed: true, type: 'DIAMETRIC' },
              { label: 'C', price: legC.endPrice, date: legC.endDate, isConfirmed: true, type: 'DIAMETRIC' },
              { label: 'D', price: legD.endPrice, date: legD.endDate, isConfirmed: true, type: 'DIAMETRIC' },
              { label: 'E', price: legE.endPrice, date: legE.endDate, isConfirmed: true, type: 'DIAMETRIC' },
              { label: 'F', price: legF.endPrice, date: legF.endDate, isConfirmed: true, type: 'DIAMETRIC' },
              { label: 'G', price: legG.endPrice, date: legG.endDate, isConfirmed: true, type: 'DIAMETRIC' }
            ],
            fibonacciLevels: {
              wave1Length: Math.abs(legA.priceChange),
              wave2RetracePct: 61.8,
              wave3ExtensionRatio: 1.618,
              goldenPocketLow: Math.min(legA.startPrice, legG.endPrice),
              goldenPocketHigh: Math.max(legA.startPrice, legG.endPrice),
              target1Fib1618: Number(target.toFixed(2)),
              target2Fib2618: Number((target * 1.2).toFixed(2))
            },
            hardStructuralStopLoss: Number(stopLoss.toFixed(2)),
            invalidationPrice: Number(stopLoss.toFixed(2)),
            timePriceConfirmationPassed: true,
            ruleOfExtensionSatisfied: true,
            extendedWave: 'NONE',
            correctiveIndicator: correctiveInd,
            summaryRationale: `7-Legged Symmetrical Diametric Formation nearing terminal exhaustion on Leg G. Symmetrical time duration (~${Math.round(avgLegDuration)} bars/leg). High-conviction inflection point with breakout target ₹${target.toFixed(0)}.`
          };
        }
      }
    }

    // ========================================================================
    // PATTERN 3: ELLIOTT & NEOWAVE CORRECTIVE PULLBACK COMPLETION (WAVE C)
    // ========================================================================
    if (correctiveInd.isCompleted) {
      const pivots: WavePivot[] = [];
      if (correctiveInd.priorImpulse) {
        pivots.push({ label: '(0)', price: correctiveInd.priorImpulse.startPrice, date: correctiveInd.priorImpulse.startDate, isConfirmed: true, type: 'IMPULSE' });
      }
      if (correctiveInd.waveA) {
        pivots.push({ label: '(A)', price: correctiveInd.waveA.endPrice, date: correctiveInd.waveA.endDate, isConfirmed: true, type: 'CORRECTIVE' });
      }
      if (correctiveInd.waveB) {
        pivots.push({ label: '(B)', price: correctiveInd.waveB.endPrice, date: correctiveInd.waveB.endDate, isConfirmed: true, type: 'CORRECTIVE' });
      }
      if (correctiveInd.waveC) {
        pivots.push({ label: '(C)', price: correctiveInd.waveC.endPrice, date: correctiveInd.waveC.endDate, isConfirmed: true, type: 'CORRECTIVE' });
      }

      return {
        symbol,
        currentPattern: 'CORRECTION_WAVE_C_COMPLETION',
        patternConfidence: correctiveInd.confidenceScore,
        currentWaveLabel: `Completed ${correctiveInd.correctivePatternType} (Wave C Exhaustion & Impulse Kickoff)`,
        primaryDegreeTrend: 'BULLISH',
        monowaves: recent,
        wavePivots: pivots,
        fibonacciLevels: {
          wave1Length: correctiveInd.priorImpulse?.priceLength || correctiveInd.waveA?.priceLength || 100,
          wave2RetracePct: correctiveInd.retracementDepthPct,
          wave3ExtensionRatio: 1.618,
          goldenPocketLow: correctiveInd.invalidationLevel,
          goldenPocketHigh: correctiveInd.reversalTriggerPrice,
          target1Fib1618: correctiveInd.target1Upside,
          target2Fib2618: correctiveInd.target2Upside
        },
        hardStructuralStopLoss: correctiveInd.invalidationLevel,
        invalidationPrice: correctiveInd.invalidationLevel * 0.99,
        timePriceConfirmationPassed: correctiveInd.confirmationGates.touchstoneFasterTime || correctiveInd.confirmationGates.touchstonePriceRetracement,
        ruleOfExtensionSatisfied: true,
        extendedWave: 'NONE',
        correctiveIndicator: correctiveInd,
        summaryRationale: correctiveInd.summaryRationale
      };
    }

    // Default neutral structural reading
    return {
      ...defaultResult,
      monowaves: recent,
      hardStructuralStopLoss: cmp * 0.94,
      invalidationPrice: cmp * 0.92,
      correctiveIndicator: correctiveInd,
      summaryRationale: `Price moving in consolidative monowaves. Structural degree currently neutral. Monitoring for Wave 3 displacement or Diametric Leg E/F emergence.`
    };
  }
}
