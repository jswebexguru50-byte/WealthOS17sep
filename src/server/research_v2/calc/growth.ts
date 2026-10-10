import type { CalcResult } from '../domain/calc.js';
import type { CalcEnv, PeriodSpec } from './env.js';
import { specLabel } from './env.js';
import type { Measure, OkMeasure } from './measures.js';
import {
  combine, ebitdaMeasure, flow, measureResult, noPeriod, patMeasure, undefinedMeasure,
} from './measures.js';
import { monthEndMonthsBefore, shiftYears } from './periods.js';
import { fmt } from './result.js';

type MeasureFn = (env: CalcEnv, spec: PeriodSpec) => Measure;

interface GrowthSubject {
  key: string;
  name: string;
  measure: MeasureFn;
}

const REVENUE: GrowthSubject = {
  key: 'revenue',
  name: 'Revenue from operations',
  measure: (env, spec) => flow(env, spec, 'revenue_from_operations'),
};
const EBITDA: GrowthSubject = { key: 'ebitda', name: 'EBITDA (derived, before exceptional)', measure: ebitdaMeasure };
const PAT: GrowthSubject = { key: 'pat', name: 'PAT', measure: (env, spec) => patMeasure(env, spec, 'TOTAL') };
const SUBJECTS: GrowthSubject[] = [REVENUE, EBITDA, PAT];

type Basis = 'YEAR' | 'QUARTER';

function priorSpec(spec: PeriodSpec, basis: Basis): PeriodSpec {
  const end = basis === 'YEAR' ? shiftYears(spec.end, 1) : monthEndMonthsBefore(spec.end, 3);
  return { kind: spec.kind, end };
}

/** Percent change current vs base; a non-positive base makes the change undefined, not zero. */
function pctChange(current: Measure, base: Measure): Measure {
  const both = combine([current, base], v => v[0] + v[1]);
  if (!both.ok) return both;
  const cur = (current as OkMeasure).value;
  const prior = (base as OkMeasure).value;
  if (prior <= 0) return undefinedMeasure(`base ${fmt(prior)} not positive; growth undefined`);
  return { ...both, value: (cur / prior - 1) * 100 };
}

/** Compound annual growth over `years`; both end points must be positive. */
function cagrMeasure(current: Measure, base: Measure, years: number): Measure {
  const both = combine([current, base], v => v[0] + v[1]);
  if (!both.ok) return both;
  const cur = (current as OkMeasure).value;
  const start = (base as OkMeasure).value;
  if (start <= 0 || cur <= 0) {
    return undefinedMeasure(`CAGR needs positive end points (start ${fmt(start)}, end ${fmt(cur)})`);
  }
  return { ...both, value: ((cur / start) ** (1 / years) - 1) * 100 };
}

function growthResult(
  env: CalcEnv, subject: GrowthSubject, kind: string, spec: PeriodSpec, basis: Basis,
): CalcResult {
  const base = priorSpec(spec, basis);
  const cur = subject.measure(env, spec);
  const prior = subject.measure(env, base);
  const formula = `(${subject.key}@${specLabel(spec)} / ${subject.key}@${specLabel(base)} - 1) x 100`;
  const detail = cur.ok && prior.ok ? `${formula}; ${fmt(cur.value)} vs ${fmt(prior.value)}` : formula;
  return measureResult(env, `${subject.key}_${kind}`, `${subject.name} ${kind}`, specLabel(spec), 'PCT',
    pctChange(cur, prior), detail);
}

function cagrResult(env: CalcEnv, subject: GrowthSubject, spec: PeriodSpec, years: number): CalcResult {
  const base: PeriodSpec = { kind: 'ANNUAL', end: shiftYears(spec.end, years) };
  const change = cagrMeasure(subject.measure(env, spec), subject.measure(env, base), years);
  const formula = `((${subject.key}@${specLabel(spec)} / ${subject.key}@${specLabel(base)})^(1/${years}) - 1) x 100`;
  const note = `annual facts only, same scope; end points only (${years} years)`;
  return measureResult(env, `${subject.key}_cagr_${years}y`, `${subject.name} CAGR ${years}y`, specLabel(spec),
    'PCT', change, formula, note);
}

function operatingLeverage(env: CalcEnv, spec: PeriodSpec): CalcResult {
  const growth = (subject: GrowthSubject): Measure => pctChange(
    subject.measure(env, spec), subject.measure(env, priorSpec(spec, 'YEAR')),
  );
  const ebitda = growth(EBITDA);
  const revenue = growth(REVENUE);
  const ratio = combine([ebitda, revenue], v => (v[1] === 0 ? Number.NaN : v[0] / v[1]));
  const outcome = !ratio.ok && ebitda.ok && revenue.ok ? undefinedMeasure('revenue growth is zero') : ratio;
  const note = 'degree of operating leverage; undefined when revenue growth is zero or a base is not positive';
  return measureResult(env, 'operating_leverage_yoy', 'Operating leverage (YoY)', specLabel(spec), 'X',
    outcome, 'EBITDA YoY % / revenue YoY %', note);
}

/**
 * Growth calculators: discrete-quarter YoY and sequential, fiscal-year YoY, 3y/5y CAGR on annual facts,
 * and the operating-leverage ratio. Quarters and years are never mixed inside one result.
 */
export function growthCalcs(env: CalcEnv): CalcResult[] {
  const results: CalcResult[] = [];
  const quarter = env.quarterSpec();
  const annual = env.annualSpec();
  if (!quarter) results.push(noPeriod(env, 'quarterly_growth', 'Quarterly growth', 'PCT', 'discrete quarter facts'));
  if (!annual) results.push(noPeriod(env, 'annual_growth', 'Annual growth', 'PCT', 'annual facts'));
  if (quarter) {
    for (const subject of SUBJECTS) {
      results.push(growthResult(env, subject, 'yoy_q', quarter, 'YEAR'));
      results.push(growthResult(env, subject, 'qoq', quarter, 'QUARTER'));
    }
    results.push(operatingLeverage(env, quarter));
  }
  if (annual) {
    for (const subject of SUBJECTS) {
      results.push(growthResult(env, subject, 'yoy_fy', annual, 'YEAR'));
      results.push(cagrResult(env, subject, annual, 3));
      results.push(cagrResult(env, subject, annual, 5));
    }
    results.push(operatingLeverage(env, annual));
  }
  return results;
}
