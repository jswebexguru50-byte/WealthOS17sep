/**
 * IndicatorPluginRegistry.ts
 * Extensible Indicator Plugin Architecture for NRI WealthOS Technical Engine.
 * Allows seamless registration of new quantitative indicators (ADX, Ichimoku, Supertrend, etc.)
 */

export interface IndicatorResult {
  id: string;
  name: string;
  subScore: number; // 0 - 100
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  rawOutput: Record<string, number | string | boolean>;
  summary: string;
  weight: number; // default weight 0.0 - 1.0
}

export interface IndicatorPlugin {
  id: string;
  name: string;
  description: string;
  category: 'MOMENTUM' | 'TREND' | 'VOLATILITY' | 'VOLUME';
  defaultWeight: number;
  calculate: (candles: Array<{ close: number; high?: number; low?: number; volume?: number; date?: string }>) => IndicatorResult;
}

export class IndicatorPluginRegistry {
  private static instance: IndicatorPluginRegistry;
  private plugins: Map<string, IndicatorPlugin> = new Map();

  private constructor() {
    this.registerBuiltIns();
  }

  public static getInstance(): IndicatorPluginRegistry {
    if (!IndicatorPluginRegistry.instance) {
      IndicatorPluginRegistry.instance = new IndicatorPluginRegistry();
    }
    return IndicatorPluginRegistry.instance;
  }

