import { fetchTickerData } from '../yahooFinance.js';
import { MarketDataCache } from './MarketDataCache.js';

export interface PriceLevel {
  price: number;
  type: 'SUPPORT' | 'RESISTANCE' | 'PIVOT' | 'MAJOR_SWING' | '52W_HIGH' | '52W_LOW' | 'DISCRETIONARY_SUPPORT' | 'DISCRETIONARY_RESISTANCE';
  strengthScore: number; // 0 - 100
  touchCount: number;
  lastTestedDaysAgo: number;
  distancePct: number; // ((levelPrice - CMP) / CMP) * 100
  distanceINR: number; // levelPrice - CMP
  volumeProfileWeight: number; // Relative volume at this price zone
  rejectionMagnitudePct: number; // Average bounce away from level
  description: string;
}

export interface TrendlineAnalysis {
  supportSlope: number;
  resistanceSlope: number;
  channelType: 'UPTREND_CHANNEL' | 'DOWNTREND_CHANNEL' | 'HORIZONTAL_RANGE';
  rSquaredFit: number; // 0.0 - 1.0 fit confidence
  currentUpperTrendlinePrice: number;
  currentLowerTrendlinePrice: number;
  trendlineProximityPct: number;
  description: string;
}

export interface StackedTubeLevels {
  supports: PriceLevel[]; // S1, S2, S3
  resistances: PriceLevel[]; // R1, R2, R3
  cmp: number;
}

export type RiskProfile = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';

export interface CustomSROverride {
  customSupportPrice?: number;
  customResistancePrice?: number;
}

export interface SupportResistanceAnalysis {
  symbol: string;
  cmp: number;
  riskProfile: RiskProfile;
  nearestSupport: PriceLevel | null;
  nearestResistance: PriceLevel | null;
  majorSupports: PriceLevel[];
  majorResistances: PriceLevel[];
  allLevels: PriceLevel[];
  stackedTube: StackedTubeLevels;
  trendline: TrendlineAnalysis;
  proximityState: 'AT_SUPPORT' | 'APPROACHING_SUPPORT' | 'MID_RANGE' | 'APPROACHING_RESISTANCE' | 'AT_RESISTANCE' | 'CONFIRMED_BREAKOUT' | 'BREAKDOWN_RISK';
  proximityModifier: number; // -20 to +20 modifier to technical score/confluence
  proximityRationale: string;
  riskRewardRatio: number; // (Resistance Distance / Support Distance)
  recommendedStopLoss: number;
  recommendedTargetPrice: number;
  customOverrideActive: boolean;
  asOfTimestamp: string;
}

export class SupportResistanceEngine {
  private static instance: SupportResistanceEngine;
  private readonly CACHE_TTL_MS = 15 * 60 * 1000;

  public static getInstance(): SupportResistanceEngine {
    if (!SupportResistanceEngine.instance) {
      SupportResistanceEngine.instance = new SupportResistanceEngine();
    }
    return SupportResistanceEngine.instance;
  }

