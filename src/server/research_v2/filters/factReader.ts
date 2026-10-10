import type { Fact, PeriodType, Scope } from '../domain/index.js';
import { daysBetween } from './dates.js';
import type { ScorecardInput } from './inputs.js';

/** Plausible inclusive span (days) of a flow fact by period type; other spans are not that period. */
const SPAN_DAYS: Partial<Record<PeriodType, [number, number]>> = {
  DISCRETE_Q: [80, 100], ANNUAL: [355, 375], TTM: [355, 375],
};

/** Facts older than this many days at as-of are stale when the period end was not chosen by the caller. */
export const STALE_DAYS: Partial<Record<PeriodType, number>> = { DISCRETE_Q: 200, ANNUAL: 548, TTM: 270 };

/** False when a flow fact's start-to-end span cannot be a quarter or a year as labelled. */
export function spanPlausible(f: Fact): boolean {
  const range = SPAN_DAYS[f.periodType];
  if (!range) return true;
  const span = daysBetween(f.periodStart, f.periodEnd) + 1;
  return span >= range[0] && span <= range[1];
}

/** True when fact `b` should replace `a`: newer vintage, then later availability. */
const isNewer = (a: Fact, b: Fact): boolean =>
  b.vintage > a.vintage || (b.vintage === a.vintage && b.availableAt > a.availableAt);

/**
 * Scope-locked, defensive view over a FactSource. The source is already policy-filtered, but the
 * scorecard re-checks the invariants it relies on (scope, value present, not simulated/quarantined)
 * because mixing scopes or reading a null as zero would silently corrupt a ratio.
 */
export class FactReader {
  private readonly cache = new Map<string, Fact[]>();

  constructor(private readonly input: ScorecardInput) {}

  get scope(): Scope { return this.input.scope; }

  /** All usable facts for the metrics and period types, in the input scope only. */
  read(metrics: string[], periodTypes: PeriodType[]): Fact[] {
    const key = `${metrics.join(',')}|${periodTypes.join(',')}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const raw = this.input.facts.facts({
      isin: this.input.isin, symbol: this.input.symbol, scope: this.input.scope,
      metric: metrics, periodTypes, asOf: this.input.asOf,
    });
    const usable = raw.filter(f => f.scope === this.input.scope && f.valueCr !== null
      && Number.isFinite(f.valueCr) && !f.quarantined && f.sourceTier !== 'SIMULATED'
      && metrics.includes(f.metric) && periodTypes.includes(f.periodType) && spanPlausible(f)
      && Date.parse(f.availableAt) <= Date.parse(this.input.asOf));
    this.cache.set(key, usable);
    return usable;
  }

  /** Newest-vintage fact for metric, period type and period end (optionally an exact start). */
  one(metric: string, periodType: PeriodType, periodEnd: string, periodStart?: string): Fact | null {
    const matches = this.read([metric], [periodType]).filter(f => f.periodEnd === periodEnd
      && (periodStart === undefined || f.periodStart === periodStart));
    return matches.length ? matches.reduce((a, b) => (isNewer(a, b) ? b : a)) : null;
  }

  /** Latest period end among facts of any listed metric for the period type. */
  latestEnd(metrics: string[], periodType: PeriodType): string | null {
    const ends = this.read(metrics, [periodType]).map(f => f.periodEnd).sort();
    return ends.length ? ends[ends.length - 1] : null;
  }
}

/** Reason a period end is too old to be current at as-of, or null when fresh (or no limit applies). */
export function staleReason(input: ScorecardInput, periodType: PeriodType, periodEnd: string): string | null {
  const limit = STALE_DAYS[periodType];
  if (limit === undefined) return null;
  const age = daysBetween(periodEnd, input.asOf);
  return age > limit
    ? `Latest ${periodType} period ended ${periodEnd}, ${age} days before as-of; stale (limit ${limit} days)` : null;
}

/** Period type used for flow metrics under the chosen basis. */
export function flowPeriodType(input: ScorecardInput): PeriodType {
  return input.basis === 'TTM' ? 'TTM' : 'ANNUAL';
}

/** Human label for the annual period, for example FY26 (2026-03-31) or TTM to 2026-06-30. */
export function periodLabel(input: ScorecardInput, periodEnd: string): string {
  if (input.basis === 'TTM') return `TTM to ${periodEnd}`;
  const year = Number(periodEnd.slice(0, 4));
  const fy = Number(periodEnd.slice(5, 7)) >= 4 ? year + 1 : year;
  return `FY${String(fy).slice(2)} (${periodEnd})`;
}
