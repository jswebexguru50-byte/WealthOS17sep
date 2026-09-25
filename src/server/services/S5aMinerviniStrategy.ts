import type { Candle, RuleCheck } from './PureTechnicalStrategiesEngine.js';

/** S5a: Mark Minervini winning-stocks setup.  No unstated qualification rules are applied. */
export interface S5aConfig {
  priceFloor: number;
  weeksInYear: number;
  near52WeekHighMaxDiscountPct: number;
  above52WeekLowMinPct: number;
  sma50Period: number;
  sma200Period: number;
  dma200RisingBars: number;
  highRecurrenceMinWeeks: number;
  highRecurrenceMaxWeeks: number;
  minVcpCandles: number;
  maxVcpCandles: number;
  minVcpCount: number;
  maxVcpCount: number;
  secondVcpMinContractionPct: number;
  supplyDryUpMaxRatio: number;
  atrPeriod: number;
  atrMultiple: number;
  maxStopLossPct: number;
}

export const S5A_DEFAULTS: Readonly<S5aConfig> = Object.freeze({
  priceFloor: 50, weeksInYear: 52, near52WeekHighMaxDiscountPct: 25, above52WeekLowMinPct: 100,
  sma50Period: 50, sma200Period: 200, dma200RisingBars: 65,
  highRecurrenceMinWeeks: 16, highRecurrenceMaxWeeks: 26,
  minVcpCandles: 3, maxVcpCandles: 5, minVcpCount: 2, maxVcpCount: 3,
  secondVcpMinContractionPct: 70, supplyDryUpMaxRatio: 0.85, atrPeriod: 20, atrMultiple: 2, maxStopLossPct: 10,
});

/**
 * VCP and swing-high identification are chart-structure inputs. They are supplied by the
 * charting/data layer because the business brief does not define a pivot algorithm.
 */
export interface S5aVcpContraction {
  /** Daily date ending this VCP base; used to calculate its final-5-session supply dry-up ratio. */
  endDate: string;
  candleCount: number;
  swingHigh: number;
  swingLow: number;
}

export interface S5aContext {
  weeklyCandles?: Candle[];
  vcpContractions?: S5aVcpContraction[];
  previousDailySwingHigh?: number;
}

export interface S5aResult {
  qualified: boolean; symbol: string; companyName: string; cmp: number;
  weekly52High: number | null; weekly52Low: number | null; discountFrom52HighPct: number | null;
  gainFrom52LowPct: number | null; sma50: number | null; sma200: number | null;
  highRecurrenceWeeks: number | null; vcpCount: number; previousSwingHigh: number | null;
  supplyDryUpRatio: number | null;
  entryPrice: number | null; atr20: number | null; stopLoss: number | null; stopLossPct: number | null;
  monitoring: { greenDaysMoreThanRed: boolean | null; upVolumeGreaterThanDownVolume: boolean | null; tennisBallAction: null; shallowPullbacks: null };
  ruleChecks: RuleCheck[];
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const smaAt = (candles: Candle[], period: number, end = candles.length): number | null =>
  end < period ? null : mean(candles.slice(end - period, end).map(candle => candle.close));

const atr = (candles: Candle[], period: number): number | null => {
  if (candles.length < period + 1) return null;
  return mean(candles.slice(-period).map((candle, offset) => {
    const prior = candles[candles.length - period + offset - 1].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - prior), Math.abs(candle.low - prior));
  }));
};

