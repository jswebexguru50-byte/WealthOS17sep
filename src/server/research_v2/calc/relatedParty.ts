import type { CalcResult } from '../domain/calc.js';
import type { CalcEnv, PeriodSpec } from './env.js';
import { specLabel } from './env.js';
import type { Measure } from './measures.js';
import { flow, noPeriod, pit, ratioResult } from './measures.js';
import { daysBetween } from './periods.js';
import { insufficient } from './result.js';

const KEY_PREFIX = 'rpt_to';
const PERIOD_TOLERANCE_DAYS = 3;

interface Denominator {
  key: string;
  name: string;
  label: string;
  measure: Measure;
}

function denominators(env: CalcEnv, spec: PeriodSpec): Denominator[] {
  return [
    { key: 'revenue', name: 'revenue', label: 'revenue_from_operations', measure: flow(env, spec, 'revenue_from_operations') },
    { key: 'assets', name: 'total assets', label: 'total_assets', measure: pit(env, spec.end, 'total_assets') },
    { key: 'net_worth', name: 'net worth', label: 'equity_total', measure: pit(env, spec.end, 'equity_total') },
  ];
}

/**
 * Related-party transaction materiality (RPT total as a percentage of revenue, total assets and net worth).
 * Needs a parsed RPT table for the same fiscal year; without one every result is INSUFFICIENT_DATA.
 */
export function relatedPartyCalcs(env: CalcEnv): CalcResult[] {
  const spec = env.annualSpec();
  if (!spec) return [noPeriod(env, `${KEY_PREFIX}_revenue`, 'RPT / revenue', 'PCT', 'annual facts')];
  const period = specLabel(spec);
  const table = env.ctx.rptTable;
  const problem = !table ? 'parsed related-party transactions table'
    : !table.parsed ? `RPT table ${table.documentId} is not parsed`
      : Math.abs(daysBetween(spec.end, table.periodEnd)) > PERIOD_TOLERANCE_DAYS
        ? `RPT table ${table.documentId} covers ${table.periodEnd}, not ${spec.end}`
        : !Number.isFinite(table.totalAmountCr) || table.totalAmountCr < 0 ? 'RPT total amount (finite, non-negative)'
          : null;
  if (problem || !table) {
    return denominators(env, spec).map(d =>
      insufficient(env, `${KEY_PREFIX}_${d.key}`, `RPT / ${d.name}`, period, 'PCT', [problem ?? 'RPT table']));
  }
  const numerator: Measure = { ok: true, value: table.totalAmountCr, ids: [`doc:${table.documentId}`], notes: [] };
  return denominators(env, spec).map(d => ratioResult(env, {
    key: `${KEY_PREFIX}_${d.key}`, name: `RPT / ${d.name}`, period, unit: 'PCT', scale: 100,
    numerator, denominator: d.measure, numeratorLabel: 'rpt_total', denominatorLabel: d.label,
    positiveDenominator: true, note: 'materiality ratio only; not a judgement on the transactions',
  }));
}
