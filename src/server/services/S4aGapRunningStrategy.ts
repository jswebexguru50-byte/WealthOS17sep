import type { Candle, RuleCheck } from './PureTechnicalStrategiesEngine.js';

/** S4a: Trading breakouts with gaps in running stocks. Only stated rules are evaluated. */
export interface S4aConfig {
  weeklyPivotBars: number;
  priceFloor: number;
  marketCapFloorCr: number;
  movingAveragePeriod: number;
  gapUpMinPct: number;
  pullbackAtrMaxRatio: number;
  supplyDryUpMaxRatio: number;
  stopBelowLowestLowPct: number;
}

export const S4A_DEFAULTS: Readonly<S4aConfig> = Object.freeze({
  weeklyPivotBars: 5,
  priceFloor: 50,
  marketCapFloorCr: 20_000,
  movingAveragePeriod: 20,
  gapUpMinPct: 2,
  pullbackAtrMaxRatio: 0.50,
  supplyDryUpMaxRatio: 0.85,
  stopBelowLowestLowPct: 1,
});

export interface S4aContext {
  marketCapCr?: number;
  weeklyCandles?: Candle[];
  /** Each benchmark must be a real daily series keyed as NIFTY_500, NIFTY_MIDCAP, NIFTY_SMALLCAP. */
  broadMarketCandles?: Partial<Record<'NIFTY_500' | 'NIFTY_MIDCAP' | 'NIFTY_SMALLCAP', Candle[]>>;
  hourlyCandles?: Candle[];
  /** Supplied by the hourly RSI-support provider; S4a deliberately does not invent a support level. */
  hourlyRsiSupport?: boolean;
}

export interface S4aResult {
  qualified: boolean; symbol: string; companyName: string; cmp: number;
  weeklyPivotDate: string | null; gapUpPct: number | null; pullbackAtrRatio: number | null;
  supplyDryUpRatio: number | null;
  previousSwingHigh: number | null; entryTrigger: 'DAILY_SWING_HIGH_BREAK' | 'HOURLY_BULLISH_RSI_SUPPORT' | null;
  recommendedEntryPrice: number | null; stopLoss: number | null; ruleChecks: RuleCheck[];
}

const sma = (candles: Candle[], period: number): number | null => {
  if (candles.length < period) return null;
  return candles.slice(-period).reduce((sum, candle) => sum + candle.close, 0) / period;
};

const ema = (candles: Candle[], period: number): number | null => {
  if (candles.length < period) return null;
  const alpha = 2 / (period + 1);
  let value = candles.slice(0, period).reduce((sum, candle) => sum + candle.close, 0) / period;
  for (const candle of candles.slice(period)) value = candle.close * alpha + value * (1 - alpha);
  return value;
};

const trueRange = (candles: Candle[], index: number): number => {
  const candle = candles[index];
  const priorClose = index ? candles[index - 1].close : candle.close;
  return Math.max(candle.high - candle.low, Math.abs(candle.high - priorClose), Math.abs(candle.low - priorClose));
};

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

/** A confirmed five-bar pivot: two bars on each side of the middle bar. */
function latestWeeklyPivot5(candles: Candle[], width: number): number | null {
  const radius = Math.floor(width / 2);
  if (width !== radius * 2 + 1 || candles.length < width) return null;
  for (let i = candles.length - radius - 1; i >= radius; i--) {
    const window = candles.slice(i - radius, i + radius + 1);
    const pivot = candles[i];
    const high = window.every((item, offset) => offset === radius || pivot.high > item.high);
    const low = window.every((item, offset) => offset === radius || pivot.low < item.low);
    if (high || low) return i;
  }
  return null;
}

function latestDailySwings(candles: Candle[]): { impulseLow: number; swingHigh: number; pullbackLow: number } | null {
  const radius = 2;
  const highs: number[] = [], lows: number[] = [];
  for (let i = radius; i < candles.length - radius; i++) {
    const window = candles.slice(i - radius, i + radius + 1);
    if (window.every((item, offset) => offset === radius || candles[i].high > item.high)) highs.push(i);
    if (window.every((item, offset) => offset === radius || candles[i].low < item.low)) lows.push(i);
  }
  const swingHigh = highs.at(-1);
  if (swingHigh === undefined) return null;
  const impulseLow = [...lows].reverse().find(index => index < swingHigh);
  const pullbackLow = lows.find(index => index > swingHigh);
  if (impulseLow === undefined || pullbackLow === undefined) return null;
  return { impulseLow, swingHigh, pullbackLow };
}

