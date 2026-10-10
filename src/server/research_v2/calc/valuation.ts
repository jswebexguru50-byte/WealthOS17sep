import type { CalcResult } from '../domain/calc.js';
import type { CalcEnv, PeriodSpec } from './env.js';
import { specLabel } from './env.js';
import type { DatedMultiple, DcfAssumptions } from './context.js';
import type { Measure } from './measures.js';
import {
  combine, ebitdaMeasure, fcfMeasure, netDebtMeasure, noPeriod, patMeasure, pit,
  ratioResult, undefinedMeasure,
} from './measures.js';
import { toMs } from './periods.js';
import { fmt, insufficient, notApplicable, okResult } from './result.js';

const CRORE = 1e7;
/** Minimum dated observations before an own-history percentile is meaningful. */
export const MIN_HISTORY_POINTS = 12;
const DCF_GROWTH_LOW = -0.9;
const DCF_GROWTH_HIGH = 1.0;

function validDate(iso: string | undefined): iso is string {
  return typeof iso === 'string' && Number.isFinite(toMs(iso));
}

function sharesOutstanding(env: CalcEnv): Measure {
  const supplied = env.ctx.priced?.sharesOutstanding;
  if (typeof supplied === 'number' && supplied > 0) {
    return { ok: true, value: supplied, ids: [], notes: ['shares from priced input'] };
  }
  const facts = env.series('shares_outstanding').filter(fact => fact.periodType === 'POINT_IN_TIME');
  const latest = facts[facts.length - 1];
  if (!latest || typeof latest.valueCr !== 'number') return { ok: false, kind: 'MISSING', items: ['shares_outstanding'] };
  return { ok: true, value: latest.valueCr, ids: [latest.factId], notes: [] };
}

/** Market cap in crore from the priced input: stated market cap, else price x shares. Priced date must not be in the future. */
export function marketCapMeasure(env: CalcEnv): Measure {
  const priced = env.ctx.priced;
  if (!priced) return { ok: false, kind: 'MISSING', items: ['priced input (marketCapCr or price, with asOf)'] };
  if (!validDate(priced.asOf)) return { ok: false, kind: 'MISSING', items: ['priced.asOf (valid date)'] };
  if (toMs(priced.asOf) > toMs(env.ctx.asOf)) {
    return { ok: false, kind: 'MISSING', items: [`priced.asOf ${priced.asOf} is after context asOf (look-ahead)`] };
  }
  const note = `priced as of ${priced.asOf}`;
  if (typeof priced.marketCapCr === 'number' && Number.isFinite(priced.marketCapCr)) {
    return priced.marketCapCr > 0
      ? { ok: true, value: priced.marketCapCr, ids: [], notes: [note, 'market cap supplied'] }
      : undefinedMeasure(`market cap ${fmt(priced.marketCapCr)} not positive`);
  }
  if (typeof priced.price !== 'number' || !(priced.price > 0)) {
    return { ok: false, kind: 'MISSING', items: ['priced.marketCapCr or priced.price'] };
  }
  return combine([sharesOutstanding(env)], v => priced.price! * v[0] / CRORE, [note, 'market cap = price x shares']);
}

function periodLabel(env: CalcEnv, spec: PeriodSpec): string {
  return `${specLabel(spec)}@${env.ctx.priced?.asOf ?? 'unpriced'}`;
}

