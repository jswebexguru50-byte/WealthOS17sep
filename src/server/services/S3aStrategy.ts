import type { Candle, RuleCheck } from './PureTechnicalStrategiesEngine.js';

/** Independent daily-bar S3a variant. All decisions use bars at or before the signal. */
export interface S3aConfig {
  smaPeriod: number;
  smaRiseBars: number;
  atrPeriod: number;
  pivotRadius: number;
  structureLookbackBars: number;
  precedingMoveLookbackBars: number;
  precedingMoveMinPct: number;
  atrCompressionMaxRatio: number;
  dojiMaxBodyRatio: number;
  marubozuMinBodyRatio: number;
  marubozuMinBodyAtrMultiple: number;
  hammerMinLowerWickBodyRatio: number;
  hammerMaxUpperWickRangeRatio: number;
  piercingMinPenetration: number;
  haramiMaxBodyRatio: number;
  haramiMinPriorBodyRatio: number;
  requireBullishPivotCandles: boolean;
}

export const S3A_DEFAULTS: Readonly<S3aConfig> = Object.freeze({
  smaPeriod: 50, smaRiseBars: 1, atrPeriod: 14, pivotRadius: 2,
  structureLookbackBars: 60, precedingMoveLookbackBars: 5,
  precedingMoveMinPct: 20, atrCompressionMaxRatio: 1,
  dojiMaxBodyRatio: 0.10, marubozuMinBodyRatio: 0.90,
  marubozuMinBodyAtrMultiple: 1, hammerMinLowerWickBodyRatio: 2,
  hammerMaxUpperWickRangeRatio: 0.15, piercingMinPenetration: 0.50,
  haramiMaxBodyRatio: 0.50, haramiMinPriorBodyRatio: 0.50,
  requireBullishPivotCandles: true,
});

export interface S3aResult {
  qualified: boolean; symbol: string; companyName: string; cmp: number;
  p0: number | null; h1: number | null; l1: number | null;
  h2: number | null; l2: number | null;
  p0Date?: string; h1Date?: string; l1Date?: string;
  h2Date?: string; l2Date?: string;
  precedingMovePct: number | null; atrCompressionRatio: number | null;
  sma50AtSignal: number | null; pivotPatterns: Record<string, string[]>;
  recommendedEntryPrice: number | null; stopLoss: number | null;
  target1: number | null; target2: number | null; riskRewardRatio: number | null;
  ruleChecks: RuleCheck[];
}

