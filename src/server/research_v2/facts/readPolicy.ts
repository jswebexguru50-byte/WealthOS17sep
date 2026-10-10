import type { Fact, SourceTier } from '../domain/types.js';
import type { FactQuery } from '../domain/factSource.js';

/** Higher rank wins. SIMULATED is rank 0 and is never readable. */
export const TIER_RANK: Readonly<Record<SourceTier, number>> = {
  STATUTORY: 4,
  PROVIDER_VERIFIED: 3,
  PROVIDER_LATEST: 2,
  SECONDARY_LEAD: 1,
  SIMULATED: 0,
};

/** Quality flags that make a fact unusable for any calculator. */
export const BLOCKING_QUALITY_FLAGS = ['UNIT_SUSPECT', 'PERIOD_RECON_FAIL'] as const;

export type RejectionReason =
  | 'QUARANTINED'
  | 'SIMULATED'
  | 'INVALID_TIER'
  | 'MISSING_VALUE'
  | 'NAN_VALUE'
  | 'LATEST_PERIOD'
  | 'INVALID_PERIOD'
  | 'INVALID_AVAILABLE_AT'
  | 'FUTURE_DATED'
  | 'BELOW_MIN_TIER'
  | 'UNIT_SUSPECT'
  | 'PERIOD_RECON_FAIL'
  | 'UNRESOLVED_CONFLICT'
  | 'MIXED_SCOPE';

export interface Rejection {
  factId: string;
  reason: RejectionReason;
}

export interface ReadPolicyOptions {
  /** Facts below this tier are ineligible. */
  minTier?: SourceTier;
  /** When true, a fact named in an OPEN conflict is rejected (see conflictedFactIds). */
  requireResolvedConflicts?: boolean;
  /** Fact ids that appear in an OPEN research_conflicts row. */
  conflictedFactIds?: ReadonlySet<string>;
}

export interface PolicyResult {
  facts: Fact[];
  rejections: Rejection[];
}

