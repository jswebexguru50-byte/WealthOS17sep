import type { CalcResult } from '../domain/calc.js';
import type { CalcEnv, PeriodSpec } from './env.js';
import { specLabel } from './env.js';
import type { Measure } from './measures.js';
import {
  combine, effectiveTaxRate, measureResult, noPeriod, pit, undefinedMeasure,
} from './measures.js';
import { fmt } from './result.js';

/** Rate shock in fraction: 25 basis points. */
const SHOCK = 0.0025;

/**
 * Floating-rate borrowings at the balance-sheet date. Rejects a negative amount and an amount above total
 * borrowings (when reported), because either means the split is wrong and the shock must not be applied.
 */
function floatingDebt(env: CalcEnv, end: string): Measure {
  const floating = pit(env, end, 'floating_rate_borrowings');
  if (!floating.ok) return floating;
  if (floating.value < 0) return undefinedMeasure(`floating_rate_borrowings ${fmt(floating.value)} is negative`);
  const total = pit(env, end, 'borrowings_total');
  if (total.ok && floating.value > total.value + 1e-9) {
    return undefinedMeasure(
      `floating_rate_borrowings ${fmt(floating.value)} exceeds borrowings_total ${fmt(total.value)}`,
    );
  }
  return floating;
}

function pretaxResult(env: CalcEnv, spec: PeriodSpec, floating: Measure): CalcResult {
  const delta = combine([floating], v => v[0] * SHOCK);
  const formula = floating.ok
    ? `floating debt ${fmt(floating.value)} x 0.0025 = ${fmt(floating.value * SHOCK)}`
    : 'floating_rate_borrowings x 0.0025';
  return measureResult(env, 'rate_shock_25bp_pretax', 'Annual pre-tax interest impact of +25bp', specLabel(spec),
    'INR_CR', delta, formula, 'applied to the floating-rate portion only, never to total debt');
}

function afterTaxResult(env: CalcEnv, spec: PeriodSpec, floating: Measure): CalcResult {
  const rate = effectiveTaxRate(env, spec);
  const delta = combine([floating, rate], v => v[0] * SHOCK * (1 - v[1]));
  const formula = floating.ok && rate.ok
    ? `${fmt(floating.value)} x 0.0025 x (1 - ${fmt(rate.value)}) = ${fmt(floating.value * SHOCK * (1 - rate.value))}`
    : 'floating_rate_borrowings x 0.0025 x (1 - tax_expense / pbt)';
  const note = 'tax rate = tax_expense / pbt of the same year; without an evidenced rate only the pre-tax figure is valid';
  return measureResult(env, 'rate_shock_25bp_after_tax', 'Annual after-tax interest impact of +25bp',
    specLabel(spec), 'INR_CR', delta, formula, note);
}

/**
 * Q24 rate sensitivity for the latest fiscal year. Pre-tax: floating debt x 25bp. After-tax: only when the
 * effective tax rate is evidenced. No floating/fixed split means INSUFFICIENT_DATA; total debt is never used.
 */
export function rateSensitivityCalcs(env: CalcEnv): CalcResult[] {
  const spec = env.annualSpec();
  if (!spec) return [noPeriod(env, 'rate_shock_25bp_pretax', 'Rate shock +25bp', 'INR_CR', 'annual facts')];
  const floating = floatingDebt(env, spec.end);
  return [pretaxResult(env, spec, floating), afterTaxResult(env, spec, floating)];
}