export function evaluateS3a(input: Candle[], symbol: string, companyName = symbol, overrides: Partial<S3aConfig> = {}): S3aResult {
  const cfg = { ...S3A_DEFAULTS, ...overrides };
  const fail: S3aResult = { qualified: false, symbol, companyName, cmp: input.at(-1)?.close ?? 0,
    p0: null, h1: null, l1: null, h2: null, l2: null, precedingMovePct: null,
    atrCompressionRatio: null, sma50AtSignal: null, pivotPatterns: {},
    recommendedEntryPrice: null, stopLoss: null, target1: null, target2: null,
    riskRewardRatio: null, ruleChecks: [] };
  const minBars = cfg.smaPeriod + cfg.smaRiseBars + cfg.structureLookbackBars;
  if (input.length < minBars) {
    fail.ruleChecks.push({ id: 'DATA', name: 'Daily history', passed: false,
      actualValue: `${input.length} bars`, benchmarkRule: `>= ${minBars} bars`, explanation: 'Insufficient adjusted daily history.' });
    return fail;
  }
  const c = input;
  const n = c.length;
  const sma = Array<number>(n).fill(NaN);
  const atr = Array<number>(n).fill(NaN);
  let closeSum = 0, trSum = 0;
  for (let i = 0; i < n; i++) {
    closeSum += c[i].close;
    if (i >= cfg.smaPeriod) closeSum -= c[i - cfg.smaPeriod].close;
    if (i >= cfg.smaPeriod - 1) sma[i] = closeSum / cfg.smaPeriod;
    const tr = Math.max(c[i].high - c[i].low,
      i ? Math.abs(c[i].high - c[i - 1].close) : 0,
      i ? Math.abs(c[i].low - c[i - 1].close) : 0);
    trSum += tr;
    if (i >= cfg.atrPeriod) {
      const old = c[i - cfg.atrPeriod];
      const prior = i - cfg.atrPeriod > 0 ? c[i - cfg.atrPeriod - 1] : null;
      trSum -= Math.max(old.high - old.low, prior ? Math.abs(old.high - prior.close) : 0,
        prior ? Math.abs(old.low - prior.close) : 0);
    }
    if (i >= cfg.atrPeriod - 1) atr[i] = trSum / cfg.atrPeriod;
  }
  const patterns = (i: number): string[] => {
    if (i < 1) return [];
    const x = c[i], prev = c[i - 1], range = x.high - x.low;
    const body = Math.abs(x.close - x.open);
    if (range <= 0 || body / range <= cfg.dojiMaxBodyRatio || x.close <= x.open) return [];
    const out: string[] = [];
    if (body / range >= cfg.marubozuMinBodyRatio && body >= cfg.marubozuMinBodyAtrMultiple * atr[i]) out.push('BULLISH_MARUBOZU');
    if ((x.open - x.low) / body >= cfg.hammerMinLowerWickBodyRatio &&
      (x.high - x.close) / range <= cfg.hammerMaxUpperWickRangeRatio) out.push('BULLISH_HAMMER');
    const prevBody = Math.abs(prev.close - prev.open), prevRange = prev.high - prev.low;
    if (prev.close < prev.open && x.open <= Math.min(prev.low, prev.close) &&
      x.close >= prev.close + prevBody * cfg.piercingMinPenetration) out.push('BULLISH_PIERCING');
    if (prev.close < prev.open && prevRange > 0 && prevBody / prevRange >= cfg.haramiMinPriorBodyRatio &&
      body / prevBody <= cfg.haramiMaxBodyRatio && x.open >= prev.close && x.close <= prev.open) out.push('BULLISH_HARAMI');
    if (prev.close < prev.open && x.open <= prev.close && x.close >= prev.open) out.push('BULLISH_ENGULFING');
    return out;
  };
  const radius = cfg.pivotRadius;
  const start = Math.max(cfg.smaPeriod + cfg.smaRiseBars, n - cfg.structureLookbackBars);
  const peaks: number[] = [], troughs: number[] = [];
  for (let i = start; i < n - radius; i++) {
    let high = true, low = true;
    for (let k = i - radius; k <= i + radius; k++) {
      if (k === i) continue;
      if (c[k].high >= c[i].high) high = false;
      if (c[k].low <= c[i].low) low = false;
    }
    if (high) peaks.push(i);
    if (low) troughs.push(i);
  }
  const avgAtr = (a: number, b: number): number => {
    let sum = 0;
    for (let i = a; i <= b; i++) sum += atr[i];
    return sum / (b - a + 1);
  };
  for (const l2 of [...troughs].reverse()) {
    for (const h2 of peaks.filter(i => i < l2).reverse()) {
      for (const l1 of troughs.filter(i => i < h2).reverse()) {
        for (const h1 of peaks.filter(i => i < l1).reverse()) {
          if (!(c[h2].high > c[h1].high && c[l2].low > c[l1].low)) continue;
          const floor = c[l1].low;
          const p0Start = Math.max(0, h1 - cfg.precedingMoveLookbackBars);
          let p0 = p0Start;
          for (let i = p0Start + 1; i < h1; i++) if (c[i].low < c[p0].low) p0 = i;
          const movePct = (c[h1].high / c[p0].low - 1) * 100;
          if (movePct < cfg.precedingMoveMinPct) continue;
          let aboveRisingSma = true;
          for (let i = h1; i < n; i++) {
            if (!(c[i].low > sma[i] && sma[i] > sma[i - cfg.smaRiseBars])) { aboveRisingSma = false; break; }
          }
          if (!aboveRisingSma) continue;
          const compression = avgAtr(h2 + 1, l2) / avgAtr(h1 + 1, l1);
          if (!(compression < cfg.atrCompressionMaxRatio)) continue;
          const pivotPatterns = { H1: patterns(h1), L1: patterns(l1), H2: patterns(h2), L2: patterns(l2) };
          if (cfg.requireBullishPivotCandles && Object.values(pivotPatterns).some(v => !v.length)) continue;
          const entry = c[n - 1].close, stop = floor < c[l2].low ? c[l2].low : floor;
          const target1 = c[h2].high, risk = entry - stop;
          return { ...fail, qualified: true, p0: c[p0].low, h1: c[h1].high, l1: floor,
            h2: c[h2].high, l2: c[l2].low, p0Date: c[p0].date, h1Date: c[h1].date,
            l1Date: c[l1].date, h2Date: c[h2].date, l2Date: c[l2].date,
            precedingMovePct: movePct, atrCompressionRatio: compression,
            sma50AtSignal: sma[n - 1], pivotPatterns, recommendedEntryPrice: entry,
            stopLoss: stop, target1, target2: target1 + (target1 - floor),
            riskRewardRatio: risk > 0 ? (target1 - entry) / risk : null,
            ruleChecks: [
              { id: 'HH_HL', name: 'Dow structure', passed: true, actualValue: `H2 ${c[h2].high} > H1 ${c[h1].high}; L2 ${c[l2].low} > L1 ${floor}`, benchmarkRule: 'Strict HH and HL', explanation: 'Confirmed local pivots.' },
              { id: 'SMA50', name: 'Rising SMA50 floor', passed: true, actualValue: sma[n - 1], benchmarkRule: 'Every structure low > rising SMA50', explanation: 'Checked each bar from H1 to signal.' },
              { id: 'ATR', name: 'ATR compression', passed: true, actualValue: compression, benchmarkRule: `< ${cfg.atrCompressionMaxRatio}`, explanation: 'Second pullback ATR versus first.' },
              { id: 'SMC_CANDLES', name: 'Bullish pivot candles', passed: true, actualValue: JSON.stringify(pivotPatterns), benchmarkRule: 'S1A bullish patterns at H1/L1/H2/L2', explanation: 'Same five pattern definitions and doji exclusion as S1A.' },
              { id: 'PRECEDING_MOVE', name: 'Preceding move', passed: true, actualValue: movePct, benchmarkRule: `>= ${cfg.precedingMoveMinPct}%`, explanation: 'P0 low to H1 high.' },
            ] };
        }
      }
    }
  }
  fail.ruleChecks.push({ id: 'S3A_SETUP', name: 'Complete S3a setup', passed: false,
    actualValue: 'No qualifying pivot sequence', benchmarkRule: 'HH/HL + 20% impulse + rising SMA50 + ATR compression + S1A candles',
    explanation: 'One or more mandatory gates failed.' });
  return fail;
}