function multiples(env: CalcEnv, spec: PeriodSpec): CalcResult[] {
  const period = periodLabel(env, spec);
  const marketCap = marketCapMeasure(env);
  const enterprise = combine([marketCap, netDebtMeasure(env, spec.end)], v => v[0] + v[1]);
  const common = { period, numeratorLabel: 'market_cap' };
  return [
    ratioResult(env, {
      ...common, key: 'pe', name: 'Price / earnings (latest FY)', unit: 'X', numerator: marketCap,
      denominator: patMeasure(env, spec, 'ATTRIBUTABLE'), denominatorLabel: 'pat_attributable_to_owners',
      positiveDenominator: true, note: 'latest fiscal-year PAT, not TTM; negative earnings make P/E undefined',
    }),
    ratioResult(env, {
      ...common, key: 'pb', name: 'Price / book (closing equity)', unit: 'X', numerator: marketCap,
      denominator: pit(env, spec.end, 'equity_total'), denominatorLabel: 'equity_total',
      positiveDenominator: true,
    }),
    ratioResult(env, {
      ...common, key: 'ev_ebitda', name: 'EV / EBITDA (latest FY)', unit: 'X', numerator: enterprise,
      denominator: ebitdaMeasure(env, spec), numeratorLabel: 'enterprise value (market cap + net debt)',
      denominatorLabel: 'ebitda_derived', positiveDenominator: true,
    }),
    ratioResult(env, {
      ...common, key: 'fcf_yield', name: 'FCF yield', unit: 'PCT', scale: 100, numerator: fcfMeasure(env, spec),
      denominator: marketCap, numeratorLabel: 'fcf', denominatorLabel: 'market_cap', positiveDenominator: true,
    }),
  ];
}

/** Share of history values at or below `current`, as a percentage. */
export function percentileRank(current: number, history: number[]): number {
  const atOrBelow = history.filter(value => value <= current).length;
  return (atOrBelow / history.length) * 100;
}

function historyProblem(env: CalcEnv, series: DatedMultiple[]): string | null {
  if (series.length < MIN_HISTORY_POINTS) {
    return `history has ${series.length} dated points, need at least ${MIN_HISTORY_POINTS}`;
  }
  const bad = series.some(point => !validDate(point.date) || !Number.isFinite(point.value));
  if (bad) return 'history has an undated or non-finite point';
  const future = series.filter(point => toMs(point.date) > toMs(env.ctx.asOf)).length;
  return future ? `${future} history points are dated after asOf (look-ahead)` : null;
}

function percentileFor(
  env: CalcEnv, spec: PeriodSpec, key: string, label: string, current: CalcResult | undefined,
  series: DatedMultiple[] | undefined,
): CalcResult {
  const period = periodLabel(env, spec);
  const name = `${label} own-history percentile`;
  if (!series) return insufficient(env, `${key}_percentile`, name, period, 'PCT', [`dated ${label} history series`]);
  const problem = historyProblem(env, series);
  if (problem) return insufficient(env, `${key}_percentile`, name, period, 'PCT', [problem]);
  if (!current || current.status !== 'OK' || current.value === null) {
    return insufficient(env, `${key}_percentile`, name, period, 'PCT', [`current ${label}`]);
  }
  const values = series.map(point => point.value);
  const rank = percentileRank(current.value, values);
  const formula = `share of ${values.length} dated ${label} observations <= ${fmt(current.value)}`;
  return okResult(env, `${key}_percentile`, name, period, 'PCT', rank, current.inputs, formula,
    `history ${series[0].date}..${series[series.length - 1].date} supplied by provider`);
}

function percentiles(env: CalcEnv, spec: PeriodSpec, results: CalcResult[]): CalcResult[] {
  const history = env.ctx.multipleHistory;
  const find = (key: string): CalcResult | undefined => results.find(r => r.calcId.startsWith(`${key}|`));
  const wanted: Array<[string, string, DatedMultiple[] | undefined]> = [
    ['pe', 'P/E', history?.pe], ['pb', 'P/B', history?.pb], ['ev_ebitda', 'EV/EBITDA', history?.evEbitda],
  ];
  const provided = wanted.filter(([, , series]) => series !== undefined);
  const chosen = provided.length ? provided : [wanted[0]];
  return chosen.map(([key, label, series]) => percentileFor(env, spec, key, label, find(key), series));
}

