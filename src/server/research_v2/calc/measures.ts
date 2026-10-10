import type { CalcResult } from '../domain/calc.js';
import type { Fact } from '../domain/types.js';
import type { CalcEnv, PeriodSpec } from './env.js';
import { specLabel } from './env.js';
import { shiftYears } from './periods.js';
import { fmt, insufficient, notApplicable, okResult } from './result.js';

/** A number with its provenance, or the reason it could not be built. */
export type Measure =
  | { ok: true; value: number; ids: string[]; notes: string[] }
  | { ok: false; kind: 'MISSING' | 'UNDEFINED'; items: string[] };

/** The successful arm of a Measure. */
export type OkMeasure = Extract<Measure, { ok: true }>;

/** Measure for one fact; a missing fact becomes a MISSING measure named by `label`. */
export function factMeasure(fact: Fact | undefined, label: string): Measure {
  if (!fact || typeof fact.valueCr !== 'number') return { ok: false, kind: 'MISSING', items: [label] };
  return { ok: true, value: fact.valueCr, ids: [fact.factId], notes: fact.qualityFlags.map(f => `flag:${f}`) };
}

/** Annual or discrete-quarter flow fact as a measure. */
export function flow(env: CalcEnv, spec: PeriodSpec, metric: string): Measure {
  return factMeasure(env.flow(metric, spec), `${metric}@${specLabel(spec)}`);
}

/** Balance-sheet fact at a date as a measure. */
export function pit(env: CalcEnv, end: string, metric: string): Measure {
  return factMeasure(env.pit(metric, end), `${metric}@${end}`);
}

/** Constant measure with no fact behind it (used for an explicit context input). */
export function literal(value: number, note: string): Measure {
  return { ok: true, value, ids: [], notes: [note] };
}

/** Combine measures with `fn`. Missing parts win over undefined parts; notes and ids are merged. */
export function combine(parts: Measure[], fn: (values: number[]) => number, extraNotes: string[] = []): Measure {
  const missing = parts.flatMap(part => (!part.ok && part.kind === 'MISSING' ? part.items : []));
  if (missing.length) return { ok: false, kind: 'MISSING', items: missing };
  const undefinedPart = parts.find(part => !part.ok);
  if (undefinedPart && !undefinedPart.ok) return undefinedPart;
  const oks = parts as OkMeasure[];
  const value = fn(oks.map(part => part.value));
  if (!Number.isFinite(value)) return { ok: false, kind: 'UNDEFINED', items: ['result is not finite'] };
  const ids = [...new Set(oks.flatMap(part => part.ids))];
  return { ok: true, value, ids, notes: [...new Set([...oks.flatMap(p => p.notes), ...extraNotes])] };
}

/** A measure that exists in principle but is undefined for these inputs (for example a zero base). */
export function undefinedMeasure(reason: string): Measure {
  return { ok: false, kind: 'UNDEFINED', items: [reason] };
}

/** PBT before exceptional items; falls back to PBT with an explicit flag. */
export function pbtBase(env: CalcEnv, spec: PeriodSpec): Measure {
  const preferred = flow(env, spec, 'pbt_before_exceptional');
  if (preferred.ok) return preferred;
  const fallback = flow(env, spec, 'pbt');
  if (!fallback.ok) return preferred;
  return combine([fallback], v => v[0], ['PBT_INCLUDES_EXCEPTIONAL_ITEMS: pbt_before_exceptional missing']);
}

/**
 * EBITDA before exceptional items. Order: components with pbt_before_exceptional, then a stored
 * `ebitda_derived` fact, then components using PBT (flagged as including exceptional items).
 */
export function ebitdaMeasure(env: CalcEnv, spec: PeriodSpec): Measure {
  const build = (pbt: Measure, extraNotes: string[] = []): Measure => combine(
    [
      pbt, flow(env, spec, 'finance_cost'), flow(env, spec, 'depreciation_amortisation'),
      flow(env, spec, 'other_income'),
    ],
    v => v[0] + v[1] + v[2] - v[3],
    extraNotes,
  );
  const strict = build(flow(env, spec, 'pbt_before_exceptional'));
  if (strict.ok) return strict;
  const stored = flow(env, spec, 'ebitda_derived');
  if (stored.ok) return stored;
  const lenient = build(pbtBase(env, spec));
  return lenient.ok ? lenient : strict;
}

