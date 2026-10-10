import type { FactSource } from '../domain/factSource.js';
import type { Fact, PeriodType, Scope, SourceTier } from '../domain/types.js';
import { canonicalMetric, metricDefinition } from '../facts/metricDefinitions.js';
import type { CalcContext } from './context.js';
import { annualLabel, daysBetween, quarterLabel, shiftYears, toMs } from './periods.js';

/** A fiscal year or a discrete quarter; calculators never mix kinds inside one result. */
export interface PeriodSpec {
  kind: 'ANNUAL' | 'DISCRETE_Q';
  end: string;
}

/** Human label of a period spec, e.g. `FY26` or `Q3 FY26`. */
export function specLabel(spec: PeriodSpec): string {
  return spec.kind === 'ANNUAL' ? annualLabel(spec.end) : quarterLabel(spec.end);
}

/** Metrics the shared definitions do not list yet; their expected units are fixed here. */
const EXTRA_UNITS: Record<string, string> = {
  floating_rate_borrowings: 'INR_CR',
  cost_of_materials_consumed: 'INR_CR',
  changes_in_inventories: 'INR_CR',
  purchases_of_stock_in_trade: 'INR_CR',
  direct_expenses: 'INR_CR',
  shares_outstanding: 'SHARES',
};

const SCOPE_PROBE_METRICS = [
  'revenue_from_operations', 'pat_total', 'pat_attributable_to_owners', 'cfo', 'pbt', 'total_assets',
];
const ANCHOR_METRICS = ['revenue_from_operations', 'pat_total', 'pat_attributable_to_owners', 'cfo', 'pbt'];
const TIER_RANK: Record<SourceTier, number> = {
  STATUTORY: 4, PROVIDER_VERIFIED: 3, PROVIDER_LATEST: 2, SECONDARY_LEAD: 1, SIMULATED: 0,
};
const MATCH_TOLERANCE_DAYS = 3;

function expectedUnit(metric: string): string | undefined {
  return metricDefinition(metric)?.unit ?? EXTRA_UNITS[metric];
}

function isUsable(fact: Fact, metric: string, asOf: string): boolean {
  if (fact.quarantined || fact.sourceTier === 'SIMULATED') return false;
  if (typeof fact.valueCr !== 'number' || !Number.isFinite(fact.valueCr)) return false;
  if (canonicalMetric(fact.metric) !== metric) return false;
  if (toMs(fact.availableAt) > toMs(asOf)) return false;
  const unit = expectedUnit(metric);
  return unit === undefined || fact.unit === unit;
}

function isBetter(candidate: Fact, current: Fact): boolean {
  if (candidate.vintage !== current.vintage) return candidate.vintage > current.vintage;
  if (candidate.sourceTier !== current.sourceTier) {
    return TIER_RANK[candidate.sourceTier] > TIER_RANK[current.sourceTier];
  }
  return toMs(candidate.availableAt) > toMs(current.availableAt);
}

/** One fact per (period type, period end): highest vintage, then tier, then latest availability. */
function dedupe(facts: Fact[]): Fact[] {
  const best = new Map<string, Fact>();
  for (const fact of facts) {
    const key = `${fact.periodType}|${fact.periodEnd}`;
    const current = best.get(key);
    if (!current || isBetter(fact, current)) best.set(key, fact);
  }
  return [...best.values()].sort((a, b) => toMs(a.periodEnd) - toMs(b.periodEnd));
}

/**
 * Read-only view of one company's facts for calculators: a single scope (consolidated preferred),
 * policy-clean facts, discrete quarters and annual figures kept strictly apart.
 */
export class CalcEnv {
  readonly scope: Scope | null;
  private readonly cache = new Map<string, Fact[]>();

  constructor(readonly source: FactSource, readonly ctx: CalcContext) {
    if (!ctx.isin && !ctx.symbol) throw new Error('CALC_CONTEXT_NEEDS_ISIN_OR_SYMBOL');
    this.scope = ctx.scope ?? this.resolveScope();
  }

  /** Whether lease liabilities are part of debt/capital in this run. */
  get includeLeases(): boolean {
    return this.ctx.includeLeases !== false;
  }

  private resolveScope(): Scope | null {
    const probe = this.source.facts({
      isin: this.ctx.isin, symbol: this.ctx.symbol, metric: SCOPE_PROBE_METRICS, asOf: this.ctx.asOf,
    });
    if (probe.some(fact => fact.scope === 'CONSOLIDATED' && !fact.quarantined)) return 'CONSOLIDATED';
    if (probe.some(fact => fact.scope === 'STANDALONE' && !fact.quarantined)) return 'STANDALONE';
    return null;
  }

  /** Usable facts of one metric in the chosen scope, sorted by period end. */
  series(metric: string): Fact[] {
    const key = canonicalMetric(metric);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const rows = this.scope === null ? [] : this.source.facts({
      isin: this.ctx.isin, symbol: this.ctx.symbol, scope: this.scope, metric: key, asOf: this.ctx.asOf,
    });
    const usable = dedupe(rows.filter(fact => isUsable(fact, key, this.ctx.asOf)));
    this.cache.set(key, usable);
    return usable;
  }

  private nearest(metric: string, types: PeriodType[], end: string, tolerance: number): Fact | undefined {
    const candidates = this.series(metric).filter(fact => types.includes(fact.periodType));
    return candidates.find(fact => Math.abs(daysBetween(end, fact.periodEnd)) <= tolerance);
  }

  /** Flow fact for the exact annual or discrete-quarter period. */
  flow(metric: string, spec: PeriodSpec): Fact | undefined {
    const type: PeriodType = spec.kind === 'ANNUAL' ? 'ANNUAL' : 'DISCRETE_Q';
    return this.nearest(metric, [type], spec.end, MATCH_TOLERANCE_DAYS);
  }

  /** Balance-sheet (point-in-time) fact at a date. */
  pit(metric: string, end: string): Fact | undefined {
    return this.nearest(metric, ['POINT_IN_TIME'], end, MATCH_TOLERANCE_DAYS);
  }

  /** Discrete-quarter fact one year before `end`. */
  quarterYearAgo(metric: string, end: string): Fact | undefined {
    return this.nearest(metric, ['DISCRETE_Q'], shiftYears(end, 1), 6);
  }

  /** Discrete-quarter fact for the immediately preceding quarter. */
  quarterBefore(metric: string, end: string): Fact | undefined {
    return this.series(metric).find(fact => {
      const gap = daysBetween(fact.periodEnd, end);
      return fact.periodType === 'DISCRETE_Q' && gap >= 80 && gap <= 100;
    });
  }

  private latestEnd(type: PeriodType): string | null {
    const ends = ANCHOR_METRICS.flatMap(metric => this.series(metric))
      .filter(fact => fact.periodType === type).map(fact => fact.periodEnd).sort();
    return ends.length ? ends[ends.length - 1] : null;
  }

  /** Target fiscal-year spec: the context override or the latest annual period present. */
  annualSpec(): PeriodSpec | null {
    const end = this.ctx.annualPeriodEnd ?? this.latestEnd('ANNUAL');
    return end ? { kind: 'ANNUAL', end } : null;
  }

  /** Target discrete-quarter spec: the context override or the latest discrete quarter present. */
  quarterSpec(): PeriodSpec | null {
    const end = this.ctx.quarterPeriodEnd ?? this.latestEnd('DISCRETE_Q');
    return end ? { kind: 'DISCRETE_Q', end } : null;
  }
}