export function evaluateS5a(
  daily: Candle[], symbol: string, companyName = symbol, context: S5aContext = {}, overrides: Partial<S5aConfig> = {},
): S5aResult {
  const cfg = { ...S5A_DEFAULTS, ...overrides };
  const result: S5aResult = {
    qualified: false, symbol, companyName, cmp: daily.at(-1)?.close ?? 0, weekly52High: null, weekly52Low: null,
    discountFrom52HighPct: null, gainFrom52LowPct: null, sma50: null, sma200: null, highRecurrenceWeeks: null,
    vcpCount: context.vcpContractions?.length ?? 0, previousSwingHigh: context.previousDailySwingHigh ?? null, supplyDryUpRatio: null,
    entryPrice: null, atr20: null, stopLoss: null, stopLossPct: null,
    monitoring: { greenDaysMoreThanRed: null, upVolumeGreaterThanDownVolume: null, tennisBallAction: null, shallowPullbacks: null }, ruleChecks: [],
  };
  const check = (id: string, name: string, passed: boolean, actualValue: string | number, benchmarkRule: string, explanation: string) =>
    result.ruleChecks.push({ id, name, passed, actualValue, benchmarkRule, explanation });
  const current = daily.at(-1);
  if (!current) { check('DAILY_HISTORY', 'Daily candles', false, 'Unavailable', 'Daily OHLCV required', 'Required for the daily moving averages, entry and ATR stop.'); return result; }

  const pricePassed = current.close >= cfg.priceFloor;
  check('PRICE_FLOOR', 'Not a penny stock', pricePassed, current.close, `Close >= ₹${cfg.priceFloor}`, 'Stated price floor.');
  const weekly = context.weeklyCandles ?? [];
  const yearly = weekly.slice(-cfg.weeksInYear);
  if (yearly.length < cfg.weeksInYear) {
    check('WEEKLY_HISTORY', '52-week weekly history', false, `${yearly.length} weeks`, `${cfg.weeksInYear} weekly candles`, 'Weekly charts are required for the candidate list.');
  } else {
    result.weekly52High = Math.max(...yearly.map(candle => candle.high));
    result.weekly52Low = Math.min(...yearly.map(candle => candle.low));
    result.discountFrom52HighPct = (1 - current.close / result.weekly52High) * 100;
    result.gainFrom52LowPct = (current.close / result.weekly52Low - 1) * 100;
    check('NEAR_52W_HIGH', 'Within 25% of 52-week high', result.discountFrom52HighPct <= cfg.near52WeekHighMaxDiscountPct,
      `${result.discountFrom52HighPct.toFixed(2)}% below high`, `<= ${cfg.near52WeekHighMaxDiscountPct}% below 52-week high`, 'Stated prerequisite.');
    check('ABOVE_52W_LOW', 'At least 100% above 52-week low', result.gainFrom52LowPct >= cfg.above52WeekLowMinPct,
      `${result.gainFrom52LowPct.toFixed(2)}% above low`, `>= ${cfg.above52WeekLowMinPct}% above 52-week low`, 'Stated prerequisite.');
    const recordHighs: number[] = [];
    for (let i = 0; i < weekly.length; i++) {
      const prior = weekly.slice(Math.max(0, i - cfg.weeksInYear), i);
      if (prior.length === cfg.weeksInYear && weekly[i].high >= Math.max(...prior.map(candle => candle.high))) recordHighs.push(i);
    }
    const latestHigh = recordHighs.at(-1);
    const recurringHigh = latestHigh === undefined ? undefined : [...recordHighs].reverse().find(index => {
      const gap = latestHigh - index; return gap >= cfg.highRecurrenceMinWeeks && gap <= cfg.highRecurrenceMaxWeeks;
    });
    result.highRecurrenceWeeks = latestHigh !== undefined && recurringHigh !== undefined ? latestHigh - recurringHigh : null;
    check('HIGH_RECURRENCE', '52-week high every 4–6 months', result.highRecurrenceWeeks !== null, result.highRecurrenceWeeks ?? 'No qualifying pair',
      `${cfg.highRecurrenceMinWeeks}–${cfg.highRecurrenceMaxWeeks} weeks between 52-week-high events`, 'Uses weekly 52-week-high events only.');
  }

  result.sma50 = smaAt(daily, cfg.sma50Period);
  result.sma200 = smaAt(daily, cfg.sma200Period);
  const priorSma200 = smaAt(daily, cfg.sma200Period, daily.length - cfg.dma200RisingBars);
  const trendPassed = result.sma50 !== null && result.sma200 !== null && priorSma200 !== null &&
    result.sma200 > priorSma200 && result.sma50 > result.sma200 && current.close > result.sma200;
  check('TREND', '200 DMA rising; 50 DMA above 200 DMA; price above 200 DMA', trendPassed,
    `Close ${current.close}; SMA50 ${result.sma50}; SMA200 ${result.sma200}; prior SMA200 ${priorSma200}`,
    `SMA200 rising over ${cfg.dma200RisingBars} daily bars; SMA50 > SMA200; Close > SMA200`, '“Preferably above 50 DMA” is reported only, not made into a hidden gate.');
  check('PREFER_ABOVE_50DMA', 'Price above 50 DMA (preference)', result.sma50 !== null && current.close > result.sma50,
    result.sma50 === null ? 'Unavailable' : current.close, 'Preferably Close > SMA50', 'Informational preference, not a qualification rule.');

  const vcps = context.vcpContractions ?? [];
  const vcpBarsPassed = vcps.every(vcp => vcp.candleCount >= cfg.minVcpCandles && vcp.candleCount <= cfg.maxVcpCandles);
  const contractions = vcps.map(vcp => (1 - vcp.swingLow / vcp.swingHigh) * 100);
  const progressivelyLower = contractions.every((value, index) => index === 0 || value < contractions[index - 1]);
  const vcpCountPassed = vcps.length >= cfg.minVcpCount && vcps.length <= cfg.maxVcpCount &&
    (vcps.length !== 2 || (contractions[1] ?? -Infinity) >= cfg.secondVcpMinContractionPct);
  const latestVcpEndIndex = vcps.length ? daily.findIndex(candle => candle.date === vcps.at(-1)!.endDate) : -1;
  const finalFiveBase = latestVcpEndIndex >= 4 ? daily.slice(latestVcpEndIndex - 4, latestVcpEndIndex + 1) : [];
  const vma20Window = latestVcpEndIndex >= 19 ? daily.slice(latestVcpEndIndex - 19, latestVcpEndIndex + 1) : [];
  result.supplyDryUpRatio = finalFiveBase.length === 5 && vma20Window.length === 20
    ? mean(finalFiveBase.map(candle => candle.volume)) / Math.max(Number.EPSILON, mean(vma20Window.map(candle => candle.volume))) : null;
  const supplyPassed = result.supplyDryUpRatio !== null && result.supplyDryUpRatio <= cfg.supplyDryUpMaxRatio;
  const vcpPassed = vcps.length > 0 && vcpBarsPassed && progressivelyLower && vcpCountPassed && supplyPassed;
  check('VCP', 'Daily VCP contractions', vcpPassed,
    `${vcps.length} VCPs; contractions ${contractions.map(value => `${value.toFixed(2)}%`).join(', ') || 'Unavailable'}`,
    `${cfg.minVcpCount}–${cfg.maxVcpCount} daily VCPs of ${cfg.minVcpCandles}–${cfg.maxVcpCandles} candles, lower volatility; 2 allowed only when second contraction >= ${cfg.secondVcpMinContractionPct}%`,
    'Contraction magnitude is reported as (1 − swing low / swing high) × 100, the positive magnitude of the stated swing-low ÷ swing-high − 1 formula.');
  check('SUPPLY_DRY_UP', 'Supply dry-up ratio', supplyPassed, result.supplyDryUpRatio?.toFixed(2) ?? 'Unavailable',
    `Final 5 daily base sessions average volume / VMA(20) <= ${cfg.supplyDryUpMaxRatio}`,
    'Uses the final five daily sessions ending at the supplied latest VCP base date.');

  const entryPassed = result.previousSwingHigh !== null && current.high > result.previousSwingHigh;
  result.entryPrice = entryPassed ? result.previousSwingHigh : null;
  check('ENTRY', 'Daily previous swing-high break', entryPassed, result.previousSwingHigh ?? 'Unavailable', 'Current daily high > supplied previous daily swing high', 'Daily chart is used only for entry timing.');
  result.atr20 = atr(daily, cfg.atrPeriod);
  const rawStop = result.atr20 === null ? null : current.close - cfg.atrMultiple * result.atr20;
  const maxStop = current.close * (1 - cfg.maxStopLossPct / 100);
  result.stopLoss = rawStop === null ? null : Math.max(rawStop, maxStop);
  result.stopLossPct = result.stopLoss === null ? null : (1 - result.stopLoss / current.close) * 100;
  check('STOP', 'ATR stop loss', result.stopLoss !== null, result.stopLoss ?? 'Unavailable', `${cfg.atrMultiple} × ATR(${cfg.atrPeriod}), maximum ${cfg.maxStopLossPct}%`, 'Stop is capped at the stated maximum loss.');

  const monitor = daily.slice(-20);
  if (monitor.length) {
    const green = monitor.filter(candle => candle.close > candle.open), red = monitor.filter(candle => candle.close < candle.open);
    result.monitoring.greenDaysMoreThanRed = green.length > red.length;
    result.monitoring.upVolumeGreaterThanDownVolume = mean(green.map(candle => candle.volume)) > mean(red.map(candle => candle.volume));
  }
  check('POST_BUY', 'Post-buy monitoring', true,
    `Green>red: ${result.monitoring.greenDaysMoreThanRed}; up volume>down volume: ${result.monitoring.upVolumeGreaterThanDownVolume}; tennis-ball/shallow-pullback: not algorithmically defined`,
    'Observe green/red days, up/down volume, quick bounce and shallow pullbacks', 'Monitoring observations only; undefined qualitative items are not fabricated or used as filters.');
  result.qualified = pricePassed && yearly.length === cfg.weeksInYear && result.discountFrom52HighPct! <= cfg.near52WeekHighMaxDiscountPct &&
    result.gainFrom52LowPct! >= cfg.above52WeekLowMinPct && result.highRecurrenceWeeks !== null && trendPassed && vcpPassed && entryPassed && result.stopLoss !== null;
  return result;
}