/** EBIT = PBT(before exceptional) + finance cost; the operating variant also removes other income. */
export function ebitMeasure(env: CalcEnv, spec: PeriodSpec, excludeOtherIncome: boolean): Measure {
  const parts = [pbtBase(env, spec), flow(env, spec, 'finance_cost')];
  if (!excludeOtherIncome) return combine(parts, v => v[0] + v[1]);
  return combine([...parts, flow(env, spec, 'other_income')], v => v[0] + v[1] - v[2]);
}

/** PAT attributable to owners (preferred) or total PAT, with a flag when the other one is used. */
export function patMeasure(env: CalcEnv, spec: PeriodSpec, prefer: 'ATTRIBUTABLE' | 'TOTAL'): Measure {
  const order = prefer === 'ATTRIBUTABLE'
    ? ['pat_attributable_to_owners', 'pat_total'] : ['pat_total', 'pat_attributable_to_owners'];
  const first = flow(env, spec, order[0]);
  if (first.ok) return first;
  const second = flow(env, spec, order[1]);
  if (!second.ok) return first;
  return combine([second], v => v[0], [`PAT_BASIS_FALLBACK: ${order[0]} missing, used ${order[1]}`]);
}

/** Effective tax rate = tax_expense / pbt (fraction); undefined unless PBT is positive and the rate is 0..1. */
export function effectiveTaxRate(env: CalcEnv, spec: PeriodSpec): Measure {
  const tax = flow(env, spec, 'tax_expense');
  const pbt = flow(env, spec, 'pbt');
  const rate = combine([tax, pbt], v => (v[1] > 0 ? v[0] / v[1] : Number.NaN));
  if (!rate.ok) return rate.kind === 'UNDEFINED' ? undefinedMeasure('pbt is not positive; tax rate not evidenced') : rate;
  if (rate.value < 0 || rate.value > 1) return undefinedMeasure(`tax rate ${fmt(rate.value)} outside 0..1`);
  return rate;
}

/** Capex outflow as a positive amount with its basis flagged (PPE-only vs total vs unspecified). */
export function capexMeasure(env: CalcEnv, spec: PeriodSpec): Measure {
  const fact = env.flow('capex_cash_outflow', spec);
  const measure = factMeasure(fact, `capex_cash_outflow@${specLabel(spec)}`);
  if (!measure.ok || !fact) return measure;
  const flags = fact.qualityFlags;
  const basis = flags.includes('CAPEX_PPE_ONLY') ? 'CAPEX_BASIS: PPE_ONLY'
    : flags.includes('CAPEX_TOTAL') ? 'CAPEX_BASIS: TOTAL' : 'CAPEX_BASIS: UNSPECIFIED';
  const sign = measure.value < 0 ? ['CAPEX_SIGN_NORMALISED: stored as negative outflow'] : [];
  return { ...measure, value: Math.abs(measure.value), notes: [...measure.notes, basis, ...sign] };
}

/** Free cash flow = CFO - capex. */
export function fcfMeasure(env: CalcEnv, spec: PeriodSpec): Measure {
  return combine([flow(env, spec, 'cfo'), capexMeasure(env, spec)], v => v[0] - v[1]);
}

/** Lease liabilities at a date, or zero-width when the run excludes leases by explicit context. */
function leaseMeasure(env: CalcEnv, end: string): Measure {
  if (!env.includeLeases) return literal(0, 'LEASES_EXCLUDED_BY_CONTEXT');
  return pit(env, end, 'lease_liabilities');
}

/** Net debt = borrowings + leases - cash at a balance-sheet date. */
export function netDebtMeasure(env: CalcEnv, end: string): Measure {
  const parts = [pit(env, end, 'borrowings_total'), leaseMeasure(env, end), pit(env, end, 'cash_and_equivalents')];
  return combine(parts, v => v[0] + v[1] - v[2]);
}

/** Capital employed = equity + borrowings (+ leases when included). */
export function capitalEmployedMeasure(env: CalcEnv, end: string): Measure {
  const parts = [pit(env, end, 'equity_total'), pit(env, end, 'borrowings_total'), leaseMeasure(env, end)];
  return combine(parts, v => v[0] + v[1] + v[2]);
}

/** Invested capital = equity + borrowings (+ leases when included) - cash. */
export function investedCapitalMeasure(env: CalcEnv, end: string): Measure {
  return combine([capitalEmployedMeasure(env, end), pit(env, end, 'cash_and_equivalents')], v => v[0] - v[1]);
}