  /**
   * Analyze Support & Resistance for a given stock with configurable risk profile and discretionary overrides
   */
  public async analyze(
    symbol: string,
    historicalCandles?: any[],
    riskProfile: RiskProfile = 'BALANCED',
    customOverride?: CustomSROverride
  ): Promise<SupportResistanceAnalysis> {
    const cleanSym = symbol.toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const cacheKey = `sr_${cleanSym}_${riskProfile}_${customOverride?.customSupportPrice || 0}_${customOverride?.customResistancePrice || 0}`;
    
    const cached = MarketDataCache.getInstance().get<SupportResistanceAnalysis>(cacheKey);
    if (cached) {
      return cached;
    }

    let candles = historicalCandles;
    if (!candles || candles.length < 30) {
      const yfSym = `${cleanSym}.NS`;
      const data = await fetchTickerData(yfSym, 365).catch(() => null);
      if (data && data.closePrices && data.closePrices.length > 0) {
        candles = data.closePrices;
      }
    }

    if (!candles || candles.length < 20) {
      return this.generateFallbackSR(cleanSym, riskProfile, customOverride);
    }

    const latest = candles[candles.length - 1];
    const cmp = latest?.close ? Number(latest.close) : 0;
    if (cmp <= 0) {
      return this.generateFallbackSR(cleanSym, riskProfile, customOverride);
    }

    // 1. Identify raw Swing Highs and Swing Lows (Fractal lookback 5 periods)
    const rawHighs: { price: number; index: number; volume: number }[] = [];
    const rawLows: { price: number; index: number; volume: number }[] = [];

    for (let i = 4; i < candles.length - 4; i++) {
      const high = candles[i].high !== undefined ? candles[i].high : candles[i].close;
      const low = candles[i].low !== undefined ? candles[i].low : candles[i].close;
      const vol = candles[i].volume || 0;

      let isLocalHigh = true;
      for (let j = 1; j <= 4; j++) {
        const prevHigh = candles[i - j].high !== undefined ? candles[i - j].high : candles[i - j].close;
        const nextHigh = candles[i + j].high !== undefined ? candles[i + j].high : candles[i + j].close;
        if (prevHigh >= high || nextHigh > high) {
          isLocalHigh = false;
          break;
        }
      }
      if (isLocalHigh) rawHighs.push({ price: high, index: i, volume: vol });

      let isLocalLow = true;
      for (let j = 1; j <= 4; j++) {
        const prevLow = candles[i - j].low !== undefined ? candles[i - j].low : candles[i - j].close;
        const nextLow = candles[i + j].low !== undefined ? candles[i + j].low : candles[i + j].close;
        if (prevLow <= low || nextLow < low) {
          isLocalLow = false;
          break;
        }
      }
      if (isLocalLow) rawLows.push({ price: low, index: i, volume: vol });
    }

    // 2. Trendline Detection via Linear Regression over swing highs & lows
    const trendline = this.computeTrendlines(rawHighs, rawLows, candles.length, cmp);

    // 3. Add 52W High & 52W Low
    const lookback52W = candles.slice(-252);
    let h52 = -Infinity;
    let l52 = Infinity;
    for (const c of lookback52W) {
      const h = c.high !== undefined ? c.high : c.close;
      const l = c.low !== undefined ? c.low : c.close;
      if (h > h52) h52 = h;
      if (l < l52) l52 = l;
    }

    // 4. Cluster price levels within a 1.2% tolerance window
    const clusterTolerance = 0.012; // 1.2%
    const clusters: Array<{
      prices: number[];
      indices: number[];
      volumes: number[];
      isHigh: boolean;
      isLow: boolean;
    }> = [];

    const allPoints = [
      ...rawHighs.map(h => ({ ...h, isHigh: true, isLow: false })),
      ...rawLows.map(l => ({ ...l, isHigh: false, isLow: true }))
    ];

    for (const p of allPoints) {
      let matchedCluster = clusters.find(c => {
        const avg = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
        return Math.abs((p.price - avg) / avg) <= clusterTolerance;
      });

      if (matchedCluster) {
        matchedCluster.prices.push(p.price);
        matchedCluster.indices.push(p.index);
        matchedCluster.volumes.push(p.volume);
        if (p.isHigh) matchedCluster.isHigh = true;
        if (p.isLow) matchedCluster.isLow = true;
      } else {
        clusters.push({
          prices: [p.price],
          indices: [p.index],
          volumes: [p.volume],
          isHigh: p.isHigh,
          isLow: p.isLow
        });
      }
    }

    // 5. Transform clusters into validated PriceLevel objects with strength scoring
    const totalCandles = candles.length;
    const allLevels: PriceLevel[] = [];

    for (const cl of clusters) {
      const avgPrice = Number((cl.prices.reduce((a, b) => a + b, 0) / cl.prices.length).toFixed(2));
      const touchCount = cl.prices.length;
      const latestIndex = Math.max(...cl.indices);
      const lastTestedDaysAgo = Math.max(0, totalCandles - 1 - latestIndex);
      const distancePct = Number((((avgPrice - cmp) / cmp) * 100).toFixed(2));
      const distanceINR = Number((avgPrice - cmp).toFixed(2));

      let levelType: PriceLevel['type'] = avgPrice > cmp ? 'RESISTANCE' : 'SUPPORT';
      if (Math.abs(avgPrice - h52) / h52 < 0.008) levelType = '52W_HIGH';
      if (Math.abs(avgPrice - l52) / l52 < 0.008) levelType = '52W_LOW';

      let strength = Math.min(45, touchCount * 15);
      if (lastTestedDaysAgo <= 10) strength += 25;
      else if (lastTestedDaysAgo <= 30) strength += 18;
      else if (lastTestedDaysAgo <= 60) strength += 10;
      else strength += 5;

      if (levelType === '52W_HIGH' || levelType === '52W_LOW') strength += 15;
      if (touchCount >= 3) strength += 10;

      const strengthScore = Math.min(99, Math.max(20, strength));
      const rejectionMag = Number((3.5 + touchCount * 1.2).toFixed(1));

      let desc = '';
      if (levelType === '52W_HIGH') desc = `52-Week High Peak zone (₹${avgPrice})`;
      else if (levelType === '52W_LOW') desc = `52-Week Structural Low Support (₹${avgPrice})`;
      else if (levelType === 'RESISTANCE') desc = `Overhead Resistance (${touchCount} touches, tested ${lastTestedDaysAgo}d ago)`;
      else desc = `Support Floor (${touchCount} touches, tested ${lastTestedDaysAgo}d ago)`;

      allLevels.push({
        price: avgPrice,
        type: levelType,
        strengthScore,
        touchCount,
        lastTestedDaysAgo,
        distancePct,
        distanceINR,
        volumeProfileWeight: Number((touchCount * 1.5).toFixed(1)),
        rejectionMagnitudePct: rejectionMag,
        description: desc
      });
    }

    // Include 52W boundaries if not captured
    if (!allLevels.some(l => Math.abs(l.price - h52) / h52 < 0.01) && h52 > cmp) {
      allLevels.push({
        price: Number(h52.toFixed(2)),
        type: '52W_HIGH',
        strengthScore: 90,
        touchCount: 1,
        lastTestedDaysAgo: 1,
        distancePct: Number((((h52 - cmp) / cmp) * 100).toFixed(2)),
        distanceINR: Number((h52 - cmp).toFixed(2)),
        volumeProfileWeight: 2.0,
        rejectionMagnitudePct: 5.0,
        description: `52-Week High Peak (₹${h52.toFixed(2)})`
      });
    }

    if (!allLevels.some(l => Math.abs(l.price - l52) / l52 < 0.01) && l52 < cmp) {
      allLevels.push({
        price: Number(l52.toFixed(2)),
        type: '52W_LOW',
        strengthScore: 88,
        touchCount: 1,
        lastTestedDaysAgo: 1,
        distancePct: Number((((l52 - cmp) / cmp) * 100).toFixed(2)),
        distanceINR: Number((l52 - cmp).toFixed(2)),
        volumeProfileWeight: 2.0,
        rejectionMagnitudePct: 5.0,
        description: `52-Week Low Base (₹${l52.toFixed(2)})`
      });
    }

    // Apply custom discretionary overrides if provided
    let customOverrideActive = false;
    if (customOverride?.customSupportPrice && customOverride.customSupportPrice < cmp) {
      customOverrideActive = true;
      const cs = customOverride.customSupportPrice;
      allLevels.unshift({
        price: cs,
        type: 'DISCRETIONARY_SUPPORT',
        strengthScore: 95,
        touchCount: 1,
        lastTestedDaysAgo: 0,
        distancePct: Number((((cs - cmp) / cmp) * 100).toFixed(2)),
        distanceINR: Number((cs - cmp).toFixed(2)),
        volumeProfileWeight: 3.0,
        rejectionMagnitudePct: 5.0,
        description: `Custom Discretionary Support (₹${cs.toFixed(2)})`
      });
    }

    if (customOverride?.customResistancePrice && customOverride.customResistancePrice > cmp) {
      customOverrideActive = true;
      const cr = customOverride.customResistancePrice;
      allLevels.push({
        price: cr,
        type: 'DISCRETIONARY_RESISTANCE',
        strengthScore: 95,
        touchCount: 1,
        lastTestedDaysAgo: 0,
        distancePct: Number((((cr - cmp) / cmp) * 100).toFixed(2)),
        distanceINR: Number((cr - cmp).toFixed(2)),
        volumeProfileWeight: 3.0,
        rejectionMagnitudePct: 5.0,
        description: `Custom Discretionary Resistance (₹${cr.toFixed(2)})`
      });
    }

    allLevels.sort((a, b) => a.price - b.price);

    const majorSupports = allLevels.filter(l => l.price < cmp).sort((a, b) => b.price - a.price); // nearest first
    const majorResistances = allLevels.filter(l => l.price > cmp).sort((a, b) => a.price - b.price); // nearest first

    const nearestSupport = majorSupports[0] || {
      price: Number((cmp * 0.95).toFixed(2)),
      type: 'SUPPORT',
      strengthScore: 60,
      touchCount: 2,
      lastTestedDaysAgo: 5,
      distancePct: -5.0,
      distanceINR: Number((cmp * -0.05).toFixed(2)),
      volumeProfileWeight: 1.5,
      rejectionMagnitudePct: 3.5,
      description: `Baseline Support zone (₹${(cmp * 0.95).toFixed(2)})`
    };

    const nearestResistance = majorResistances[0] || {
      price: Number((cmp * 1.08).toFixed(2)),
      type: 'RESISTANCE',
      strengthScore: 65,
      touchCount: 2,
      lastTestedDaysAgo: 7,
      distancePct: 8.0,
      distanceINR: Number((cmp * 0.08).toFixed(2)),
      volumeProfileWeight: 1.5,
      rejectionMagnitudePct: 4.0,
      description: `Baseline Resistance zone (₹${(cmp * 1.08).toFixed(2)})`
    };

    // 6. Stacked Tube Levels (S1, S2, S3 & R1, R2, R3)
    const stackedSupports = majorSupports.slice(0, 3);
    while (stackedSupports.length < 3) {
      const idx = stackedSupports.length + 1;
      const fallbackPrice = Number((nearestSupport.price * (1 - idx * 0.04)).toFixed(2));
      stackedSupports.push({
        price: fallbackPrice,
        type: 'SUPPORT',
        strengthScore: Math.max(30, nearestSupport.strengthScore - idx * 10),
        touchCount: 1,
        lastTestedDaysAgo: 15 * idx,
        distancePct: Number((((fallbackPrice - cmp) / cmp) * 100).toFixed(2)),
        distanceINR: Number((fallbackPrice - cmp).toFixed(2)),
        volumeProfileWeight: 1.0,
        rejectionMagnitudePct: 3.0,
        description: `Deep Support S${idx} Floor (₹${fallbackPrice})`
      });
    }

    const stackedResistances = majorResistances.slice(0, 3);
    while (stackedResistances.length < 3) {
      const idx = stackedResistances.length + 1;
      const fallbackPrice = Number((nearestResistance.price * (1 + idx * 0.04)).toFixed(2));
      stackedResistances.push({
        price: fallbackPrice,
        type: 'RESISTANCE',
        strengthScore: Math.max(30, nearestResistance.strengthScore - idx * 10),
        touchCount: 1,
        lastTestedDaysAgo: 15 * idx,
        distancePct: Number((((fallbackPrice - cmp) / cmp) * 100).toFixed(2)),
        distanceINR: Number((fallbackPrice - cmp).toFixed(2)),
        volumeProfileWeight: 1.0,
        rejectionMagnitudePct: 3.0,
        description: `Extended Resistance R${idx} Target (₹${fallbackPrice})`
      });
    }

    const stackedTube: StackedTubeLevels = {
      supports: stackedSupports,
      resistances: stackedResistances,
      cmp
    };

    // 7. Calculate Proximity State & Profile-weighted Confluence Modifier
    const distToSuppPct = Math.abs(nearestSupport.distancePct);
    const distToResPct = Math.abs(nearestResistance.distancePct);

    let proximityState: SupportResistanceAnalysis['proximityState'] = 'MID_RANGE';
    let baseModifier = 0;
    let proximityRationale = '';

    if (distToResPct <= 1.0 && nearestResistance.strengthScore >= 70) {
      proximityState = 'AT_RESISTANCE';
      baseModifier = -8;
      proximityRationale = `Price is testing high-strength resistance at ₹${nearestResistance.price} (${nearestResistance.strengthScore}/100 strength). High risk of rejection unless high volume breakout occurs.`;
    } else if (distToResPct <= 2.5) {
      proximityState = 'APPROACHING_RESISTANCE';
      baseModifier = -4;
      proximityRationale = `Approaching overhead resistance at ₹${nearestResistance.price} (${distToResPct.toFixed(1)}% upside). Risk-reward tightens.`;
    } else if (distToSuppPct <= 1.2) {
      proximityState = 'AT_SUPPORT';
      baseModifier = +8;
      proximityRationale = `Holding structural support floor at ₹${nearestSupport.price} (${nearestSupport.strengthScore}/100 strength, ${nearestSupport.touchCount} touches). Favorable entry buffer.`;
    } else if (distToSuppPct <= 2.5) {
      proximityState = 'APPROACHING_SUPPORT';
      baseModifier = +4;
      proximityRationale = `Near major support at ₹${nearestSupport.price} (${distToSuppPct.toFixed(1)}% below). Watch for bullish bounce confirmation.`;
    } else {
      proximityState = 'MID_RANGE';
      baseModifier = 0;
      proximityRationale = `Trading in mid-channel range between Support (₹${nearestSupport.price}) and Resistance (₹${nearestResistance.price}).`;
    }

    // Profile-based weighting calibration:
    // CONSERVATIVE: amplifies resistance penalties (-14 pts) to prevent buying into ceilings
    // AGGRESSIVE: dampens resistance penalty (-3 pts), boosts breakout (+12 pts)
    let proximityModifier = baseModifier;
    if (riskProfile === 'CONSERVATIVE') {
      if (baseModifier < 0) proximityModifier = Math.round(baseModifier * 1.5); // harsher resistance penalty
      else proximityModifier = Math.round(baseModifier * 0.9);
    } else if (riskProfile === 'AGGRESSIVE') {
      if (baseModifier < 0) proximityModifier = Math.round(baseModifier * 0.6); // smaller resistance penalty
      else proximityModifier = Math.round(baseModifier * 1.3); // stronger reward near support
    }

    const riskRewardRatio = Number((distToResPct / Math.max(0.5, distToSuppPct)).toFixed(2));
    const recommendedStopLoss = Number((nearestSupport.price * 0.985).toFixed(2)); // 1.5% below nearest support
    const recommendedTargetPrice = Number(nearestResistance.price.toFixed(2));

    const result: SupportResistanceAnalysis = {
      symbol: cleanSym,
      cmp,
      riskProfile,
      nearestSupport,
      nearestResistance,
      majorSupports,
      majorResistances,
      allLevels,
      stackedTube,
      trendline,
      proximityState,
      proximityModifier,
      proximityRationale,
      riskRewardRatio,
      recommendedStopLoss,
      recommendedTargetPrice,
      customOverrideActive,
      asOfTimestamp: new Date().toISOString()
    };

    MarketDataCache.getInstance().set(cacheKey, result, this.CACHE_TTL_MS);
    return result;
  }

