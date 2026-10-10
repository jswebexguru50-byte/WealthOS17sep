import type { CalcResult } from '../../../src/server/research_v2/domain/calc.js';
import type { FactQuery, FactSource } from '../../../src/server/research_v2/domain/factSource.js';
import type { Fact, FactUnit, PeriodType, Scope } from '../../../src/server/research_v2/domain/types.js';

export const ISIN = 'INE000000000';
export const AS_OF = '2026-10-10T00:00:00Z';

let counter = 0;

/** Build a policy-clean fact (crore, statutory, consolidated) for tests; any field can be overridden. */
export function mkFact(
  metric: string, periodType: PeriodType, periodEnd: string, value: number, overrides: Partial<Fact> = {},
): Fact {
  counter += 1;
  return {
    factId: `f${counter}-${metric}-${periodType}-${periodEnd}`,
    isin: ISIN,
    symbol: 'FIXT',
    scope: 'CONSOLIDATED',
    metric,
    periodType,
    periodStart: periodEnd,
    periodEnd,
    valueCr: value,
    unit: 'INR_CR' as FactUnit,
    sourceTier: 'STATUTORY',
    source: 'XBRL',
    sourceRef: 'fixture',
    availableAt: '2026-05-30T00:00:00Z',
    vintage: 1,
    qualityFlags: [],
    quarantined: false,
    ...overrides,
  };
}

/** Annual flow fact. */
export const annual = (metric: string, end: string, value: number, o: Partial<Fact> = {}): Fact =>
  mkFact(metric, 'ANNUAL', end, value, o);
/** Discrete-quarter flow fact. */
export const quarter = (metric: string, end: string, value: number, o: Partial<Fact> = {}): Fact =>
  mkFact(metric, 'DISCRETE_Q', end, value, o);
/** Balance-sheet fact. */
export const pit = (metric: string, end: string, value: number, o: Partial<Fact> = {}): Fact =>
  mkFact(metric, 'POINT_IN_TIME', end, value, o);

/** In-memory FactSource honouring the FactQuery contract (asOf, scope, metric, period types). */
export class MemorySource implements FactSource {
  constructor(readonly rows: Fact[]) {}

  facts(query: FactQuery): Fact[] {
    const metrics = query.metric === undefined ? null : ([] as string[]).concat(query.metric);
    return this.rows.filter(fact =>
      (!query.isin || fact.isin === query.isin)
      && (!query.symbol || fact.symbol === query.symbol)
      && (!query.scope || fact.scope === query.scope)
      && (!metrics || metrics.includes(fact.metric))
      && (!query.periodTypes || query.periodTypes.includes(fact.periodType))
      && Date.parse(fact.availableAt) <= Date.parse(query.asOf));
  }
}

/** Find a result by its key (the part of calcId before the first `|`). */
export function pick(results: CalcResult[], key: string, period?: string): CalcResult {
  const found = results.find(r => r.calcId.startsWith(`${key}|`) && (!period || r.period === period));
  if (!found) throw new Error(`no result ${key} ${period ?? ''}; have ${results.map(r => r.calcId).join(', ')}`);
  return found;
}

/** Statutory annual P&L facts for one fiscal year. */
export function annualPnl(end: string, v: Record<string, number>, scope: Scope = 'CONSOLIDATED'): Fact[] {
  return Object.entries(v).map(([metric, value]) => annual(metric, end, value, { scope }));
}

/** YUKEN FY26 consolidated, crore. Components are chosen so the audit golden values reproduce exactly. */
export function yukenFy26(): Fact[] {
  const end = '2026-03-31';
  return [
    ...annualPnl(end, {
      revenue_from_operations: 462.17,
      pbt_before_exceptional: 31.2,
      exceptional_items: 0,
      pbt: 31.2,
      finance_cost: 15,
      depreciation_amortisation: 9.87,
      other_income: 5.55,
      tax_expense: 16.8096,
      pat_total: 14.3904,
      pat_attributable_to_owners: 14.3904,
      cfo: 41.2888,
      capex_cash_outflow: 83.0337,
    }),
  ];
}

/** TATATECH FY26 consolidated, crore (audit values). */
export function tatatechFy26(): Fact[] {
  const end = '2026-03-31';
  return annualPnl(end, {
    pbt_before_exceptional: 848.43,
    exceptional_items: -107.73,
    pbt: 740.7,
    finance_cost: 34.12,
    depreciation_amortisation: 144.95,
    other_income: 174.55,
    tax_expense: 218.13,
    pat_total: 522.57,
    pat_attributable_to_owners: 546.59,
    cfo: 775.7,
  });
}