/** Thrown by FactSource implementations when a request would mix CONSOLIDATED and STANDALONE facts. */
export class MixedScopeError extends Error {
  readonly code = 'MIXED_SCOPE';
  constructor(public readonly isin: string) {
    super(`MIXED_SCOPE: ${isin} has CONSOLIDATED and STANDALONE facts in one request; pass an explicit scope`);
    this.name = 'MixedScopeError';
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse an ISO date or datetime into epoch milliseconds (NaN when invalid).
 * A date-only value means the END of that UTC day; a datetime without zone is read as UTC.
 */
export function parseInstant(value: string): number {
  if (typeof value !== 'string' || value.trim() === '') return Number.NaN;
  const text = value.trim().replace(' ', 'T');
  if (DATE_ONLY.test(text)) return Date.parse(`${text}T23:59:59.999Z`);
  return Date.parse(HAS_ZONE.test(text) ? text : `${text}Z`);
}

/** Instant for an as-of query; throws on an invalid value (never guess a date). */
export function asOfInstant(asOf: string): number {
  const instant = parseInstant(asOf);
  if (Number.isNaN(instant)) throw new Error(`Invalid asOf instant: ${String(asOf)}`);
  return instant;
}

function asArray(metric: string | string[] | undefined): string[] | undefined {
  if (metric === undefined) return undefined;
  return Array.isArray(metric) ? metric : [metric];
}

/** True when the fact satisfies the narrowing fields of the query (asOf is handled separately). */
export function matchesQuery(fact: Fact, query: FactQuery): boolean {
  const metrics = asArray(query.metric);
  return (
    (query.isin === undefined || fact.isin === query.isin) &&
    (query.symbol === undefined || fact.symbol === query.symbol) &&
    (query.scope === undefined || fact.scope === query.scope) &&
    (metrics === undefined || metrics.includes(fact.metric)) &&
    (query.periodTypes === undefined || query.periodTypes.includes(fact.periodType))
  );
}

function periodReason(fact: Fact): RejectionReason | null {
  for (const text of [fact.periodStart, fact.periodEnd]) {
    if (typeof text === 'string' && /LATEST/i.test(text)) return 'LATEST_PERIOD';
  }
  const valid = ISO_DATE.test(String(fact.periodStart)) && ISO_DATE.test(String(fact.periodEnd));
  return valid ? null : 'INVALID_PERIOD';
}

function valueReason(fact: Fact): RejectionReason | null {
  const value = fact.valueCr as unknown;
  if (value === null || value === undefined) return 'MISSING_VALUE';
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'NAN_VALUE';
  return null;
}

/** Why a fact can never be read (it is treated as if it did not exist), or null when eligible. */
function ineligibleReason(fact: Fact, asOf: number, options: ReadPolicyOptions): RejectionReason | null {
  if (fact.quarantined) return 'QUARANTINED';
  if (fact.sourceTier === 'SIMULATED') return 'SIMULATED';
  const rank = TIER_RANK[fact.sourceTier];
  if (rank === undefined) return 'INVALID_TIER';
  const value = valueReason(fact);
  if (value) return value;
  const period = periodReason(fact);
  if (period) return period;
  const available = parseInstant(fact.availableAt);
  if (Number.isNaN(available)) return 'INVALID_AVAILABLE_AT';
  if (available > asOf) return 'FUTURE_DATED';
  if (options.minTier !== undefined && rank < TIER_RANK[options.minTier]) return 'BELOW_MIN_TIER';
  return null;
}

/** Fact identity ignoring vintage and source: scope, period type and real dates are part of the key. */
export function factKey(fact: Fact): string {
  return [fact.isin, fact.scope, fact.metric, fact.periodType, fact.periodStart, fact.periodEnd].join('|');
}

/** Highest tier, then latest availability, then highest vintage. */
function better(candidate: Fact, current: Fact): boolean {
  const byTier = TIER_RANK[candidate.sourceTier] - TIER_RANK[current.sourceTier];
  if (byTier !== 0) return byTier > 0;
  const byTime = parseInstant(candidate.availableAt) - parseInstant(current.availableAt);
  if (byTime !== 0) return byTime > 0;
  return candidate.vintage > current.vintage;
}

function selectOnePerKey(eligible: Fact[]): Fact[] {
  const chosen = new Map<string, Fact>();
  for (const fact of eligible) {
    const key = factKey(fact);
    const current = chosen.get(key);
    if (!current || better(fact, current)) chosen.set(key, fact);
  }
  return [...chosen.values()];
}

function selectedReason(fact: Fact, options: ReadPolicyOptions): RejectionReason | null {
  for (const flag of BLOCKING_QUALITY_FLAGS) {
    if (fact.qualityFlags.includes(flag)) return flag;
  }
  if (options.requireResolvedConflicts && options.conflictedFactIds?.has(fact.factId)) {
    return 'UNRESOLVED_CONFLICT';
  }
  return null;
}

function byRealPeriod(a: Fact, b: Fact): number {
  return (
    a.periodEnd.localeCompare(b.periodEnd) || a.metric.localeCompare(b.metric) ||
    a.periodType.localeCompare(b.periodType) || a.scope.localeCompare(b.scope) ||
    a.factId.localeCompare(b.factId)
  );
}

function dropMixedScope(facts: Fact[], query: FactQuery, rejections: Rejection[]): Fact[] {
  if (query.scope !== undefined) return facts;
  const scopes = new Map<string, Set<string>>();
  for (const fact of facts) scopes.set(fact.isin, (scopes.get(fact.isin) ?? new Set()).add(fact.scope));
  const mixed = new Set([...scopes].filter(([, set]) => set.size > 1).map(([isin]) => isin));
  for (const fact of facts) {
    if (mixed.has(fact.isin)) rejections.push({ factId: fact.factId, reason: 'MIXED_SCOPE' });
  }
  return facts.filter((fact) => !mixed.has(fact.isin));
}

/**
 * Apply the read policy to every vintage of the candidate facts.
 *
 * 1. Ineligible facts are treated as non-existent: quarantined, SIMULATED, missing or NaN value,
 *    LATEST-prefixed or non-ISO period, unparseable or future availableAt (instant comparison), below minTier.
 * 2. Exactly ONE vintage per key (isin, scope, metric, period type, start, end) is selected: the highest
 *    tier, then the latest available, then the highest vintage.
 * 3. A selected fact flagged UNIT_SUSPECT / PERIOD_RECON_FAIL (or in an open conflict, if required) is
 *    rejected outright; an older vintage is NOT substituted silently.
 * 4. Without an explicit scope, an isin that still has both scopes is rejected as MIXED_SCOPE.
 * Result facts are sorted by real period end.
 */
export function applyReadPolicy(
  candidates: readonly Fact[], query: FactQuery, options: ReadPolicyOptions = {},
): PolicyResult {
  const asOf = asOfInstant(query.asOf);
  const rejections: Rejection[] = [];
  const eligible: Fact[] = [];
  for (const fact of candidates.filter((item) => matchesQuery(item, query))) {
    const reason = ineligibleReason(fact, asOf, options);
    if (reason) rejections.push({ factId: fact.factId, reason });
    else eligible.push(fact);
  }
  const selected: Fact[] = [];
  for (const fact of selectOnePerKey(eligible)) {
    const reason = selectedReason(fact, options);
    if (reason) rejections.push({ factId: fact.factId, reason });
    else selected.push(fact);
  }
  const facts = dropMixedScope(selected, query, rejections).sort(byRealPeriod);
  return { facts, rejections };
}

/** Throws MixedScopeError when the policy rejected anything as MIXED_SCOPE; otherwise returns the facts. */
export function factsOrThrowOnMixedScope(result: PolicyResult, candidates: readonly Fact[]): Fact[] {
  const mixed = result.rejections.find((item) => item.reason === 'MIXED_SCOPE');
  if (!mixed) return result.facts;
  const isin = candidates.find((fact) => fact.factId === mixed.factId)?.isin ?? 'unknown isin';
  throw new MixedScopeError(isin);
}
