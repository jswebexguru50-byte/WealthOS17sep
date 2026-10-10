import type { CalcResult } from '../domain/calc.js';
import type { CalcEnv, PeriodSpec } from './env.js';
import { specLabel } from './env.js';
import { ebitdaMeasure, ebitMeasure, flow, measureResult, netDebtMeasure, noPeriod, ratioResult } from './measures.js';
import { fmt } from './result.js';

function netDebtResults(env: CalcEnv, spec: PeriodSpec): CalcResult[] {
  const period = specLabel(spec);
  const net = netDebtMeasure(env, spec.end);
  const basis = env.includeLeases ? 'borrowings_total + lease_liabilities - cash_and_equivalents'
    : 'borrowings_total - cash_and_equivalents (leases excluded by context)';
  const netDebt = measureResult(env, 'net_debt', 'Net debt', period, 'INR_CR', net,
    net.ok ? `${basis} = ${fmt(net.value)}` : basis, 'negative = net cash, a real outcome');
  const toEbitda = ratioResult(env, {
    key: 'net_debt_to_ebitda', name: 'Net debt / EBITDA', period, unit: 'X',
    numerator: net, denominator: ebitdaMeasure(env, spec),
    numeratorLabel: 'net_debt', denominatorLabel: 'ebitda_derived', positiveDenominator: true,
    note: 'EBITDA before exceptional items',
  });
  return [netDebt, toEbitda];
}

function coverageResults(env: CalcEnv, spec: PeriodSpec): CalcResult[] {
  const period = specLabel(spec);
  const interest = flow(env, spec, 'finance_cost');
  return [
    ratioResult(env, {
      key: 'interest_coverage', name: 'Interest coverage (EBIT / finance cost)', period, unit: 'X',
      numerator: ebitMeasure(env, spec, false), denominator: interest,
      numeratorLabel: '(pbt_before_exceptional + finance_cost)', denominatorLabel: 'finance_cost',
      positiveDenominator: true, note: 'EBIT includes other income; a zero finance cost makes coverage undefined',
    }),
    ratioResult(env, {
      key: 'interest_coverage_ex_other_income', name: 'Interest coverage excluding other income', period,
      unit: 'X', numerator: ebitMeasure(env, spec, true), denominator: interest,
      numeratorLabel: '(pbt_before_exceptional + finance_cost - other_income)', denominatorLabel: 'finance_cost',
      positiveDenominator: true,
    }),
  ];
}

/** Net debt, net debt/EBITDA (year) and interest coverage with and without other income (year and quarter). */
export function leverageCalcs(env: CalcEnv): CalcResult[] {
  const annual = env.annualSpec();
  const quarter = env.quarterSpec();
  if (!annual && !quarter) return [noPeriod(env, 'net_debt', 'Net debt', 'INR_CR', 'annual or quarterly facts')];
  const results: CalcResult[] = [];
  if (annual) results.push(...netDebtResults(env, annual), ...coverageResults(env, annual));
  if (quarter) results.push(...coverageResults(env, quarter));
  return results;
}