function dcfValue(base: number, growth: number, dcf: DcfAssumptions): number {
  const { discountRate: r, terminalGrowth: gT, horizonYears: n } = dcf;
  let value = 0;
  for (let t = 1; t <= n; t += 1) value += base * (1 + growth) ** t / (1 + r) ** t;
  const terminal = base * (1 + growth) ** n * (1 + gT) / (r - gT) / (1 + r) ** n;
  return value + terminal;
}

function dcfProblem(dcf: DcfAssumptions): string | null {
  const finite = [dcf.discountRate, dcf.terminalGrowth, dcf.horizonYears].every(Number.isFinite);
  if (!finite) return 'DCF assumptions are not finite';
  if (!Number.isInteger(dcf.horizonYears) || dcf.horizonYears < 1) return 'horizonYears must be an integer >= 1';
  if (dcf.discountRate <= dcf.terminalGrowth) return 'discountRate must exceed terminalGrowth';
  return null;
}

function reverseDcf(env: CalcEnv, spec: PeriodSpec): CalcResult {
  const key = 'reverse_dcf_implied_growth';
  const name = 'Reverse DCF implied FCF growth (ILLUSTRATIVE)';
  const period = periodLabel(env, spec);
  const dcf = env.ctx.dcf;
  if (!dcf) return insufficient(env, key, name, period, 'PCT', ['explicit stored DCF assumptions']);
  const problem = dcfProblem(dcf);
  if (problem) return notApplicable(env, key, name, period, 'PCT', [], 'n/a', problem);
  const inputs = combine([marketCapMeasure(env), fcfMeasure(env, spec)], v => v[0] + v[1]);
  if (!inputs.ok) {
    const missing = inputs.kind === 'MISSING' ? inputs.items : [];
    return missing.length ? insufficient(env, key, name, period, 'PCT', missing)
      : notApplicable(env, key, name, period, 'PCT', [], 'n/a', inputs.items.join('; '));
  }
  const cap = marketCapMeasure(env);
  const fcf = fcfMeasure(env, spec);
  if (!cap.ok || !fcf.ok) return insufficient(env, key, name, period, 'PCT', ['market cap or fcf']);
  const label = `illustrative; r=${dcf.discountRate}, terminal g=${dcf.terminalGrowth}, N=${dcf.horizonYears}`
    + `, assumptions ${dcf.assumptionsRef}; FCF = cfo - capex compared with equity market cap`;
  if (fcf.value <= 0) {
    return notApplicable(env, key, name, period, 'PCT', inputs.ids, 'n/a', `base FCF ${fmt(fcf.value)} not positive; ${label}`);
  }
  let low = DCF_GROWTH_LOW;
  let high = DCF_GROWTH_HIGH;
  if (dcfValue(fcf.value, low, dcf) > cap.value || dcfValue(fcf.value, high, dcf) < cap.value) {
    return notApplicable(env, key, name, period, 'PCT', inputs.ids, 'n/a',
      `no implied growth within ${DCF_GROWTH_LOW * 100}%..${DCF_GROWTH_HIGH * 100}%; ${label}`);
  }
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (dcfValue(fcf.value, mid, dcf) < cap.value) low = mid; else high = mid;
  }
  const growth = ((low + high) / 2) * 100;
  const formula = `growth g solving PV(FCF ${fmt(fcf.value)}, g, r, terminal) = market cap ${fmt(cap.value)}`;
  return okResult(env, key, name, period, 'PCT', growth, inputs.ids, formula, label);
}

/**
 * Valuation from a priced-date input (market cap or price x shares, with its date): P/E, P/B, EV/EBITDA
 * and FCF yield on the latest fiscal year; own-history percentiles only from a dated provider series;
 * an illustrative reverse DCF only from explicit stored assumptions. Never fabricates a price.
 */
export function valuationCalcs(env: CalcEnv): CalcResult[] {
  const spec = env.annualSpec();
  if (!spec) return [noPeriod(env, 'pe', 'Price / earnings', 'X', 'annual facts')];
  const core = multiples(env, spec);
  return [...core, ...percentiles(env, spec, core), reverseDcf(env, spec)];
}

