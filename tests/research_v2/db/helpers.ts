import Database from 'better-sqlite3';
import type { Fact } from '../../../src/server/research_v2/domain/types.js';
import { applyResearchV2Schema } from '../../../src/server/db/migrations/research_v2_migration.js';

/** In-memory database with the research v2 schema applied. */
export function schemaDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyResearchV2Schema(db);
  return db;
}

/** A valid statutory consolidated quarterly revenue fact; any field can be overridden. */
export function fact(overrides: Partial<Fact> = {}): Fact {
  return {
    factId: 'f1', isin: 'INE000000001', symbol: 'TATATECH', scope: 'CONSOLIDATED', metric: 'revenue_from_operations',
    periodType: 'DISCRETE_Q', periodStart: '2025-04-01', periodEnd: '2025-06-30', valueCr: 100, unit: 'INR_CR',
    sourceTier: 'STATUTORY', source: 'XBRL', sourceRef: 'ref', availableAt: '2025-08-01T00:00:00Z', vintage: 1,
    qualityFlags: [], quarantined: false, ...overrides,
  };
}
