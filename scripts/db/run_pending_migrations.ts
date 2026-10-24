import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { Migrator } from '../../src/server/db/migrator.js';
import { canonicalMigrations } from '../../src/server/db/migrations/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dbPath = (process.env.DATABASE_URL ?? '').replace(/^sqlite:\/\//, '') || path.join(root, 'portfolio.db');

console.error(`[run_pending_migrations] target: ${dbPath}`);
console.error(`[run_pending_migrations] migrations registered: ${canonicalMigrations.length}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migrator = new Migrator(canonicalMigrations);
const result = await migrator.runPending(db);

console.log(JSON.stringify({ applied: result.applied, currentVersion: result.currentVersion }, null, 2));

// Verify the three new tables exist
const tables = ['acquisition_job_ledger', 'scan_signal_log', 'entry_plan_outcomes'];
for (const t of tables) {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
  console.error(`  ${row ? '✓' : '✗'} ${t}`);
}

db.close();
