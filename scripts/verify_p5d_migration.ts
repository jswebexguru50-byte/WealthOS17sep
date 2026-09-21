import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { runMigrations, getDB, closeDB } from '../src/server/database';

const DB_PATH = path.join(process.cwd(), 'scripts', 'p5d_migration_verify.sqlite');
process.env.DB_PATH = DB_PATH;
process.env.TEST_ENV = 'true'; // bypass auto-restore

// Helper for db operations
const run = (db: sqlite3.Database, sql: string, params: any[] = []) => new Promise((res, rej) => db.run(sql, params, err => err ? rej(err) : res(undefined)));
const all = (db: sqlite3.Database, sql: string, params: any[] = []) => new Promise<any[]>((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

async function getFingerprint(db: sqlite3.Database) {
  const rows = await all(db, "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name");
  return rows.map(r => r.sql).join('\n');
}

async function verify() {
  console.log("=== P5-D MIGRATION INDEPENDENT VERIFICATION ===");
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  
  const db = new sqlite3.Database(DB_PATH);
  
  // 1. Setup Legacy Schema
  await run(db, `
    CREATE TABLE DatasetPromotionManifests (
      dataset_id TEXT PRIMARY KEY,
      raw_sha256 TEXT NOT NULL,
      canonical_sha256 TEXT NOT NULL,
      source TEXT NOT NULL,
      provider TEXT NOT NULL,
      endpoint_version TEXT NOT NULL,
      requested_start TEXT NOT NULL,
      requested_end TEXT NOT NULL,
      actual_start TEXT NOT NULL,
      actual_end TEXT NOT NULL,
      coverage_pct REAL NOT NULL,
      missing_ranges_json TEXT NOT NULL,
      pit_status TEXT NOT NULL,
      calendar_status TEXT NOT NULL,
      corporate_action_basis TEXT NOT NULL,
      verification_predicates_json TEXT NOT NULL,
      promotion_decision TEXT NOT NULL,
      promotion_reason TEXT NOT NULL,
      persisted_at TEXT NOT NULL
    )
  `);
  
  // Also create a dummy table to test preservation of unrelated schema
  await run(db, `CREATE TABLE UnrelatedTable (id INTEGER PRIMARY KEY)`);
  
  const preFingerprint = await getFingerprint(db);
  
  // 2. Insert Adversarial Data
  const insertQuery = `
    INSERT INTO DatasetPromotionManifests (
      dataset_id, raw_sha256, canonical_sha256, source, provider, endpoint_version,
      requested_start, requested_end, actual_start, actual_end, coverage_pct,
      missing_ranges_json, pit_status, calendar_status, corporate_action_basis,
      verification_predicates_json, promotion_decision, promotion_reason, persisted_at
    ) VALUES (?, ?, ?, 'SRC', 'PROV', 'v1', '2024-01-01', '2024-01-02', '2024-01-01', '2024-01-02', 100, '[]', 'VERIFIED', 'VERIFIED', 'ADJUSTED', ?, ?, 'Reason', '2024-01-01T00:00:00Z')
  `;
  
  const validHash1 = 'a'.repeat(64);
  const validHash2 = 'b'.repeat(64);
  const invalidHash = 'invalid';
  
  await run(db, insertQuery, ['VALID_1', validHash1, validHash2, '["A"]', 'PROMOTED']);
  await run(db, insertQuery, ['VALID_NON_PROMOTED', invalidHash, invalidHash, '["A"]', 'REJECTED']); // invalid hash but REJECTED is fine
  await run(db, insertQuery, ['INVALID_MISSING_RAW', invalidHash, validHash2, '["A"]', 'PROMOTED']);
  await run(db, insertQuery, ['INVALID_MISSING_CANONICAL', validHash1, invalidHash, '["A"]', 'PROMOTED']);
  await run(db, insertQuery, ['INVALID_BOTH', invalidHash, invalidHash, '["A"]', 'PROMOTED']);
  await run(db, insertQuery, ['INVALID_PREDICATES', validHash1, validHash2, '{"not": "array"}', 'PROMOTED']);
  await run(db, insertQuery, ['MALFORMED_JSON', validHash1, validHash2, 'not-json', 'PROMOTED']);
  
  const initialCount = (await all(db, 'SELECT COUNT(*) as c FROM DatasetPromotionManifests'))[0].c;
  console.log(`Initial rows inserted: ${initialCount} (2 valid, 5 invalid)`);

  // 3. Run Migration
  console.log("Running migration...");
  await runMigrations(db);

  // 4. Verify post-migration state
  const postFingerprint = await getFingerprint(db);
  const diffLines = postFingerprint.split('\n').filter(line => !preFingerprint.includes(line));
  console.log("Schema Additions/Changes:");
  diffLines.forEach(l => console.log(' + ' + l));
  
  const missingLines = preFingerprint.split('\n').filter(line => !postFingerprint.includes(line));
  console.log("Schema Removals:");
  missingLines.forEach(l => console.log(' - ' + l));

  // 5. Verify Row Preservation & Quarantine
  const migratedCount = (await all(db, 'SELECT COUNT(*) as c FROM DatasetPromotionManifests'))[0].c;
  const quarantinedCount = (await all(db, 'SELECT COUNT(*) as c FROM DatasetPromotionManifests_Quarantine'))[0].c;
  console.log(`Migrated rows: ${migratedCount} (Expected: 2)`);
  console.log(`Quarantined rows: ${quarantinedCount} (Expected: 5)`);
  
  if (migratedCount !== 2 || quarantinedCount !== 5) {
    throw new Error('MIGRATION ROW COUNTS DO NOT MATCH');
  }

  // 6. Verify Idempotence
  console.log("Running migration second time (Idempotence check)...");
  await runMigrations(db);
  const migratedCount2 = (await all(db, 'SELECT COUNT(*) as c FROM DatasetPromotionManifests'))[0].c;
  const quarantinedCount2 = (await all(db, 'SELECT COUNT(*) as c FROM DatasetPromotionManifests_Quarantine'))[0].c;
  if (migratedCount2 !== 2 || quarantinedCount2 !== 5) {
    throw new Error('IDEMPOTENCE FAILED');
  }
  console.log("Idempotence verified. Counts unchanged.");

  // 7. Verify Constraint Enforcement
  try {
    await run(db, insertQuery, ['DIRECT_INVALID', invalidHash, validHash2, '["A"]', 'PROMOTED']);
    throw new Error('CONSTRAINT NOT ENFORCED');
  } catch (e: any) {
    if (e.message === 'CONSTRAINT NOT ENFORCED') throw e;
    console.log("Constraint properly rejects direct invalid insert:", e.message);
  }

  // Clean up
  db.close();
  console.log("=== P5-D VERIFICATION PASS ===");
}

verify().catch(console.error);