/** Average of closing and prior-year closing when both exist, else closing flagged CLOSING_BALANCE. */
export function averageOrClosing(env: CalcEnv, end: string, balance: (env: CalcEnv, end: string) => Measure): Measure {
  const closing = balance(env, end);
  if (!closing.ok) return closing;
  const opening = balance(env, shiftYears(end, 1));
  if (!opening.ok) return combine([closing], v => v[0], ['CLOSING_BALANCE: prior-year balance not available']);
  return combine([closing, opening], v => (v[0] + v[1]) / 2, ['AVERAGE_BALANCE: closing and prior-year closing']);
}

/** NOPAT = operating EBIT (excluding other income) x (1 - evidenced effective tax rate). */
export function nopatMeasure(env: CalcEnv, spec: PeriodSpec): Measure {
  const taxRate = effectiveTaxRate(env, spec);
  return combine([ebitMeasure(env, spec, true), taxRate], v => v[0] * (1 - v[1]));
}

/** Options for a plain ratio result. */
export interface RatioSpec {
  key: string;
  name: string;
  period: string;
  unit: string;
  numerator: Measure;
  denominator: Measure;
  numeratorLabel: string;
  denominatorLabel: string;
  /** Multiplier applied to num/den (100 for percent, 365 for days). */
  scale?: number;
  /** When true a zero or negative denominator is NOT_APPLICABLE; otherwise only zero is. */
  positiveDenominator?: boolean;
  /** When true a non-positive numerator is NOT_APPLICABLE. */
  positiveNumerator?: boolean;
  note?: string;
}

/** Build a ratio CalcResult: missing inputs -> INSUFFICIENT_DATA, undefined base -> NOT_APPLICABLE. */
export function ratioResult(env: CalcEnv, spec: RatioSpec): CalcResult {
  const { key, name, period, unit, numerator, denominator } = spec;
  const scale = spec.scale ?? 1;
  const suffix = scale === 1 ? '' : ` x ${scale}`;
  const label = `${spec.numeratorLabel} / ${spec.denominatorLabel}${suffix}`;
  // Sum is only used to validate presence and merge provenance; the ratio is computed below.
  const present = combine([numerator, denominator], v => v[0] + v[1]);
  if (!present.ok) {
    if (present.kind === 'MISSING') return insufficient(env, key, name, period, unit, present.items, label);
    return notApplicable(env, key, name, period, unit, [], label, present.items.join('; '));
  }
  const num = (numerator as OkMeasure).value;
  const den = (denominator as OkMeasure).value;
  const value = num / den * scale;
  const formula = `${spec.numeratorLabel} ${fmt(num)} / ${spec.denominatorLabel} ${fmt(den)}${suffix} = ${fmt(value)}`;
  const notes = [spec.note ?? '', ...present.notes].filter(Boolean).join('; ');
  const badDenominator = den === 0 || (spec.positiveDenominator === true && den < 0);
  if (badDenominator) {
    return notApplicable(env, key, name, period, unit, present.ids, label, `denominator ${fmt(den)} not positive; ${notes}`);
  }
  if (spec.positiveNumerator === true && num <= 0) {
    return notApplicable(env, key, name, period, unit, present.ids, label, `numerator ${fmt(num)} not positive; ${notes}`);
  }
  return okResult(env, key, name, period, unit, value, present.ids, formula, notes);
}

/** Convert a Measure into a CalcResult (ok -> OK, missing -> INSUFFICIENT_DATA, undefined -> NOT_APPLICABLE). */
export function measureResult(
  env: CalcEnv, key: string, name: string, period: string, unit: string,
  measure: Measure, formula: string, note = '',
): CalcResult {
  if (measure.ok) {
    const notes = [note, ...measure.notes].filter(Boolean).join('; ');
    return okResult(env, key, name, period, unit, measure.value, measure.ids, formula, notes);
  }
  if (measure.kind === 'MISSING') return insufficient(env, key, name, period, unit, measure.items, formula);
  return notApplicable(env, key, name, period, unit, [], formula, measure.items.join('; '));
}

/** Insufficient-data result for a calculator whose target period cannot even be determined. */
export function noPeriod(env: CalcEnv, key: string, name: string, unit: string, what: string): CalcResult {
  return insufficient(env, key, name, 'UNKNOWN', unit, [what]);
}
