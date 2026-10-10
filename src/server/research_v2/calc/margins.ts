import type { CalcResult } from '../domain/calc.js';
import type { CalcEnv, PeriodSpec } from './env.js';
import { specLabel } from './env.js';
import type { Measure } from './measures.js';
import { ebitdaMeasure, ebitMeasure, flow, measureResult, noPeriod, patMeasure, ratioResult } from './measures.js';
import { fmt } from './result.js';

function ebitdaResult(env: CalcEnv, spec: PeriodSpec): CalcResult {
  const ebitda = ebitdaMeasure(env, spec);
  const formula = 'pbt_before_exceptional + finance_cost + depreciation_amortisation - other_income';
  const note = 'before exceptional items; derived from components (stored ebitda_derived only as fallback)';
  const detail = ebitda.ok ? `${formula} = ${fmt(ebitda.value)}` : formula;
  return measureResult(env, 'ebitda_derived', 'EBITDA (derived)', specLabel(spec), 'INR_CR', ebitda, detail, note);
}

function marginResult(
  env: CalcEnv, spec: PeriodSpec, key: string, name: string, numerator: Measure, numeratorLabel: string,
): CalcResult {
  return ratioResult(env, {
    key,
    name,
    period: specLabel(spec),
    unit: 'PCT',
    scale: 100,
    numerator,
    denominator: flow(env, spec, 'revenue_from_operations'),
    numeratorLabel,
    denominatorLabel: 'revenue_from_operations',
    positiveDenominator: true,
  });
}

function marginsFor(env: CalcEnv, spec: PeriodSpec): CalcResult[] {
  return [
    ebitdaResult(env, spec),
    marginResult(env, spec, 'ebitda_margin', 'EBITDA margin', ebitdaMeasure(env, spec), 'ebitda_derived'),
    marginResult(env, spec, 'operating_margin', 'Operating margin (EBIT excl. other income)',
      ebitMeasure(env, spec, true), 'operating EBIT'),
    marginResult(env, spec, 'pat_margin', 'PAT margin', patMeasure(env, spec, 'TOTAL'), 'pat'),
  ];
}

/** EBITDA (derived) and the EBITDA, operating and PAT margins for the latest year and latest quarter. */
export function marginCalcs(env: CalcEnv): CalcResult[] {
  const specs = [env.annualSpec(), env.quarterSpec()].filter((s): s is PeriodSpec => s !== null);
  if (!specs.length) return [noPeriod(env, 'ebitda_margin', 'EBITDA margin', 'PCT', 'annual or quarterly facts')];
  return specs.flatMap(spec => marginsFor(env, spec));
}