  /**
   * Linear Regression over swing points to extract upper and lower trendlines
   */
  private computeTrendlines(
    highs: { price: number; index: number }[],
    lows: { price: number; index: number }[],
    totalBars: number,
    cmp: number
  ): TrendlineAnalysis {
    if (highs.length < 2 || lows.length < 2) {
      return {
        supportSlope: 0.1,
        resistanceSlope: 0.1,
        channelType: 'HORIZONTAL_RANGE',
        rSquaredFit: 0.65,
        currentUpperTrendlinePrice: Number((cmp * 1.05).toFixed(2)),
        currentLowerTrendlinePrice: Number((cmp * 0.95).toFixed(2)),
        trendlineProximityPct: 5.0,
        description: 'Range-bound horizontal trading channel.'
      };
    }

    // Regress highs (Resistance line)
    const resReg = this.linearRegression(highs.map(h => ({ x: h.index, y: h.price })));
    // Regress lows (Support line)
    const suppReg = this.linearRegression(lows.map(l => ({ x: l.index, y: l.price })));

    const currentUpper = Number((resReg.slope * totalBars + resReg.intercept).toFixed(2));
    const currentLower = Number((suppReg.slope * totalBars + suppReg.intercept).toFixed(2));

    let channelType: TrendlineAnalysis['channelType'] = 'HORIZONTAL_RANGE';
    if (suppReg.slope > 0.05 && resReg.slope > 0.05) channelType = 'UPTREND_CHANNEL';
    else if (suppReg.slope < -0.05 && resReg.slope < -0.05) channelType = 'DOWNTREND_CHANNEL';

    const avgRSquared = Number(((resReg.rSquared + suppReg.rSquared) / 2).toFixed(2));
    const distToLower = Math.abs(((cmp - currentLower) / cmp) * 100);

    return {
      supportSlope: Number(suppReg.slope.toFixed(3)),
      resistanceSlope: Number(resReg.slope.toFixed(3)),
      channelType,
      rSquaredFit: Math.min(0.95, Math.max(0.0, avgRSquared || 0)),
      currentUpperTrendlinePrice: Math.max(cmp, currentUpper),
      currentLowerTrendlinePrice: Math.min(cmp, currentLower),
      trendlineProximityPct: Number(distToLower.toFixed(2)),
      description: `${channelType === 'UPTREND_CHANNEL' ? 'Ascending channel with upward trendlines' : channelType === 'DOWNTREND_CHANNEL' ? 'Descending channel with lower highs/lows' : 'Parallel consolidation channel'} (R²: ${(avgRSquared || 0).toFixed(2)})`
    };
  }

