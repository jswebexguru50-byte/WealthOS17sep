import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getDB, closeDB, initializeDatabase, runMigrations } from '../../src/server/database';
import * as databaseModule from '../../src/server/database';
import { dbRun, dbGet, dbAll } from '../../src/server/database';

const TEST_DB_PATH = path.join(__dirname, 'migration_test.sqlite');

describe('Delivery 2.x P5-D: SQLite Migration Verification', () => {
  beforeAll(async () => {
    // Ensure clean state
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    process.env.DB_PATH = TEST_DB_PATH;
  });

  afterAll(async () => {
    await closeDB();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  async function seedLegacyDatabase(db: any) {
    await dbRun(db, `DROP TABLE IF EXISTS DatasetPromotionManifests`);
    await dbRun(db, `DROP TABLE IF EXISTS DatasetPromotionManifests_Quarantine`);
    await dbRun(db, `
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

    // Valid historical row
    await dbRun(db, `
      INSERT INTO DatasetPromotionManifests (
        dataset_id, raw_sha256, canonical_sha256, source, provider, endpoint_version,
        requested_start, requested_end, actual_start, actual_end, coverage_pct,
        missing_ranges_json, pit_status, calendar_status, corporate_action_basis,
        verification_predicates_json, promotion_decision, promotion_reason, persisted_at
      ) VALUES (
        'DS-VALID-LEGACY', '${'a'.repeat(64)}', '${'b'.repeat(64)}', 'SRC', 'PROV', 'v1',
        '2024-01-01', '2024-01-02', '2024-01-01', '2024-01-02', 100,
        '[]', 'VERIFIED', 'VERIFIED', 'ADJUSTED',
        '["A"]', 'PROMOTED', 'Valid legacy', '2024-01-01T00:00:00Z'
      )
    `);

    // Invalid historical row (missing hash, but PROMOTED)
    await dbRun(db, `
      INSERT INTO DatasetPromotionManifests (
        dataset_id, raw_sha256, canonical_sha256, source, provider, endpoint_version,
        requested_start, requested_end, actual_start, actual_end, coverage_pct,
        missing_ranges_json, pit_status, calendar_status, corporate_action_basis,
        verification_predicates_json, promotion_decision, promotion_reason, persisted_at
      ) VALUES (
        'DS-INVALID-LEGACY', 'invalid', '${'b'.repeat(64)}', 'SRC', 'PROV', 'v1',
        '2024-01-01', '2024-01-02', '2024-01-01', '2024-01-02', 100,
        '[]', 'VERIFIED', 'VERIFIED', 'ADJUSTED',
        '["A"]', 'PROMOTED', 'Invalid legacy', '2024-01-01T00:00:00Z'
      )
    `);
  }

  it('detects existing invalid rows and quarantines them', async () => {
    const db = getDB();
    await seedLegacyDatabase(db);
    
    // Check initial state
    let validRow = await dbGet(db, "SELECT * FROM DatasetPromotionManifests WHERE dataset_id = 'DS-VALID-LEGACY'");
    let invalidRow = await dbGet(db, "SELECT * FROM DatasetPromotionManifests WHERE dataset_id = 'DS-INVALID-LEGACY'");
    expect(validRow).toBeDefined();
    expect(invalidRow).toBeDefined();

    // Verify foreign keys initial state
    const fkStateBefore = await dbGet<{foreign_keys: number}>(db, "PRAGMA foreign_keys");
    const isFkOn = fkStateBefore?.foreign_keys === 1;

    // Run migration
    await runMigrations(db);
    
    // Verify foreign keys restored
    const fkStateAfter = await dbGet<{foreign_keys: number}>(db, "PRAGMA foreign_keys");
    expect(fkStateAfter?.foreign_keys).toBe(fkStateBefore?.foreign_keys);

    // Valid rows should survive
    validRow = await dbGet(db, "SELECT * FROM DatasetPromotionManifests WHERE dataset_id = 'DS-VALID-LEGACY'");
    expect(validRow).toBeDefined();

    // Invalid rows should be absent from production
    invalidRow = await dbGet(db, "SELECT * FROM DatasetPromotionManifests WHERE dataset_id = 'DS-INVALID-LEGACY'");
    expect(invalidRow).toBeUndefined();
    
    // Quarantine assertions
    const quarantineRow: any = await dbGet(db, "SELECT * FROM DatasetPromotionManifests_Quarantine WHERE dataset_id = 'DS-INVALID-LEGACY'");
    expect(quarantineRow).toBeDefined();
    expect(quarantineRow.quarantine_reason).toContain('Missing/invalid raw_sha256');
    expect(quarantineRow.raw_sha256).toBe('invalid'); // Original hashes preserved
    
    // New invalid inserts should fail
    await expect(dbRun(db, `
      INSERT INTO DatasetPromotionManifests (
        dataset_id, raw_sha256, canonical_sha256, source, provider, endpoint_version,
        requested_start, requested_end, actual_start, actual_end, coverage_pct,
        missing_ranges_json, pit_status, calendar_status, corporate_action_basis,
        verification_predicates_json, promotion_decision, promotion_reason, persisted_at
      ) VALUES (
        'DS-NEW-INVALID', 'bad', '${'b'.repeat(64)}', 'SRC', 'PROV', 'v1',
        '2024-01-01', '2024-01-02', '2024-01-01', '2024-01-02', 100,
        '[]', 'VERIFIED', 'VERIFIED', 'ADJUSTED',
        '["A"]', 'PROMOTED', 'New invalid', '2024-01-01T00:00:00Z'
      )
    `)).rejects.toThrow();
  });

  it('runs migrations idempotently without duplication or corruption', async () => {
    const db = getDB();
    await seedLegacyDatabase(db);
    
    await runMigrations(db);
    await runMigrations(db); // Run twice
    
    const validRows = await dbAll(db, "SELECT * FROM DatasetPromotionManifests");
    expect(validRows.length).toBe(1);

    const quarantineRows = await dbAll(db, "SELECT * FROM DatasetPromotionManifests_Quarantine");
    expect(quarantineRows.length).toBe(1); // No duplicates
  });

  it('rolls back on transaction failure during migration', async () => {
    const db = getDB();
    await seedLegacyDatabase(db);
    
    // Force a failure during the migration transaction
    // Specifically, when it tries to drop the old table, we throw an error.
    const originalDbRun = db.run.bind(db);
    let dropOldTableHit = false;

    db.run = function(sql: string, ...args: any[]) {
      if (typeof sql === 'string' && sql.includes('DROP TABLE _DatasetPromotionManifests_old')) {
        dropOldTableHit = true;
        const callback = args[args.length - 1];
        if (typeof callback === 'function') {
          callback(new Error("Injected failure during table drop"));
        }
        return this as any;
      }
      return originalDbRun(sql, ...args);
    } as any;

    try {
      await runMigrations(db);
      throw new Error("Should have thrown");
    } catch (e: any) {
      expect(e.message).toBe("Injected failure during table drop");
    }

    expect(dropOldTableHit).toBe(true);
    db.run = originalDbRun;

    // Because of rollback, the original table should still exist and not have the constraint.
    // The invalid row should still be in the original table because the transaction rolled back.
    const invalidRow = await dbGet(db, "SELECT * FROM DatasetPromotionManifests WHERE dataset_id = 'DS-INVALID-LEGACY'");
    expect(invalidRow).toBeDefined();

    // Original database remains recoverable and uncorrupted.
    const validRow = await dbGet(db, "SELECT * FROM DatasetPromotionManifests WHERE dataset_id = 'DS-VALID-LEGACY'");
    expect(validRow).toBeDefined();
  });
});
