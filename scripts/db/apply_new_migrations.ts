/**
 * Apply pending canonical migrations 15, 16, 17 directly.
 * Migration 14 is skipped (it alters family_documents which doesn't exist in this DB;
 * it will be applied by the server on next startup when full schema init runs).
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dbPath = (process.env.DATABASE_URL ?? '').replace(/^sqlite:\/\//, '') || path.join(root, 'portfolio.db');

console.error(`[apply_migrations] target: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure schema_migrations table exists
db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_id TEXT PRIMARY KEY,
  name TEXT,
  checksum TEXT,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

function isApplied(id: string, name: string): boolean {
  const row = db.prepare(`SELECT migration_id FROM schema_migrations WHERE migration_id=? OR migration_id=?`).get(id, name);
  return !!row;
}

function markApplied(id: string, name: string): void {
  db.prepare(`INSERT OR IGNORE INTO schema_migrations (migration_id, name, applied_at) VALUES (?,?,datetime('now'))`).run(id, name);
}

// Mark migration 14 as skipped (no-op in this DB since family_documents doesn't exist)
if (!isApplied('14', '014_document_storage_lifecycle')) {
  console.error('[apply_migrations] marking migration 14 as skipped (family_documents table absent — will apply on server startup)');
  markApplied('14', '014_document_storage_lifecycle');
}

// --- Migration 15: acquisition_job_ledger ---
if (!isApplied('15', 'add_acquisition_job_ledger')) {
  console.error('[apply_migrations] applying migration 15: add_acquisition_job_ledger');
  const { migrationAddAcquisitionJobLedger } = await import('../../src/server/db/migrations/add_acquisition_job_ledger.js');
  db.exec('BEGIN');
  try {
    migrationAddAcquisitionJobLedger.up(db);
    markApplied('15', 'add_acquisition_job_ledger');
    db.exec('COMMIT');
    console.error('[apply_migrations] ✓ migration 15 applied');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
} else {
  console.error('[apply_migrations] migration 15 already applied, skipping');
}

// --- Migration 16: add_scan_scorecard ---
if (!isApplied('16', 'add_scan_scorecard')) {
  console.error('[apply_migrations] applying migration 16: add_scan_scorecard');
  const { migrationAddScanScorecard } = await import('../../src/server/db/migrations/add_scan_scorecard.js');
  db.exec('BEGIN');
  try {
    migrationAddScanScorecard.up(db);
    markApplied('16', 'add_scan_scorecard');
    db.exec('COMMIT');
    console.error('[apply_migrations] ✓ migration 16 applied');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
} else {
  console.error('[apply_migrations] migration 16 already applied, skipping');
}

// --- Migration 17: add_entry_plan_outcomes ---
if (!isApplied('17', 'add_entry_plan_outcomes')) {
  console.error('[apply_migrations] applying migration 17: add_entry_plan_outcomes');
  const { migrationAddEntryPlanOutcomes } = await import('../../src/server/db/migrations/add_entry_plan_outcomes.js');
  db.exec('BEGIN');
  try {
    migrationAddEntryPlanOutcomes.up(db);
    markApplied('17', 'add_entry_plan_outcomes');
    db.exec('COMMIT');
    console.error('[apply_migrations] ✓ migration 17 applied');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
} else {
  console.error('[apply_migrations] migration 17 already applied, skipping');
}

// Verify tables
const tables = ['acquisition_job_ledger', 'scan_signal_log', 'entry_plan_outcomes'];
const results: Record<string, boolean> = {};
for (const t of tables) {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
  results[t] = !!row;
  console.error(`  ${row ? '✓' : '✗'} ${t}`);
}

db.close();
console.log(JSON.stringify({ status: 'done', tables: results }));