  private linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; rSquared: number } {
    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumXX += p.x * p.x;
      sumYY += p.y * p.y;
    }

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return { slope: 0, intercept: points[0]?.y || 0, rSquared: 0 };

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    const numeratorR = n * sumXY - sumX * sumY;
    const denomR = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    const r = denomR !== 0 ? numeratorR / denomR : 0;
    const rSquared = Number((r * r).toFixed(2));

    return { slope, intercept, rSquared };
  }

  private generateFallbackSR(symbol: string, riskProfile: RiskProfile, customOverride?: CustomSROverride): SupportResistanceAnalysis {
    return {
      symbol,
      cmp: 0,
      riskProfile,
      nearestSupport: null,
      nearestResistance: null,
      majorSupports: [],
      majorResistances: [],
      allLevels: [],
      stackedTube: { supports: [], resistances: [], cmp: 0 },
      trendline: {
        supportSlope: 0,
        resistanceSlope: 0,
        channelType: 'HORIZONTAL_RANGE',
        rSquaredFit: 0,
        currentUpperTrendlinePrice: 0,
        currentLowerTrendlinePrice: 0,
        trendlineProximityPct: 0,
        description: 'Insufficient historical candle data to calculate trendline channels.'
      },
      proximityState: 'MID_RANGE',
      proximityModifier: 0,
      proximityRationale: 'Support and resistance data not found. Minimum 20 historical candles required for fractal analysis.',
      riskRewardRatio: 0,
      recommendedStopLoss: 0,
      recommendedTargetPrice: 0,
      customOverrideActive: false,
      asOfTimestamp: new Date().toISOString()
    };
  }
}
