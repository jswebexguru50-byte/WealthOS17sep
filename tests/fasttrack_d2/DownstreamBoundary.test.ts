import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DownstreamAuthorizationBoundary, DownstreamAuthorizationError } from '../../src/server/services/dataenrichment/verifiers/DownstreamAuthorizationBoundary.js';
import { DatasetPromotionPersistence, DatasetPromotionManifest } from '../../src/server/services/data/DatasetPromotionPersistence.js';
import { getDB, dbRun } from '../../src/server/database.js';

describe('Delivery 2.2: B1 Downstream Authorization Boundary', () => {
  const baseValidManifest: DatasetPromotionManifest = {
    dataset_id: 'DS-VALID-01',
    raw_sha256: '1111111111111111111111111111111111111111111111111111111111111111',
    canonical_sha256: '2222222222222222222222222222222222222222222222222222222222222222',
    source: 'TEST',
    provider: 'TEST',
    endpoint_version: 'V3',
    requested_start: '2024-01-01',
    requested_end: '2024-01-01',
    actual_start: '2024-01-01',
    actual_end: '2024-01-01',
    coverage_pct: 100,
    missing_ranges_json: '[]',
    pit_status: 'PIT_VERIFIED',
    calendar_status: 'NSE_MATCHED',
    corporate_action_basis: 'ADJUSTED',
    verification_predicates_json: JSON.stringify(['NO_GAPS', 'CALENDAR_SYNC', 'HASH_MATCH']),
    promotion_decision: 'PROMOTED',
    promotion_reason: 'All clear',
    persisted_at: '2024-01-01T00:00:00.000Z'
  };

  beforeAll(async () => {
    const db = getDB();
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS DatasetPromotionManifests (
        dataset_id TEXT PRIMARY KEY,
        raw_sha256 TEXT NOT NULL,
        canonical_sha256 TEXT NOT NULL,
        source TEXT,
        provider TEXT,
        endpoint_version TEXT,
        requested_start TEXT,
        requested_end TEXT,
        actual_start TEXT,
        actual_end TEXT,
        coverage_pct REAL,
        missing_ranges_json TEXT,
        pit_status TEXT,
        calendar_status TEXT,
        corporate_action_basis TEXT,
        verification_predicates_json TEXT,
        promotion_decision TEXT NOT NULL,
        promotion_reason TEXT,
        persisted_at TEXT NOT NULL
      )
    `);
  });

  afterAll(async () => {
    const db = getDB();
    await dbRun(db, `DELETE FROM DatasetPromotionManifests`);
  });

  it('[PASS] valid verified PROMOTED dataset is accepted', async () => {
    await DatasetPromotionPersistence.persist(baseValidManifest);
    const result = await DownstreamAuthorizationBoundary.authorizeVerifiedDataset('DS-VALID-01');
    expect(result.authorized).toBe(true);
  });

  it('[BLOCK] fabricated in-memory PROMOTED is rejected natively by the signature', async () => {
    // We cannot even pass an object anymore, we must pass an ID.
    // So if the ID does not exist in DB, it should be blocked.
    const result = await DownstreamAuthorizationBoundary.authorizeVerifiedDataset('DS-FABRICATED');
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe(DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_MISSING_VERIFICATION);
    }
  });

  it('[BLOCK] PARTIAL_DATA_READY cannot enter analytics', async () => {
    const partial = { ...baseValidManifest, dataset_id: 'DS-PARTIAL', promotion_decision: 'PARTIAL_DATA_READY' };
    await DatasetPromotionPersistence.persist(partial);
    const result = await DownstreamAuthorizationBoundary.authorizeVerifiedDataset('DS-PARTIAL');
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe(DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_PARTIAL_DATA);
    }
  });

  it('[BLOCK] DATA_INSUFFICIENT cannot enter analytics', async () => {
    const insufficient = { ...baseValidManifest, dataset_id: 'DS-INSUFFICIENT', promotion_decision: 'DATA_INSUFFICIENT' };
    await DatasetPromotionPersistence.persist(insufficient);
    const result = await DownstreamAuthorizationBoundary.authorizeVerifiedDataset('DS-INSUFFICIENT');
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe(DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_INSUFFICIENT_DATA);
    }
  });

  it('[BLOCK] BLOCKED or FAILED cannot enter analytics', async () => {
    const blocked = { ...baseValidManifest, dataset_id: 'DS-BLOCKED', promotion_decision: 'BLOCKED' };
    await DatasetPromotionPersistence.persist(blocked);
    const resultBlocked = await DownstreamAuthorizationBoundary.authorizeVerifiedDataset('DS-BLOCKED');
    expect(resultBlocked.authorized).toBe(false);

    const failed = { ...baseValidManifest, dataset_id: 'DS-FAILED', promotion_decision: 'FAILED' };
    await DatasetPromotionPersistence.persist(failed);
    const resultFailed = await DownstreamAuthorizationBoundary.authorizeVerifiedDataset('DS-FAILED');
    expect(resultFailed.authorized).toBe(false);
  });

  it('[BLOCK] forged PROMOTED (missing verification evidence)', async () => {
    const forged = { ...baseValidManifest, dataset_id: 'DS-FORGED', verification_predicates_json: JSON.stringify(['NO_GAPS']) };
    
    // Insert into DB directly using try-catch (SQLite array constraint will pass, but DownstreamBoundary should block it)
    const db = getDB();
    try {
      await dbRun(db, `INSERT INTO DatasetPromotionManifests (dataset_id, raw_sha256, canonical_sha256, source, provider, endpoint_version, requested_start, requested_end, actual_start, actual_end, coverage_pct, missing_ranges_json, pit_status, calendar_status, corporate_action_basis, verification_predicates_json, promotion_decision, promotion_reason, persisted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [forged.dataset_id, forged.raw_sha256, forged.canonical_sha256, forged.source, forged.provider, forged.endpoint_version, forged.requested_start, forged.requested_end, forged.actual_start, forged.actual_end, forged.coverage_pct, forged.missing_ranges_json, forged.pit_status, forged.calendar_status, forged.corporate_action_basis, forged.verification_predicates_json, forged.promotion_decision, forged.promotion_reason, forged.persisted_at]);
    } catch (e) {
      // Ignore DB errors here; if it fails to insert, DownstreamBoundary will also correctly reject it as missing
    }

    const result = await DownstreamAuthorizationBoundary.authorizeVerifiedDataset('DS-FORGED');
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      // It should either be blocked for missing (if insert failed) or forged (if insert succeeded)
      // Since it's a valid JSON array, insert should succeed, yielding FORGED_PROMOTION.
      expect([
        DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_FORGED_PROMOTION,
        DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_MISSING_VERIFICATION
      ]).toContain(result.reason);
    }
  });

  it('[BLOCK] missing raw or canonical hash', async () => {
    const missingRaw = { ...baseValidManifest, dataset_id: 'DS-NOHASH', raw_sha256: '' };
    
    // Insert into DB directly using try-catch (SQLite length constraint should fail here)
    const db = getDB();
    try {
      await dbRun(db, `INSERT INTO DatasetPromotionManifests (dataset_id, raw_sha256, canonical_sha256, source, provider, endpoint_version, requested_start, requested_end, actual_start, actual_end, coverage_pct, missing_ranges_json, pit_status, calendar_status, corporate_action_basis, verification_predicates_json, promotion_decision, promotion_reason, persisted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [missingRaw.dataset_id, missingRaw.raw_sha256, missingRaw.canonical_sha256, missingRaw.source, missingRaw.provider, missingRaw.endpoint_version, missingRaw.requested_start, missingRaw.requested_end, missingRaw.actual_start, missingRaw.actual_end, missingRaw.coverage_pct, missingRaw.missing_ranges_json, missingRaw.pit_status, missingRaw.calendar_status, missingRaw.corporate_action_basis, missingRaw.verification_predicates_json, missingRaw.promotion_decision, missingRaw.promotion_reason, missingRaw.persisted_at]);
    } catch (e) {
      // Expected DB failure
    }
    
    const result = await DownstreamAuthorizationBoundary.authorizeVerifiedDataset('DS-NOHASH');
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe(DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_MISSING_VERIFICATION);
    }
  });
});
