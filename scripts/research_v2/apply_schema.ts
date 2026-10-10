import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyResearchV2Schema } from '../../src/server/db/migrations/research_v2_migration.js';
import { openForWrite, assertSafeWrite, DbGuardError } from '../../src/server/research_v2/db/dbGuard.js';

function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const target = arg('--db');
const write = process.argv.includes('--write');
if (!target) { console.error('Usage: tsx scripts/research_v2/apply_schema.ts --db <explicit-copy> [--write]'); process.exit(2); }
if (!write) {
  const db = new Database(target, { readonly: true, fileMustExist: true });
  try { const before = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'research_%'").all(); console.log(JSON.stringify({ mode: 'dry-run', db: path.resolve(target), existingResearchTables: before })); }
  finally { db.close(); }
  process.exit(0);
}
try {
  const report = openForWrite({ dbPath: target, allowProduction: false }, db => applyResearchV2Schema(db));
  console.log(JSON.stringify({ mode: 'write', db: path.resolve(target), report }));
} catch (error) {
  const e = error as Error;
  console.error(e instanceof DbGuardError ? e.message : `SCHEMA_APPLY_FAILED: ${e.message}`);
  process.exit(1);
}
