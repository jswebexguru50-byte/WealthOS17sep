/**
 * Apply canonical migrations 6–14 that were previously unapplied.
 * 6,7,8,9 create new tables; 9 creates family_documents; 14 alters it.
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

db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_id TEXT PRIMARY KEY, name TEXT, checksum TEXT,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

function isApplied(id: number, name: string): boolean {
  return !!(db.prepare(`SELECT 1 FROM schema_migrations WHERE migration_id=? OR migration_id=? OR name=?`)
    .get(String(id), name, name));
}

function markApplied(id: number, name: string): void {
  db.prepare(`INSERT OR IGNORE INTO schema_migrations (migration_id, name, applied_at) VALUES (?,?,datetime('now'))`)
    .run(String(id), name);
}

async function applyMigration(id: number, modulePath: string, exportName: string) {
  const mod = await import(modulePath);
  const migration = mod[exportName];
  if (!migration) throw new Error(`Export '${exportName}' not found in ${modulePath}`);
  const name: string = migration.name;
  if (isApplied(id, name)) {
    console.error(`  skip  ${id} ${name} (already applied)`);
    return;
  }
  console.error(`  apply ${id} ${name}`);
  db.exec('BEGIN');
  try {
    migration.up(db);
    markApplied(id, name);
    db.exec('COMMIT');
    console.error(`  ✓     ${id} ${name}`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

await applyMigration(6,  '../../src/server/db/migrations/006_family_governance_register.js', 'migration006');
await applyMigration(7,  '../../src/server/db/migrations/007_risk_policies_alerts.js',       'migration007');
await applyMigration(8,  '../../src/server/db/migrations/008_reports_nri_tracking.js',       'migration008');
await applyMigration(9,  '../../src/server/db/migrations/009_document_vault_compliance.js',  'migration009');
await applyMigration(14, '../../src/server/db/migrations/014_document_storage_lifecycle.js', 'migration014');

// Verify family_documents and its new columns
const cols = (db.prepare('PRAGMA table_info(family_documents)').all() as any[]).map(c => c.name);
const expected = ['mime_type', 'size_bytes', 'checksum_verified', 'last_verified_at', 'reminder_days'];
const missing = expected.filter(c => !cols.includes(c));

db.close();

if (missing.length) {
  console.error('  ✗ family_documents missing columns:', missing);
  process.exit(1);
} else {
  console.error('  ✓ family_documents has all expected columns');
  console.log(JSON.stringify({ status: 'done', applied: [6,7,8,9,14] }));
}
