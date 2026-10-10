import type Database from 'better-sqlite3';
import type { Fact } from '../domain/types.js';
import type { FactQuery } from '../domain/factSource.js';
import { selectVintages } from './factStore.js';
import type { ExplainableFactSource } from './inMemoryFactSource.js';
import {
  applyReadPolicy, factsOrThrowOnMixedScope, type PolicyResult, type ReadPolicyOptions,
} from './readPolicy.js';

export interface SqliteFactSourceOptions extends ReadPolicyOptions {
  /** Load OPEN research_conflicts ids on every read (needed for requireResolvedConflicts). */
  loadOpenConflicts?: boolean;
}

function openConflictIds(db: Database.Database): Set<string> {
  const rows = db
    .prepare("SELECT fact_a, fact_b FROM research_conflicts WHERE status = 'OPEN'")
    .all() as Array<{ fact_a: string | null; fact_b: string | null }>;
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.fact_a) ids.add(row.fact_a);
    if (row.fact_b) ids.add(row.fact_b);
  }
  return ids;
}

/**
 * FactSource over research_canonical_period_facts. Read-only (SELECT only): it works on a handle opened
 * with { readonly: true }. SQL narrows by isin/symbol/scope/metric/period type; availability, vintage
 * selection and every rejection rule run in JavaScript through the shared read policy.
 */
export function createSqliteFactSource(
  db: Database.Database, options: SqliteFactSourceOptions = {},
): ExplainableFactSource {
  const run = (query: FactQuery): { result: PolicyResult; candidates: Fact[] } => {
    const candidates = selectVintages(db, query);
    const conflicted = options.loadOpenConflicts || options.requireResolvedConflicts
      ? openConflictIds(db)
      : options.conflictedFactIds;
    const policy = { ...options, conflictedFactIds: conflicted };
    return { result: applyReadPolicy(candidates, query, policy), candidates };
  };
  return {
    facts(query: FactQuery): Fact[] {
      const { result, candidates } = run(query);
      return factsOrThrowOnMixedScope(result, candidates);
    },
    explain(query: FactQuery): PolicyResult {
      return run(query).result;
    },
  };
}
