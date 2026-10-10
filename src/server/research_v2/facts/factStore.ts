import type Database from 'better-sqlite3';
import type { Fact, FactUnit, PeriodType, Scope } from '../domain/types.js';
import type { FactQuery } from '../domain/factSource.js';
import { isGuardedHandle, isProductionPath } from '../db/dbGuard.js';
import { factKey, matchesQuery, parseInstant, TIER_RANK } from './readPolicy.js';

const FACTS_TABLE = 'research_canonical_period_facts';
const SCOPES: Scope[] = ['CONSOLIDATED', 'STANDALONE'];
const PERIOD_TYPES: PeriodType[] = [
  'DISCRETE_Q', 'YTD_3M', 'YTD_6M', 'YTD_9M', 'YTD_12M', 'ANNUAL', 'TTM', 'POINT_IN_TIME',
];
const UNITS: FactUnit[] = ['INR_CR', 'PCT', 'RATIO', 'SHARES', 'INR', 'INR_PER_SHARE', 'DAYS', 'X'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Conflict tolerance, same as the period reconciliation: max(0.05 Cr, 0.1% of the larger value). */
export const CONFLICT_ABS_TOLERANCE_CR = 0.05;
export const CONFLICT_REL_TOLERANCE = 0.001;
const OTHER_UNIT_ABS_TOLERANCE = 1e-6;

export type WriteStatus = 'INSERTED' | 'UNCHANGED' | 'REJECTED';
export type WriteRejection = 'MISSING_VALUE' | 'SIMULATED_TIER' | 'INVALID_FACT';

export interface WriteResult {
  status: WriteStatus;
  /** The stored fact (INSERTED) or the existing fact that already holds this value (UNCHANGED). */
  fact?: Fact;
  reason?: WriteRejection;
  detail?: string;
  /** Number of research_conflicts rows recorded by this write. */
  conflictsRecorded: number;
}

export interface FactRow {
  fact_id: string; isin: string; symbol: string; scope: Scope; metric: string; period_type: PeriodType;
  period_start: string; period_end: string; value_cr: number | null; unit: FactUnit; source_tier: Fact['sourceTier'];
  source: string; source_ref: string | null; available_at: string; vintage: number; supersedes_id: string | null;
  derivation_json: string | null; quality_flags: string | null; quarantined: number;
}

/** Convert a stored row to a Fact. @throws when stored JSON is corrupt (never defaulted). */
export function rowToFact(row: FactRow): Fact {
  const flags: unknown = JSON.parse(row.quality_flags ?? '[]');
  if (!Array.isArray(flags)) throw new Error(`quality_flags of ${row.fact_id} is not an array`);
  const fact: Fact = {
    factId: row.fact_id, isin: row.isin, symbol: row.symbol, scope: row.scope, metric: row.metric,
    periodType: row.period_type, periodStart: row.period_start, periodEnd: row.period_end,
    valueCr: row.value_cr, unit: row.unit, sourceTier: row.source_tier, source: row.source,
    sourceRef: row.source_ref ?? '', availableAt: row.available_at, vintage: row.vintage,
    qualityFlags: flags.map(String), quarantined: row.quarantined === 1,
  };
  if (row.supersedes_id) fact.supersedesId = row.supersedes_id;
  if (row.derivation_json) fact.derivation = JSON.parse(row.derivation_json) as Fact['derivation'];
  return fact;
}

/**
 * Every stored vintage that can match the query. SQL narrows by identity fields only; availability,
 * vintage selection and rejection rules belong to the read policy. Never writes.
 */
export function selectVintages(db: Database.Database, query: FactQuery): Fact[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown): void => { where.push(clause); params.push(value); };
  if (query.isin !== undefined) add('isin = ?', query.isin);
  if (query.symbol !== undefined) add('symbol = ?', query.symbol);
  if (query.scope !== undefined) add('scope = ?', query.scope);
  const metrics = query.metric === undefined ? undefined : [query.metric].flat();
  if (metrics) {
    where.push(`metric IN (${metrics.map(() => '?').join(',') || 'NULL'})`);
    params.push(...metrics);
  }
  if (query.periodTypes) {
    where.push(`period_type IN (${query.periodTypes.map(() => '?').join(',') || 'NULL'})`);
    params.push(...query.periodTypes);
  }
  const sql = `SELECT * FROM ${FACTS_TABLE}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
  const rows = db.prepare(sql).all(...params) as FactRow[];
  return rows.map(rowToFact).filter((fact) => matchesQuery(fact, query));
}

function invalidReason(fact: Fact): string | null {
  if (!fact.factId || !fact.isin || !fact.symbol || !fact.metric || !fact.source) return 'missing identity field';
  if (!SCOPES.includes(fact.scope)) return `invalid scope ${String(fact.scope)}`;
  if (!PERIOD_TYPES.includes(fact.periodType)) return `invalid period type ${String(fact.periodType)}`;
  if (!UNITS.includes(fact.unit)) return `invalid unit ${String(fact.unit)}`;
  if (TIER_RANK[fact.sourceTier] === undefined) return `invalid tier ${String(fact.sourceTier)}`;
  if (!ISO_DATE.test(fact.periodStart) || !ISO_DATE.test(fact.periodEnd)) return 'period dates must be YYYY-MM-DD';
  if (fact.periodEnd < fact.periodStart) return 'periodEnd before periodStart';
  if (Number.isNaN(parseInstant(fact.availableAt))) return 'availableAt is not a valid instant';
  return null;
}

function sameValue(a: Fact, b: Fact): boolean {
  const tolerance = a.unit === 'INR_CR' ? CONFLICT_ABS_TOLERANCE_CR : OTHER_UNIT_ABS_TOLERANCE;
  const left = a.valueCr as number;
  const right = b.valueCr as number;
  const larger = Math.max(Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Math.max(tolerance, CONFLICT_REL_TOLERANCE * larger);
}

/**
 * Immutable-vintage store for canonical period facts. Every write is insert-only: a correction or a
 * second source becomes a new vintage (vintage + 1, supersedes_id = previous latest) and no existing row
 * is ever updated or deleted. A write with a missing/NaN value is refused, so a failed fetch can never
 * hide a prior successful value. Differing values from different sources are kept in research_conflicts.
 */
export class FactStore {
  /** @param db a writable handle; production databases require a handle from openForWrite. */
  constructor(private readonly db: Database.Database) {
    if (db.readonly) throw new Error('FactStore needs a writable database handle');
    if (isProductionPath(db.name) && !isGuardedHandle(db)) {
      throw new Error('FactStore refuses an unguarded handle on a production database; use openForWrite');
    }
  }

  /** Write one fact as a new vintage (see class comment). The input's vintage/supersedesId are ignored. */
  writeFact(fact: Fact): WriteResult {
    return this.db.transaction(() => this.insertInTransaction(fact)).immediate();
  }

  /** Write many facts in ONE transaction; a thrown error rolls the whole batch back. */
  writeFacts(facts: readonly Fact[]): WriteResult[] {
    return this.db.transaction(() => facts.map((fact) => this.insertInTransaction(fact))).immediate();
  }

  /** All vintages of a fact key, oldest first. */
  listVintages(key: Pick<Fact, 'isin' | 'scope' | 'metric' | 'periodType' | 'periodStart' | 'periodEnd'>): Fact[] {
    const rows = this.db.prepare(
      `SELECT * FROM ${FACTS_TABLE} WHERE isin = ? AND scope = ? AND metric = ? AND period_type = ?
         AND period_start = ? AND period_end = ? ORDER BY vintage ASC`,
    ).all(key.isin, key.scope, key.metric, key.periodType, key.periodStart, key.periodEnd) as FactRow[];
    return rows.map(rowToFact);
  }

  /** Ids of facts named in OPEN conflicts. */
  openConflictFactIds(): Set<string> {
    const rows = this.db
      .prepare("SELECT fact_a, fact_b FROM research_conflicts WHERE status = 'OPEN'")
      .all() as Array<{ fact_a: string | null; fact_b: string | null }>;
    return new Set(rows.flatMap((row) => [row.fact_a, row.fact_b]).filter((id): id is string => !!id));
  }

  private insertInTransaction(fact: Fact): WriteResult {
    const invalid = invalidReason(fact);
    if (invalid) return { status: 'REJECTED', reason: 'INVALID_FACT', detail: invalid, conflictsRecorded: 0 };
    if (fact.sourceTier === 'SIMULATED') return { status: 'REJECTED', reason: 'SIMULATED_TIER', conflictsRecorded: 0 };
    if (typeof fact.valueCr !== 'number' || !Number.isFinite(fact.valueCr)) {
      return { status: 'REJECTED', reason: 'MISSING_VALUE', conflictsRecorded: 0 };
    }
    const vintages = this.listVintages(fact);
    const duplicate = vintages.find((old) => this.isIdentical(old, fact));
    if (duplicate) return { status: 'UNCHANGED', fact: duplicate, conflictsRecorded: 0 };
    const previous = vintages[vintages.length - 1];
    const stored = this.store(fact, previous);
    return { status: 'INSERTED', fact: stored, conflictsRecorded: this.recordConflicts(stored, vintages) };
  }

  /** Same source, tier, availability and value: re-running an ingestion must not add vintages. */
  private isIdentical(old: Fact, next: Fact): boolean {
    return old.source === next.source && old.sourceTier === next.sourceTier &&
      old.sourceRef === next.sourceRef && old.availableAt === next.availableAt &&
      old.valueCr === next.valueCr;
  }

  private store(fact: Fact, previous: Fact | undefined): Fact {
    const vintage = previous ? previous.vintage + 1 : 1;
    const factId = this.freeFactId(fact.factId, vintage);
    this.db.prepare(
      `INSERT INTO ${FACTS_TABLE} (fact_id, isin, symbol, scope, metric, period_type, period_start, period_end,
         value_cr, unit, source_tier, source, source_ref, available_at, vintage, supersedes_id, derivation_json,
         quality_flags, quarantined)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      factId, fact.isin, fact.symbol, fact.scope, fact.metric, fact.periodType, fact.periodStart, fact.periodEnd,
      fact.valueCr, fact.unit, fact.sourceTier, fact.source, fact.sourceRef || null, fact.availableAt, vintage,
      previous?.factId ?? null, fact.derivation ? JSON.stringify(fact.derivation) : null,
      JSON.stringify(fact.qualityFlags ?? []), fact.quarantined ? 1 : 0,
    );
    const stored: Fact = { ...fact, factId, vintage, qualityFlags: [...(fact.qualityFlags ?? [])] };
    delete stored.supersedesId;
    if (previous) stored.supersedesId = previous.factId;
    return stored;
  }

  private freeFactId(wanted: string, vintage: number): string {
    const exists = (id: string): boolean =>
      this.db.prepare(`SELECT 1 FROM ${FACTS_TABLE} WHERE fact_id = ?`).get(id) !== undefined;
    if (!exists(wanted)) return wanted;
    const candidate = `${wanted.replace(/@v\d+$/, '')}@v${vintage}`;
    if (exists(candidate)) throw new Error(`fact id collision for ${candidate}`);
    return candidate;
  }

  /** Compare the new fact with the latest vintage of every OTHER source; keep disagreements. */
  private recordConflicts(next: Fact, vintages: Fact[]): number {
    const latestBySource = new Map<string, Fact>();
    for (const old of vintages) if (old.source !== next.source) latestBySource.set(old.source, old);
    let recorded = 0;
    for (const old of latestBySource.values()) {
      if (old.valueCr === null || sameValue(old, next)) continue;
      const larger = Math.max(Math.abs(old.valueCr), Math.abs(next.valueCr as number)) || 1;
      this.db.prepare(
        `INSERT INTO research_conflicts (isin, metric, period_end, scope, fact_a, fact_b, value_a, value_b,
           rel_diff, status, note) VALUES (?,?,?,?,?,?,?,?,?,'OPEN',?)`,
      ).run(
        next.isin, next.metric, next.periodEnd, next.scope, old.factId, next.factId, old.valueCr, next.valueCr,
        Math.abs(old.valueCr - (next.valueCr as number)) / larger,
        `${old.source}/${old.sourceTier} vs ${next.source}/${next.sourceTier} for ${factKey(next)}`,
      );
      recorded += 1;
    }
    return recorded;
  }
}