export function evaluateS4a(
  daily: Candle[], symbol: string, companyName = symbol, context: S4aContext = {}, overrides: Partial<S4aConfig> = {},
): S4aResult {
  const cfg = { ...S4A_DEFAULTS, ...overrides };
  const fail: S4aResult = {
    qualified: false, symbol, companyName, cmp: daily.at(-1)?.close ?? 0, weeklyPivotDate: null,
    gapUpPct: null, pullbackAtrRatio: null, supplyDryUpRatio: null,
    previousSwingHigh: null, entryTrigger: null, recommendedEntryPrice: null, stopLoss: null, ruleChecks: [],
  };
  const check = (id: string, name: string, passed: boolean, actualValue: string | number, benchmarkRule: string, explanation: string) =>
    fail.ruleChecks.push({ id, name, passed, actualValue, benchmarkRule, explanation });

  if (daily.length < 200) {
    check('DAILY_HISTORY', 'Daily history', false, `${daily.length} bars`, '>= 200 daily bars', 'Needed only for the stated SMA200 rule.');
    return fail;
  }
  const current = daily.at(-1)!;
  const pricePassed = current.close >= cfg.priceFloor;
  check('PRICE_FLOOR', 'Not a penny stock', pricePassed, current.close, `Close >= ₹${cfg.priceFloor}`, 'Stated ₹50 price floor.');

  const capPassed = typeof context.marketCapCr === 'number' && context.marketCapCr >= cfg.marketCapFloorCr;
  check('MARKET_CAP', 'Large/high market-cap midcap', capPassed, context.marketCapCr ?? 'Unavailable', `>= ₹${cfg.marketCapFloorCr} Cr`, 'Uses supplied market-cap data only.');

  const sma50 = sma(daily, 50), sma200 = sma(daily, 200);
  const trendPassed = sma50 !== null && sma200 !== null && current.close > sma50 && current.close > sma200;
  check('TREND', 'Price above 50 and 200 SMA', trendPassed, `Close ${current.close}; SMA50 ${sma50}; SMA200 ${sma200}`, 'Close > SMA50 and SMA200', 'Stated trend rule.');

  const weekly = context.weeklyCandles ?? [];
  const pivot = latestWeeklyPivot5(weekly, cfg.weeklyPivotBars);
  fail.weeklyPivotDate = pivot === null ? null : weekly[pivot].date;
  check('WEEKLY_PIVOT_5', 'Confirmed weekly pivot-5', pivot !== null, fail.weeklyPivotDate ?? 'Unavailable', `${cfg.weeklyPivotBars}-bar confirmed weekly pivot`, 'Uses a strict five-bar weekly fractal; no look-ahead beyond the confirmation bars.');

  const benchmarkKeys: Array<'NIFTY_500' | 'NIFTY_MIDCAP' | 'NIFTY_SMALLCAP'> = ['NIFTY_500', 'NIFTY_MIDCAP', 'NIFTY_SMALLCAP'];
  const marketStates = benchmarkKeys.map(key => {
    const series = context.broadMarketCandles?.[key] ?? [];
    const averageSma = sma(series, cfg.movingAveragePeriod);
    const averageEma = ema(series, cfg.movingAveragePeriod);
    const close = series.at(-1)?.close;
    return { key, close, averageSma, averageEma, passed: close !== undefined && ((averageSma !== null && close > averageSma) || (averageEma !== null && close > averageEma)) };
  });
  const marketPassed = marketStates.every(state => state.passed);
  check('BROAD_MARKET', 'Broad markets bullish', marketPassed,
    marketStates.map(state => `${state.key}:${state.passed ? 'above' : 'not above/unavailable'}`).join(', '),
    'Nifty 500, Midcap and Smallcap each above SMA20 or EMA20', 'Stated broad-market gate.');

  const previousDailyClose = daily.at(-2)?.close;
  fail.gapUpPct = previousDailyClose === undefined ? null : ((current.open / previousDailyClose) - 1) * 100;
  const gapPassed = fail.gapUpPct !== null && fail.gapUpPct >= cfg.gapUpMinPct;
  check('GAP_UP', 'Clean daily opening gap-up', gapPassed, fail.gapUpPct ?? 'Unavailable', `Daily open >= ${cfg.gapUpMinPct}% above the immediately prior daily close`, 'Only the current daily open and previous trading session close are used.');

  const swings = latestDailySwings(daily);
  if (!swings) {
    check('PULLBACK', 'ATR and supply dry-up pullback', false, 'No confirmed daily swing sequence', 'Pullback ATR <= 50% of ATR(14) and final-five-session volume <= 85% of VMA(20)', 'Cannot calculate the stated pullback rule without confirmed daily swings.');
    check('ENTRY', 'Buy trigger', false, 'No daily swing sequence', 'Daily swing-high break OR bullish hourly candle on RSI support', 'No entry trigger can be tested.');
    return fail;
  }
  const previousSwingHigh = daily[swings.swingHigh].high;
  fail.previousSwingHigh = previousSwingHigh;
  const pullback = daily.slice(swings.swingHigh + 1, swings.pullbackLow + 1);
  const pullbackAtr = mean(pullback.map((_, index) => trueRange(daily, swings.swingHigh + 1 + index)));
  const atr14Window = daily.slice(Math.max(0, swings.pullbackLow - 13), swings.pullbackLow + 1);
  const atr14 = atr14Window.length === 14
    ? mean(atr14Window.map((_, index) => trueRange(daily, swings.pullbackLow - 13 + index))) : null;
  fail.pullbackAtrRatio = atr14 === null ? null : pullbackAtr / Math.max(Number.EPSILON, atr14);
  const finalFiveBase = pullback.slice(-5);
  const vma20Window = daily.slice(Math.max(0, swings.pullbackLow - 19), swings.pullbackLow + 1);
  const vma20 = vma20Window.length === 20 ? mean(vma20Window.map(candle => candle.volume)) : null;
  fail.supplyDryUpRatio = finalFiveBase.length === 5 && vma20 !== null
    ? mean(finalFiveBase.map(candle => candle.volume)) / Math.max(Number.EPSILON, vma20) : null;
  const pullbackPassed = fail.pullbackAtrRatio !== null && fail.supplyDryUpRatio !== null &&
    fail.pullbackAtrRatio <= cfg.pullbackAtrMaxRatio && fail.supplyDryUpRatio <= cfg.supplyDryUpMaxRatio;
  check('PULLBACK', 'ATR and supply dry-up pullback', pullbackPassed,
    `Pullback ATR / ATR(14): ${fail.pullbackAtrRatio?.toFixed(2) ?? 'Unavailable'}x; final 5 / VMA(20): ${fail.supplyDryUpRatio?.toFixed(2) ?? 'Unavailable'}x`,
    `Pullback ATR / ATR(14) <= ${cfg.pullbackAtrMaxRatio}; final 5-session base volume / VMA(20) <= ${cfg.supplyDryUpMaxRatio}`,
    'This replaces the earlier pullback retracement and relative VPA checks.');

  const dailyBreak = current.high > previousSwingHigh;
  const hourly = context.hourlyCandles?.at(-1);
  const hourlyBullishRsiSupport = Boolean(hourly && hourly.close > hourly.open && context.hourlyRsiSupport === true);
  fail.entryTrigger = dailyBreak ? 'DAILY_SWING_HIGH_BREAK' : hourlyBullishRsiSupport ? 'HOURLY_BULLISH_RSI_SUPPORT' : null;
  const entryPassed = Boolean(fail.entryTrigger);
  check('ENTRY', 'Buy trigger', entryPassed, fail.entryTrigger ?? 'Not triggered',
    'Daily previous swing-high break OR bullish hourly candle on supplied RSI support', 'The hourly RSI-support flag must come from a real RSI-support provider; no support level is invented.');

  const lowestDailyLow = Math.min(...daily.map(candle => candle.low));
  fail.stopLoss = lowestDailyLow * (1 - cfg.stopBelowLowestLowPct / 100);
  fail.recommendedEntryPrice = entryPassed ? (dailyBreak ? previousSwingHigh : hourly!.close) : null;
  check('STOP', 'Stop loss', true, fail.stopLoss, `${cfg.stopBelowLowestLowPct}% below lowest daily low`, 'Stated stop-loss rule.');

  fail.qualified = [pricePassed, capPassed, trendPassed, pivot !== null, marketPassed, gapPassed, pullbackPassed, entryPassed].every(Boolean);
  return fail;
}
