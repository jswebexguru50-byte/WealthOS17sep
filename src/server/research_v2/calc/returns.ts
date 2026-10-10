import type { CalcResult } from '../domain/calc.js';
import type { CalcEnv, PeriodSpec } from './env.js';
import { specLabel } from './env.js';
import {
  averageOrClosing, capitalEmployedMeasure, combine, ebitMeasure, investedCapitalMeasure, nopatMeasure, noPeriod,
  patMeasure, pit, ratioResult,
} from './measures.js';
import { shiftYears } from './periods.js';

const DEFAULT_INCREMENTAL_WINDOW_YEARS = 3;

function roe(env: CalcEnv, spec: PeriodSpec): CalcResult {
  return ratioResult(env, {
    key: 'roe', name: 'Return on equity', period: specLabel(spec), unit: 'PCT', scale: 100,
    numerator: patMeasure(env, spec, 'ATTRIBUTABLE'),
    denominator: averageOrClosing(env, spec.end, (e, end) => pit(e, end, 'equity_total')),
    numeratorLabel: 'pat_attributable_to_owners', denominatorLabel: 'equity_total', positiveDenominator: true,
  });
}

function roce(env: CalcEnv, spec: PeriodSpec): CalcResult[] {
  const ebit = ebitMeasure(env, spec, false);
  const basis = env.includeLeases ? 'equity + borrowings + leases' : 'equity + borrowings (leases excluded)';
  const primary = ratioResult(env, {
    key: 'roce', name: 'Return on capital employed', period: specLabel(spec), unit: 'PCT', scale: 100,
    numerator: ebit,
    denominator: averageOrClosing(env, spec.end, capitalEmployedMeasure),
    numeratorLabel: 'EBIT (pbt_before_exceptional + finance_cost)', denominatorLabel: `capital employed (${basis})`,
    positiveDenominator: true,
  });
  if (primary.status === 'OK') return [primary];
  const bound = ratioResult(env, {
    key: 'roce_upper_bound', name: 'ROCE upper bound (EBIT / equity)', period: specLabel(spec), unit: 'PCT',
    scale: 100, numerator: ebit, denominator: pit(env, spec.end, 'equity_total'),
    numeratorLabel: 'EBIT', denominatorLabel: 'equity_total (closing)', positiveDenominator: true,
    note: 'UPPER_BOUND: debt and leases are non-negative so true ROCE cannot exceed this; never a primary value',
  });
  return bound.status === 'OK' ? [primary, bound] : [primary];
}

function roic(env: CalcEnv, spec: PeriodSpec): CalcResult {
  return ratioResult(env, {
    key: 'roic', name: 'Return on invested capital', period: specLabel(spec), unit: 'PCT', scale: 100,
    numerator: nopatMeasure(env, spec),
    denominator: averageOrClosing(env, spec.end, investedCapitalMeasure),
    numeratorLabel: 'NOPAT (operating EBIT x (1 - tax_expense/pbt))',
    denominatorLabel: 'invested capital (equity + borrowings [+ leases] - cash)',
    positiveDenominator: true,
    note: 'operating EBIT excludes other income',
  });
}

function incrementalRoic(env: CalcEnv, spec: PeriodSpec): CalcResult {
  const years = env.ctx.incrementalWindowYears ?? DEFAULT_INCREMENTAL_WINDOW_YEARS;
  const startEnd = shiftYears(spec.end, years);
  const start: PeriodSpec = { kind: 'ANNUAL', end: startEnd };
  return ratioResult(env, {
    key: `incremental_roic_${years}y`, name: `Incremental ROIC over ${years} years`, period: specLabel(spec),
    unit: 'PCT', scale: 100,
    numerator: combine([nopatMeasure(env, spec), nopatMeasure(env, start)], v => v[0] - v[1]),
    denominator: combine([investedCapitalMeasure(env, spec.end), investedCapitalMeasure(env, startEnd)],
      v => v[0] - v[1]),
    numeratorLabel: `change in NOPAT ${specLabel(start)}->${specLabel(spec)}`,
    denominatorLabel: 'change in closing invested capital', positiveDenominator: true,
    note: `window ${years} years stated; closing balances`,
  });
}

/** ROE, ROCE (with a labelled upper bound when debt is missing), ROIC and incremental ROIC. */
export function returnCalcs(env: CalcEnv): CalcResult[] {
  const spec = env.annualSpec();
  if (!spec) return [noPeriod(env, 'roce', 'Return on capital employed', 'PCT', 'annual facts')];
  return [roe(env, spec), ...roce(env, spec), roic(env, spec), incrementalRoic(env, spec)];
}
