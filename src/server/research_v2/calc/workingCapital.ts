import type { CalcResult } from '../domain/calc.js';
import type { CalcEnv, PeriodSpec } from './env.js';
import { specLabel } from './env.js';
import type { Measure, OkMeasure } from './measures.js';
import {
  averageOrClosing, combine, flow, measureResult, noPeriod, pit, undefinedMeasure,
} from './measures.js';

const DAYS_IN_YEAR = 365;

/** Optional COGS components; a component absent from the facts is not part of this company's COGS. */
const COGS_OPTIONAL = ['changes_in_inventories', 'purchases_of_stock_in_trade', 'direct_expenses'];

/**
 * COGS = cost_of_materials_consumed (required) + changes_in_inventories + purchases_of_stock_in_trade
 * + direct_expenses, each included only when reported. The included components are stated in the note.
 */
export function cogsMeasure(env: CalcEnv, spec: PeriodSpec): Measure {
  const materials = flow(env, spec, 'cost_of_materials_consumed');
  if (!materials.ok) return materials;
  const present = COGS_OPTIONAL.filter(metric => env.flow(metric, spec) !== undefined);
  const parts = [materials, ...present.map(metric => flow(env, spec, metric))];
  return combine(parts, v => v.reduce((sum, x) => sum + x, 0),
    [`COGS_COMPONENTS: cost_of_materials_consumed${present.map(m => ` + ${m}`).join('')}`]);
}

function balance(metric: string): (env: CalcEnv, end: string) => Measure {
  return (env, end) => pit(env, end, metric);
}

/** days = average (or closing, flagged) balance / flow x 365. */
function daysMeasure(env: CalcEnv, spec: PeriodSpec, metric: string, base: Measure): Measure {
  const avg = averageOrClosing(env, spec.end, balance(metric));
  const both = combine([avg, base], v => v[0] + v[1]);
  if (!both.ok) return both;
  const denominator = (base as OkMeasure).value;
  if (denominator <= 0) return undefinedMeasure(`flow base ${denominator} not positive`);
  return { ...both, value: (avg as OkMeasure).value / denominator * DAYS_IN_YEAR };
}

function daysResult(
  env: CalcEnv, spec: PeriodSpec, key: string, name: string, metric: string, base: Measure, baseLabel: string,
): CalcResult {
  const days = daysMeasure(env, spec, metric, base);
  const formula = `average ${metric} / ${baseLabel} x ${DAYS_IN_YEAR}`;
  return measureResult(env, key, name, specLabel(spec), 'DAYS', days, formula);
}

/**
 * DSO, DIO, DPO and the cash conversion cycle for the latest fiscal year. Balances are averaged when the
 * prior-year balance exists, else the closing balance is used and flagged CLOSING_BALANCE.
 * DIO and DPO use COGS as defined in {@link cogsMeasure}; without it they are INSUFFICIENT_DATA.
 */
export function workingCapitalCalcs(env: CalcEnv): CalcResult[] {
  const spec = env.annualSpec();
  if (!spec) return [noPeriod(env, 'ccc', 'Cash conversion cycle', 'DAYS', 'annual facts')];
  const revenue = flow(env, spec, 'revenue_from_operations');
  const cogs = cogsMeasure(env, spec);
  const dso = daysMeasure(env, spec, 'trade_receivables', revenue);
  const dio = daysMeasure(env, spec, 'inventory', cogs);
  const dpo = daysMeasure(env, spec, 'trade_payables', cogs);
  const ccc = combine([dso, dio, dpo], v => v[0] + v[1] - v[2]);
  return [
    daysResult(env, spec, 'dso', 'Days sales outstanding', 'trade_receivables', revenue, 'revenue_from_operations'),
    daysResult(env, spec, 'dio', 'Days inventory outstanding', 'inventory', cogs, 'COGS'),
    daysResult(env, spec, 'dpo', 'Days payables outstanding', 'trade_payables', cogs, 'COGS'),
    measureResult(env, 'ccc', 'Cash conversion cycle', specLabel(spec), 'DAYS', ccc, 'DSO + DIO - DPO'),
  ];
}

