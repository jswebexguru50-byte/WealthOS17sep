/**
 * migrate_gate_b1_canonical_schema.ts
 *
 * Explicit Gate B.1 migration for Canonical Fact Layer:
 * Adds availableAt, publishedAt, derivationFormula, and inputFactIds to company_facts.
 *
 * Invariants:
 * - Runtime code NEVER executes DDL.
 * - This migration script is executed during explicit setup / migration only.
 * - availableAt enforces true Point-In-Time (PIT) boundary: availableAt <= asOfDate.
 */

import Database from 'better-sqlite3';
import path from 'path';

const PORTFOLIO_DB_PATH = path.resolve('portfolio.db');

export function migrateCanonicalSchema(): void {
  const db = new Database(PORTFOLIO_DB_PATH);

  console.log('--- Migrating company_facts schema in portfolio.db ---');

  const tableInfo = db.prepare('PRAGMA table_info(company_facts)').all() as Array<{ name: string }>;
  const existingCols = new Set(tableInfo.map(c => c.name));

  if (!existingCols.has('availableAt')) {
    console.log('Adding column: availableAt');
    db.prepare('ALTER TABLE company_facts ADD COLUMN availableAt TEXT').run();
  }

  if (!existingCols.has('publishedAt')) {
    console.log('Adding column: publishedAt');
    db.prepare('ALTER TABLE company_facts ADD COLUMN publishedAt TEXT').run();
  }

  if (!existingCols.has('derivationFormula')) {
    console.log('Adding column: derivationFormula');
    db.prepare('ALTER TABLE company_facts ADD COLUMN derivationFormula TEXT').run();
  }

  if (!existingCols.has('inputFactIds')) {
    console.log('Adding column: inputFactIds');
    db.prepare('ALTER TABLE company_facts ADD COLUMN inputFactIds TEXT').run();
  }

  // Backfill availableAt and publishedAt from reportedAt / asOfDate
  console.log('Backfilling publishedAt and availableAt for PIT correctness...');
  db.prepare(`
    UPDATE company_facts
    SET publishedAt = COALESCE(publishedAt, reportedAt, asOfDate),
        availableAt = COALESCE(availableAt, reportedAt, asOfDate)
    WHERE availableAt IS NULL OR publishedAt IS NULL
  `).run();

  // Create index on (isin, metric, availableAt) and (symbol, metric, availableAt) for fast PIT lookups
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_company_facts_pit_isin
    ON company_facts(isin, metric, availableAt)
  `).run();

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_company_facts_pit_symbol
    ON company_facts(symbol, metric, availableAt)
  `).run();

  console.log('Migration complete. PIT indexes created.');
}

migrateCanonicalSchema();
