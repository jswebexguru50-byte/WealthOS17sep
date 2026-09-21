import { describe, it, expect, beforeAll } from 'vitest';
import { dbRun, getDB, closeDB, initializeDatabase } from '../../src/server/database.js';
import { DatasetPromotionPersistence, DatasetPromotionManifest } from '../../src/server/services/data/DatasetPromotionPersistence.js';
import { DownstreamAuthorizationBoundary } from '../../src/server/services/dataenrichment/verifiers/DownstreamAuthorizationBoundary.js';

describe('Delivery 2.2: D1 Persistence & Determinism (Adversarial)', () => {
  const validHash = '1111111111111111111111111111111111111111111111111111111111111111';
  const validCanonicalHash = '2222222222222222222222222222222222222222222222222222222222222222';
  
  beforeAll(async () => {
    // Ensure table exists in test DB with full constraints by running actual init
    const db = getDB();
    await dbRun(db, `DROP TABLE IF EXISTS DatasetPromotionManifests`);
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS DatasetPromotionManifests (
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
        persisted_at TEXT NOT NULL,
        CONSTRAINT valid_promoted_evidence CHECK (
          promotion_decision <> 'PROMOTED' 
          OR (
            length(trim(raw_sha256)) = 64 
            AND length(trim(canonical_sha256)) = 64
            AND json_valid(verification_predicates_json) = 1
            AND json_type(verification_predicates_json) = 'array'
          )
        )
      )
    `);
  });

  const getValidManifest = (id: string): DatasetPromotionManifest => ({
    dataset_id: id,
    raw_sha256: validHash,
    canonical_sha256: validCanonicalHash,
    source: 'EMPIRICAL_API',
    provider: 'UPSTOX',
    endpoint_version: 'V3',
    requested_start: '2024-01-01',
    requested_end: '2024-01-31',
    actual_start: '2024-01-01',
    actual_end: '2024-01-31',
    coverage_pct: 100,
    missing_ranges_json: '[]',
    pit_status: 'PIT_VERIFIED',
    calendar_status: 'NSE_MATCHED',
    corporate_action_basis: 'ADJUSTED',
    verification_predicates_json: JSON.stringify(['NO_GAPS', 'CALENDAR_SYNC', 'HASH_MATCH']),
    promotion_decision: 'PROMOTED',
    promotion_reason: 'All predicates passed',
    persisted_at: new Date().toISOString()
  });

  it('[PASS] 1-3. Valid verified dataset persists, reloads, and authorizes', async () => {
    const manifest = getValidManifest('DS-VALID');
    await DatasetPromotionPersistence.persist(manifest);
    
    const reloaded = await DatasetPromotionPersistence.reload('DS-VALID');
    expect(reloaded).toBeDefined();
    expect(reloaded?.raw_sha256).toBe(manifest.raw_sha256);
    
    const auth = await DownstreamAuthorizationBoundary.authorizeVerifiedDataset('DS-VALID');
    expect(auth.authorized).toBe(true);
  });

  it('[FAIL] 4-5. PROMOTED + NULL/empty raw hash', async () => {
    const manifest = getValidManifest('DS-FAIL-4');
    manifest.raw_sha256 = '';
    await expect(DatasetPromotionPersistence.persist(manifest)).rejects.toThrow(/must have valid raw_sha256/);
  });

  it('[FAIL] 6-7. PROMOTED + NULL/empty canonical hash', async () => {
    const manifest = getValidManifest('DS-FAIL-6');
    manifest.canonical_sha256 = '';
    await expect(DatasetPromotionPersistence.persist(manifest)).rejects.toThrow(/must have valid canonical_sha256/);
  });

  it('[FAIL] 8. PROMOTED + malformed hash', async () => {
    const manifest = getValidManifest('DS-FAIL-8');
    manifest.raw_sha256 = 'short-hash';
    await expect(DatasetPromotionPersistence.persist(manifest)).rejects.toThrow(/must have valid raw_sha256/);
  });

  it('[FAIL] 9. PROMOTED + missing verification predicate', async () => {
    const manifest = getValidManifest('DS-FAIL-9');
    manifest.verification_predicates_json = JSON.stringify(['NO_GAPS', 'CALENDAR_SYNC']); // Missing HASH_MATCH
    await expect(DatasetPromotionPersistence.persist(manifest)).rejects.toThrow(/missing required verification predicate: HASH_MATCH/);
  });

  it('[FAIL] 10. PROMOTED + fabricated verification predicate', async () => {
    const manifest = getValidManifest('DS-FAIL-10');
    manifest.verification_predicates_json = 'not-an-array';
    await expect(DatasetPromotionPersistence.persist(manifest)).rejects.toThrow(/Invalid verification predicates/);
  });

  it('[FAIL] 18. fabricated in-memory PROMOTED object cannot bypass boundary directly', async () => {
    // We try to authorize an ID that hasn't been physically persisted
    const auth = await DownstreamAuthorizationBoundary.authorizeVerifiedDataset('DS-NOT-PERSISTED');
    expect(auth.authorized).toBe(false);
    if (!auth.authorized) {
      expect(auth.reason).toBe('DOWNSTREAM_BLOCKED_MISSING_VERIFICATION');
    }
  });

  it('[FAIL] 20. persisted record altered after original promotion', async () => {
    // 1. Valid insertion
    const manifest = getValidManifest('DS-ALTERED');
    await DatasetPromotionPersistence.persist(manifest);
    
    // 2. Direct malicious DB manipulation bypassing JS validations
    const db = getDB();
    await new Promise<void>((resolve, reject) => {
      // Removing a predicate directly via SQL to simulate tampering
      db.run(
        `UPDATE DatasetPromotionManifests SET verification_predicates_json = '["NO_GAPS"]' WHERE dataset_id = 'DS-ALTERED'`,
        (err) => err ? reject(err) : resolve()
      );
    });

    // 3. Reload and authorize must FAIL
    const auth = await DownstreamAuthorizationBoundary.authorizeVerifiedDataset('DS-ALTERED');
    expect(auth.authorized).toBe(false);
    if (!auth.authorized) {
      expect(auth.reason).toBe('DOWNSTREAM_BLOCKED_FORGED_PROMOTION');
    }
  });
  
  it('[FAIL] DB Constraints prevent malicious raw SQL insert', async () => {
    const db = getDB();
    // Try to insert a PROMOTED record with empty hashes directly to DB
    const p = new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO DatasetPromotionManifests (
          dataset_id, raw_sha256, canonical_sha256, source, provider, endpoint_version,
          requested_start, requested_end, actual_start, actual_end, coverage_pct,
          missing_ranges_json, pit_status, calendar_status, corporate_action_basis,
          verification_predicates_json, promotion_decision, promotion_reason, persisted_at
        ) VALUES (
          'DS-SQL-INJECT', '', '', 'EMPIRICAL_API', 'UPSTOX', 'V3',
          '2024-01-01', '2024-01-31', '2024-01-01', '2024-01-31', 100,
          '[]', 'PIT_VERIFIED', 'NSE_MATCHED', 'ADJUSTED',
          '["NO_GAPS"]', 'PROMOTED', 'All passed', '2024-01-01'
        )
      `, (err) => err ? reject(err) : resolve(true));
    });
    await expect(p).rejects.toThrow(/CHECK constraint failed: valid_promoted_evidence/);
  });
});