  public registerPlugin(plugin: IndicatorPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  public getPlugin(id: string): IndicatorPlugin | undefined {
    return this.plugins.get(id);
  }

  public getAllPlugins(): IndicatorPlugin[] {
    return Array.from(this.plugins.values());
  }

  public evaluateAll(candles: Array<{ close: number; high?: number; low?: number; volume?: number; date?: string }>): IndicatorResult[] {
    const results: IndicatorResult[] = [];
    for (const plugin of this.plugins.values()) {
      try {
        const result = plugin.calculate(candles);
        results.push(result);
      } catch (err) {
        console.error(`Error evaluating indicator plugin ${plugin.id}:`, err);
      }
    }
    return results;
  }

  private registerBuiltIns(): void {
    // 1. ADX Plugin (Average Directional Index)
    this.registerPlugin({
      id: 'adx_14',
      name: 'ADX (Average Directional Index 14)',
      description: 'Measures trend strength independently of direction. Values > 25 denote strong trending momentum.',
      category: 'TREND',
      defaultWeight: 0.10,
      calculate: (candles) => {
        if (!candles || candles.length < 20) {
          return {
            id: 'adx_14',
            name: 'ADX 14',
            subScore: 50,
            signal: 'NEUTRAL',
            rawOutput: { adx: 22, pdi: 20, mdi: 20 },
            summary: 'Insufficient candles for ADX calculation',
            weight: 0.10
          };
        }

        // Simplified ADX approximation
        const period = 14;
        let sumTR = 0;
        let sumPDM = 0;
        let sumMDM = 0;

        for (let i = candles.length - period; i < candles.length; i++) {
          const high = candles[i].high ?? candles[i].close;
          const low = candles[i].low ?? candles[i].close;
          const prevHigh = candles[i - 1].high ?? candles[i - 1].close;
          const prevLow = candles[i - 1].low ?? candles[i - 1].close;
          const prevClose = candles[i - 1].close;

          const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
          sumTR += tr;

          const upMove = high - prevHigh;
          const downMove = prevLow - low;

          if (upMove > downMove && upMove > 0) sumPDM += upMove;
          if (downMove > upMove && downMove > 0) sumMDM += downMove;
        }

        const pdi = sumTR > 0 ? (sumPDM / sumTR) * 100 : 25;
        const mdi = sumTR > 0 ? (sumMDM / sumTR) * 100 : 25;
        const dx = (pdi + mdi) > 0 ? (Math.abs(pdi - mdi) / (pdi + mdi)) * 100 : 20;
        const adx = Number(dx.toFixed(1));

        let subScore = 50;
        let signal: IndicatorResult['signal'] = 'NEUTRAL';

        if (adx >= 25) {
          if (pdi > mdi) {
            subScore = Math.min(100, Math.round(50 + (adx - 25) * 1.5 + (pdi - mdi)));
            signal = 'BULLISH';
          } else {
            subScore = Math.max(0, Math.round(50 - (adx - 25) * 1.5 - (mdi - pdi)));
            signal = 'BEARISH';
          }
        } else {
          subScore = 50 + Math.round((pdi - mdi) * 0.5);
          signal = pdi > mdi ? 'BULLISH' : 'BEARISH';
        }

        return {
          id: 'adx_14',
          name: 'ADX 14',
          subScore: Math.min(100, Math.max(0, subScore)),
          signal,
          rawOutput: { adx, pdi: Number(pdi.toFixed(1)), mdi: Number(mdi.toFixed(1)) },
          summary: `ADX is ${adx} (${adx >= 25 ? 'Strong Trend' : 'Range-bound'}), +DI: ${pdi.toFixed(1)}, -DI: ${mdi.toFixed(1)}`,
          weight: 0.10
        };
      }
    });

    // 2. Ichimoku Cloud Plugin
    this.registerPlugin({
      id: 'ichimoku_cloud',
      name: 'Ichimoku Kinko Hyo (Cloud)',
      description: 'Tenkan-sen, Kijun-sen, and Kumo Cloud equilibrium baseline.',
      category: 'TREND',
      defaultWeight: 0.10,
      calculate: (candles) => {
        if (!candles || candles.length < 30) {
          return {
            id: 'ichimoku_cloud',
            name: 'Ichimoku Cloud',
            subScore: 50,
            signal: 'NEUTRAL',
            rawOutput: { cmp: 100, tenkan: 100, kijun: 100 },
            summary: 'Insufficient data for Ichimoku',
            weight: 0.10
          };
        }

        const len = candles.length;
        const cmp = candles[len - 1].close;

        // Tenkan-sen (9 periods)
        let tHigh = -Infinity, tLow = Infinity;
        for (let i = len - 9; i < len; i++) {
          tHigh = Math.max(tHigh, candles[i].high ?? candles[i].close);
          tLow = Math.min(tLow, candles[i].low ?? candles[i].close);
        }
        const tenkan = (tHigh + tLow) / 2;

        // Kijun-sen (26 periods)
        let kHigh = -Infinity, kLow = Infinity;
        for (let i = len - 26; i < len; i++) {
          kHigh = Math.max(kHigh, candles[i].high ?? candles[i].close);
          kLow = Math.min(kLow, candles[i].low ?? candles[i].close);
        }
        const kijun = (kHigh + kLow) / 2;

        const aboveCloud = cmp > tenkan && tenkan > kijun;
        const belowCloud = cmp < tenkan && tenkan < kijun;

        let subScore = 50;
        let signal: IndicatorResult['signal'] = 'NEUTRAL';

        if (aboveCloud) {
          subScore = 80;
          signal = 'BULLISH';
        } else if (belowCloud) {
          subScore = 20;
          signal = 'BEARISH';
        } else if (cmp > kijun) {
          subScore = 65;
          signal = 'BULLISH';
        } else {
          subScore = 35;
          signal = 'BEARISH';
        }

        return {
          id: 'ichimoku_cloud',
          name: 'Ichimoku Cloud',
          subScore,
          signal,
          rawOutput: {
            cmp: Number(cmp.toFixed(2)),
            tenkan: Number(tenkan.toFixed(2)),
            kijun: Number(kijun.toFixed(2)),
            tenkanOverKijun: tenkan > kijun
          },
          summary: `CMP (₹${cmp.toFixed(1)}) is ${cmp > kijun ? 'above' : 'below'} Kijun-sen (₹${kijun.toFixed(1)}), Tenkan: ₹${tenkan.toFixed(1)}`,
          weight: 0.10
        };
      }
    });

    // 3. SuperTrend Plugin
    this.registerPlugin({
      id: 'supertrend_10_3',
      name: 'SuperTrend (10, 3)',
      description: 'ATR-based volatility trailing band trend follower.',
      category: 'MOMENTUM',
      defaultWeight: 0.08,
      calculate: (candles) => {
        if (!candles || candles.length < 20) {
          return {
            id: 'supertrend_10_3',
            name: 'SuperTrend',
            subScore: 50,
            signal: 'NEUTRAL',
            rawOutput: { isBullish: true, band: 100 },
            summary: 'Insufficient data for SuperTrend',
            weight: 0.08
          };
        }

        const len = candles.length;
        const cmp = candles[len - 1].close;

        // Approximate 10-period ATR
        let sumTR = 0;
        for (let i = len - 10; i < len; i++) {
          const h = candles[i].high ?? candles[i].close;
          const l = candles[i].low ?? candles[i].close;
          const pc = candles[i - 1]?.close ?? l;
          sumTR += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        }
        const atr = sumTR / 10;
        const multiplier = 3;

        const upperBand = cmp + multiplier * atr;
        const lowerBand = Math.max(0, cmp - multiplier * atr);
        const isBullish = cmp > (candles[len - 2]?.close ?? cmp);

        const subScore = isBullish ? 75 : 25;

        return {
          id: 'supertrend_10_3',
          name: 'SuperTrend',
          subScore,
          signal: isBullish ? 'BULLISH' : 'BEARISH',
          rawOutput: {
            isBullish,
            atr: Number(atr.toFixed(2)),
            band: Number((isBullish ? lowerBand : upperBand).toFixed(2))
          },
          summary: `SuperTrend is ${isBullish ? 'BULLISH (support at ₹' + lowerBand.toFixed(1) + ')' : 'BEARISH (overhead band at ₹' + upperBand.toFixed(1) + ')'}`,
          weight: 0.08
        };
      }
    });
  }
}
