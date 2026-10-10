import type { Fact, FactQuery, FactSource, PeriodType, Scope } from '../../../src/server/research_v2/domain/index.js';
import type {
  InstitutionalPoint, OwnershipSource, PledgePoint, PromoterPoint, ScorecardInput,
} from '../../../src/server/research_v2/filters/inputs.js';
import { quarterEndsBack } from '../../../src/server/research_v2/filters/dates.js';

export const AS_OF = '2026-10-10T00:00:00Z';
export const FY_END = '2026-03-31';

let seq = 0;

/** Build a statutory fact; any field can be overridden. */
export function fact(
  metric: string, periodType: PeriodType, periodEnd: string, valueCr: number | null, overrides: Partial<Fact> = {},
): Fact {
  seq += 1;
  const start = periodType === 'POINT_IN_TIME' ? periodEnd : periodType === 'DISCRETE_Q'
    ? quarterStartOf(periodEnd) : `${Number(periodEnd.slice(0, 4)) - 1}-04-01`;
  return {
    factId: `f${seq}-${metric}-${periodType}-${periodEnd}`, isin: 'INE000000001', symbol: 'TEST', scope: 'CONSOLIDATED',
    metric, periodType, periodStart: start, periodEnd, valueCr, unit: 'INR_CR', sourceTier: 'STATUTORY',
    source: 'fixture', sourceRef: 'fixture', availableAt: '2026-08-01T00:00:00Z', vintage: 1, qualityFlags: [],
    quarantined: false, ...overrides,
  };
}

function quarterStartOf(end: string): string {
  const m = Number(end.slice(5, 7));
  const startMonth = String(m - 2).padStart(2, '0');
  return `${end.slice(0, 4)}-${startMonth}-01`;
}

/** In-memory FactSource honouring scope, metric, period types and as-of; `ignoreScope` simulates a leaky source. */
export function factSource(facts: Fact[], ignoreScope = false): FactSource {
  return {
    facts(q: FactQuery): Fact[] {
      const metrics = q.metric === undefined ? null : Array.isArray(q.metric) ? q.metric : [q.metric];
      return facts.filter(f => (ignoreScope || q.scope === undefined || f.scope === q.scope)
        && (metrics === null || metrics.includes(f.metric))
        && (!q.periodTypes || q.periodTypes.includes(f.periodType))
        && Date.parse(f.availableAt) <= Date.parse(q.asOf));
    },
  };
}

/** Eight quarterly PATs, newest first, ending 2026-06-30. */
export function quarterlyPats(values: Array<number | null>, scope: Scope = 'CONSOLIDATED', metric = 'pat_attributable_to_owners'): Fact[] {
  const ends = quarterEndsBack('2026-06-30', values.length);
  return values.flatMap((v, i) => (v === null ? [] : [fact(metric, 'DISCRETE_Q', ends[i], v, { scope })]));
}

export interface OwnershipFixture {
  promoter?: PromoterPoint | null;
  pledge?: PledgePoint[];
  institutional?: InstitutionalPoint[];
}

export function ownership(fx: OwnershipFixture): OwnershipSource {
  return {
    promoterOfficial: () => fx.promoter ?? null,
    pledgeSeries: () => fx.pledge ?? [],
    institutionalAtQuarterEnds: () => fx.institutional ?? [],
  };
}

export const promoter = (value: number | null): PromoterPoint => ({ value, quarterEnd: '2026-06-30', source: 'NSE-SHP' });
export const pledge = (pledgePct: number | null, quarterEnd = '2026-06-30'): PledgePoint =>
  ({ quarterEnd, pledgePct, source: 'trendlyne-pledge' });
export const inst = (
  quarterEnd: string, fii: number | null, dii: number | null, mf: number | null,
): InstitutionalPoint => ({ quarterEnd, fii, diiOther: dii, mutualFunds: mf, basis: 'PROVIDER', source: 'trendlyne-shp' });

/** Annual flow + balance facts for FY26. Pass undefined/null to omit a metric. */
export interface AnnualFixture {
  pbt?: number; fin?: number; dep?: number; oi?: number; pat?: number; cfo?: number; ebitda?: number;
  equity?: number; equityOpen?: number; borrow?: number; borrowOpen?: number; leasePrincipal?: number;
}

export function annualFacts(a: AnnualFixture, scope: Scope = 'CONSOLIDATED'): Fact[] {
  const flow = (metric: string, v: number | undefined): Fact[] =>
    v === undefined ? [] : [fact(metric, 'ANNUAL', FY_END, v, { scope })];
  const pit = (metric: string, end: string, v: number | undefined): Fact[] =>
    v === undefined ? [] : [fact(metric, 'POINT_IN_TIME', end, v, { scope })];
  return [
    ...flow('pbt_before_exceptional', a.pbt), ...flow('finance_cost', a.fin), ...flow('depreciation_amortisation', a.dep),
    ...flow('other_income', a.oi), ...flow('pat_attributable_to_owners', a.pat), ...flow('cfo', a.cfo),
    ...flow('ebitda_derived', a.ebitda), ...flow('lease_principal_paid', a.leasePrincipal),
    ...pit('equity_total', FY_END, a.equity), ...pit('equity_total', '2025-03-31', a.equityOpen),
    ...pit('borrowings_total', FY_END, a.borrow), ...pit('borrowings_total', '2025-03-31', a.borrowOpen),
  ];
}

export function inputFor(facts: Fact[], own: OwnershipFixture, extra: Partial<ScorecardInput> = {}): ScorecardInput {
  return {
    isin: 'INE000000001', symbol: 'TEST', asOf: AS_OF, scope: 'CONSOLIDATED', facts: factSource(facts),
    ownership: ownership(own), ...extra,
  };
}
