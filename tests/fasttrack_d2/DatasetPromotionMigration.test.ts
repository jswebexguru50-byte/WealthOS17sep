import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getDB, closeDB, initializeDatabase, runMigrations } from '../../src/server/database';
import { dbRun, dbGet, dbAll } from '../../src/server/database';
import { DatasetPromotionPersistence } from '../../src/server/services/DatasetPromotionPersistence';

const TEST_DB_PATH = path.join(__dirname, 'migration_test.sqlite');

describe('Delivery 2.x P5-D: SQLite Migration Verification', () => {
  beforeAll(async () => {
    // Ensure clean state
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    process.env.DB_PATH = TEST_DB_PATH;
    
    const db = getDB();
    // 1. Create a simulated "legacy" database without the P4 invariant
    await dbRun(db, `DROP TABLE IF EXISTS DatasetPromotionManifests`);
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

    // 2. Insert valid historical row
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

    // 3. Insert invalid historical row (missing hash, but PROMOTED)
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
  });

  afterAll(async () => {
    await closeDB();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('detects existing invalid rows and quarantines them', async () => {
    const db = getDB();
    await runMigrations(db);
    
    // Valid rows should survive
    const validRow = await dbGet(db, "SELECT * FROM DatasetPromotionManifests WHERE dataset_id = 'DS-VALID-LEGACY'");
    expect(validRow).toBeDefined();

    // Invalid rows should be quarantined (moved or deleted, based on policy)
    const invalidRow = await dbGet(db, "SELECT * FROM DatasetPromotionManifests WHERE dataset_id = 'DS-INVALID-LEGACY'");
    expect(invalidRow).toBeUndefined(); // Assuming policy is drop or move, not keep in main table
    
    // Schema should now contain the constraint
    // We can test this by intentionally trying to insert a bad row
    let errorCaught = false;
    try {
       await dbRun(db, `
        INSERT INTO DatasetPromotionManifests (
          dataset_id, raw_sha256, canonical_sha256, source, provider, endpoint_version,
          requested_start, requested_end, actual_start, actual_end, coverage_pct,
          missing_ranges_json, pit_status, calendar_status, corporate_action_basis,
          verification_predicates_json, promotion_decision, promotion_reason, persisted_at
        ) VALUES (
          'DS-NEW-INVALID', 'bad', 'b'.repeat(64), 'SRC', 'PROV', 'v1',
          '2024-01-01', '2024-01-02', '2024-01-01', '2024-01-02', 100,
          '[]', 'VERIFIED', 'VERIFIED', 'ADJUSTED',
          '["A"]', 'PROMOTED', 'New invalid', '2024-01-01T00:00:00Z'
        )
      `);
    } catch (e) {
      errorCaught = true;
    }
    expect(errorCaught).toBe(true);
  });
});
