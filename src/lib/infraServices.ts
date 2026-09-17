/**
 * INFRA-3, INFRA-4, INFRA-5, INFRA-6: Foundational Infrastructure Services
 * Spec: dev_spec_opportunity_engine.md Section 2 (Phase 0)
 */

import crypto from 'crypto';
import { dbAll, dbGet, dbRun, getDB } from '../server/database.js';

// Database query helpers passing active DB instance
const run = (sql: string, params: any[] = []) => dbRun(getDB(), sql, params);
const all = <T = any>(sql: string, params: any[] = []): Promise<T[]> => dbAll(getDB(), sql, params);
const get = <T = any>(sql: string, params: any[] = []): Promise<T | null> => dbGet(getDB(), sql, params);

// ============================================================================
// INFRA-3: DATA FEED STALENESS TAGGING & MONITORING
// ============================================================================

export type FeedState = 'LIVE' | 'STALE' | 'UNAVAILABLE';

export interface FeedStatusRecord {
  feed_id: string;
  source: string;
  last_heartbeat_utc: string;
  last_successful_fetch_utc: string | null;
  current_state: FeedState;
  failure_count: number;
  latency_ms: number;
  last_error: string | null;
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000;      // 5 minutes without fetch = STALE
const UNAVAIL_THRESHOLD_MS = 15 * 60 * 1000;    // 15 minutes or 3 consecutive failures = UNAVAILABLE

export async function initDataFeedStatusTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS data_feed_status (
      feed_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      last_heartbeat_utc TEXT NOT NULL,
      last_successful_fetch_utc TEXT,
      current_state TEXT NOT NULL DEFAULT 'UNAVAILABLE',
      failure_count INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    )
  `);
}

export async function recordFeedSuccess(feedId: string, source: string, latencyMs: number = 0): Promise<void> {
  const nowUtc = new Date().toISOString();
  await run(`
    INSERT INTO data_feed_status (feed_id, source, last_heartbeat_utc, last_successful_fetch_utc, current_state, failure_count, latency_ms, last_error)
    VALUES (?, ?, ?, ?, 'LIVE', 0, ?, NULL)
    ON CONFLICT(feed_id) DO UPDATE SET
      last_heartbeat_utc = excluded.last_heartbeat_utc,
      last_successful_fetch_utc = excluded.last_successful_fetch_utc,
      current_state = 'LIVE',
      failure_count = 0,
      latency_ms = excluded.latency_ms,
      last_error = NULL
  `, [feedId, source, nowUtc, nowUtc, Math.round(latencyMs)]);
}

export async function recordFeedFailure(feedId: string, source: string, errorMessage: string = 'Unknown error'): Promise<void> {
  const nowUtc = new Date().toISOString();
  const existing = await get<FeedStatusRecord>(`SELECT * FROM data_feed_status WHERE feed_id = ?`, [feedId]);
  const newFailureCount = (existing?.failure_count || 0) + 1;
  const newState: FeedState = newFailureCount >= 3 ? 'UNAVAILABLE' : 'STALE';

  await run(`
    INSERT INTO data_feed_status (feed_id, source, last_heartbeat_utc, last_successful_fetch_utc, current_state, failure_count, latency_ms, last_error)
    VALUES (?, ?, ?, NULL, ?, ?, 0, ?)
    ON CONFLICT(feed_id) DO UPDATE SET
      last_heartbeat_utc = excluded.last_heartbeat_utc,
      current_state = excluded.current_state,
      failure_count = excluded.failure_count,
      last_error = excluded.last_error
  `, [feedId, source, nowUtc, newState, newFailureCount, errorMessage]);
}

export async function getFeedStatus(feedId: string): Promise<FeedStatusRecord | null> {
  const record = await get<FeedStatusRecord>(`SELECT * FROM data_feed_status WHERE feed_id = ?`, [feedId]);
  if (!record) return null;

  // Real-time decay check
  if (record.current_state === 'LIVE' && record.last_successful_fetch_utc) {
    const elapsed = Date.now() - new Date(record.last_successful_fetch_utc).getTime();
    if (elapsed > UNAVAIL_THRESHOLD_MS) {
      record.current_state = 'UNAVAILABLE';
    } else if (elapsed > STALE_THRESHOLD_MS) {
      record.current_state = 'STALE';
    }
  }
  return record;
}

export async function getAllFeedStatuses(): Promise<FeedStatusRecord[]> {
  const records = await all<FeedStatusRecord>(`SELECT * FROM data_feed_status ORDER BY feed_id ASC`);
  const now = Date.now();
  return records.map(r => {
    if (r.current_state === 'LIVE' && r.last_successful_fetch_utc) {
      const elapsed = now - new Date(r.last_successful_fetch_utc).getTime();
      if (elapsed > UNAVAIL_THRESHOLD_MS) r.current_state = 'UNAVAILABLE';
      else if (elapsed > STALE_THRESHOLD_MS) r.current_state = 'STALE';
    }
    return r;
  });
}

export function checkCrossFeedDiscrepancy(
  symbol: string,
  priceA: number,
  sourceA: string,
  priceB: number,
  sourceB: string,
  thresholdPct: number = 0.015
): { discrepant: boolean; divergencePct: number; message?: string } {
  if (!priceA || !priceB || priceA <= 0 || priceB <= 0) {
    return { discrepant: false, divergencePct: 0 };
  }
  const diff = Math.abs(priceA - priceB);
  const avg = (priceA + priceB) / 2;
  const divergencePct = diff / avg;
  if (divergencePct > thresholdPct) {
    return {
      discrepant: true,
      divergencePct,
      message: `Price divergence of ${(divergencePct * 100).toFixed(2)}% detected for ${symbol} between ${sourceA} (₹${priceA}) and ${sourceB} (₹${priceB})`
    };
  }
  return { discrepant: false, divergencePct };
}

// ============================================================================
// INFRA-4: IDEMPOTENT MUTATION FRAMEWORK
// ============================================================================

export interface DedupRecord {
  dedup_key: string;
  entity_type: string;
  entity_id: string;
  applied_at: string;
  result_hash: string;
  response_payload: string | null;
  superseded_by: string | null;
}

export async function initMutationDedupTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS mutation_dedup_keys (
      dedup_key TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      result_hash TEXT NOT NULL,
      response_payload TEXT,
      superseded_by TEXT
    )
  `);
}

export function computeDedupKey(entityType: string, entityId: string, actionType: string, params: any = {}): string {
  const serialized = JSON.stringify({ entityType, entityId, actionType, params });
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

export async function checkMutationDedup(dedupKey: string): Promise<{
  alreadyApplied: boolean;
  resultHash?: string;
  responsePayload?: any;
}> {
  const existing = await get<DedupRecord>(
    `SELECT * FROM mutation_dedup_keys WHERE dedup_key = ? AND superseded_by IS NULL`,
    [dedupKey]
  );
  if (!existing) {
    return { alreadyApplied: false };
  }
  let parsedPayload = null;
  if (existing.response_payload) {
    try { parsedPayload = JSON.parse(existing.response_payload); } catch {}
  }
  return {
    alreadyApplied: true,
    resultHash: existing.result_hash,
    responsePayload: parsedPayload
  };
}

export async function recordMutationDedup(
  dedupKey: string,
  entityType: string,
  entityId: string,
  resultHash: string,
  responsePayload?: any
): Promise<void> {
  const nowUtc = new Date().toISOString();
  const payloadStr = responsePayload ? JSON.stringify(responsePayload) : null;
  await run(`
    INSERT OR REPLACE INTO mutation_dedup_keys
    (dedup_key, entity_type, entity_id, applied_at, result_hash, response_payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [dedupKey, entityType, entityId, nowUtc, resultHash, payloadStr]);
}

// ============================================================================
// INFRA-5: SIGNAL CALIBRATION TRACKING SERVICE
// ============================================================================

export interface SignalOutcomeRecord {
  signal_id: string;
  symbol: string;
  category: string;
  stated_confidence: string;
  stated_probability: number;
  recommendation_date: string;
  resolution_date: string | null;
  outcome: 'TARGET_HIT' | 'STOP_HIT' | 'EXPIRED_FLAT' | 'PENDING';
  actual_return_pct: number | null;
  created_at: string;
}

export interface CalibrationStatsRecord {
  category: string;
  confidence_tier: string;
  n: number;
  hits: number;
  win_rate: number;
  wilson_ci_low: number;
  wilson_ci_high: number;
  median_lead_time_days: number | null;
  status: 'RELIABLE' | 'INSUFFICIENT_DATA';
  last_computed_at: string;
}

export async function initCalibrationTables(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS signal_outcomes (
      signal_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      category TEXT NOT NULL,
      stated_confidence TEXT NOT NULL,
      stated_probability REAL NOT NULL,
      recommendation_date TEXT NOT NULL,
      resolution_date TEXT,
      outcome TEXT NOT NULL DEFAULT 'PENDING',
      actual_return_pct REAL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS calibration_stats (
      category TEXT NOT NULL,
      confidence_tier TEXT NOT NULL,
      n INTEGER NOT NULL,
      hits INTEGER NOT NULL,
      win_rate REAL NOT NULL,
      wilson_ci_low REAL NOT NULL,
      wilson_ci_high REAL NOT NULL,
      median_lead_time_days REAL,
      status TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA',
      last_computed_at TEXT NOT NULL,
      PRIMARY KEY (category, confidence_tier)
    )
  `);
}

export function wilsonInterval(hits: number, n: number, z: number = 1.96): {
  center: number;
  ciLow: number;
  ciHigh: number;
} {
  if (n <= 0) return { center: 0, ciLow: 0, ciHigh: 0 };
  const pHat = hits / n;
  const zSq = z * z;
  const denom = 1 + zSq / n;
  const center = (pHat + zSq / (2 * n)) / denom;
  const margin = (z * Math.sqrt((pHat * (1 - pHat) + zSq / (4 * n)) / n)) / denom;
  return {
    center: Math.round(center * 10000) / 10000,
    ciLow: Math.max(0, Math.round((center - margin) * 10000) / 10000),
    ciHigh: Math.min(1, Math.round((center + margin) * 10000) / 10000)
  };
}

export async function recordSignalOutcome(
  signalId: string,
  symbol: string,
  category: string,
  statedConfidence: string,
  statedProbability: number,
  recommendationDate: string = new Date().toISOString().split('T')[0]
): Promise<void> {
  const now = new Date().toISOString();
  await run(`
    INSERT OR IGNORE INTO signal_outcomes
    (signal_id, symbol, category, stated_confidence, stated_probability, recommendation_date, outcome, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
  `, [signalId, symbol, category, statedConfidence, statedProbability, recommendationDate, now]);
}

export async function resolveSignalOutcome(
  signalId: string,
  outcome: 'TARGET_HIT' | 'STOP_HIT' | 'EXPIRED_FLAT',
  actualReturnPct: number,
  resolutionDate: string = new Date().toISOString().split('T')[0]
): Promise<void> {
  await run(`
    UPDATE signal_outcomes
    SET outcome = ?, actual_return_pct = ?, resolution_date = ?
    WHERE signal_id = ?
  `, [outcome, actualReturnPct, resolutionDate, signalId]);
}

export async function refreshCalibrationStats(minNForTrust: number = 15): Promise<void> {
  const rows = await all<{
    category: string;
    stated_confidence: string;
    total_resolved: number;
    hits: number;
  }>(`
    SELECT
      category,
      stated_confidence,
      COUNT(*) as total_resolved,
      SUM(CASE WHEN outcome = 'TARGET_HIT' THEN 1 ELSE 0 END) as hits
    FROM signal_outcomes
    WHERE outcome IN ('TARGET_HIT', 'STOP_HIT', 'EXPIRED_FLAT')
    GROUP BY category, stated_confidence
  `);

  const now = new Date().toISOString();
  for (const row of rows) {
    const n = row.total_resolved;
    const hits = row.hits || 0;
    const winRate = n > 0 ? hits / n : 0;
    const { ciLow, ciHigh } = wilsonInterval(hits, n);
    const status = n >= minNForTrust ? 'RELIABLE' : 'INSUFFICIENT_DATA';

    await run(`
      INSERT INTO calibration_stats
      (category, confidence_tier, n, hits, win_rate, wilson_ci_low, wilson_ci_high, median_lead_time_days, status, last_computed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(category, confidence_tier) DO UPDATE SET
        n = excluded.n,
        hits = excluded.hits,
        win_rate = excluded.win_rate,
        wilson_ci_low = excluded.wilson_ci_low,
        wilson_ci_high = excluded.wilson_ci_high,
        status = excluded.status,
        last_computed_at = excluded.last_computed_at
    `, [row.category, row.stated_confidence, n, hits, winRate, ciLow, ciHigh, status, now]);
  }
}

export async function getCalibrationStats(category?: string, confidenceTier?: string): Promise<CalibrationStatsRecord[]> {
  if (category && confidenceTier) {
    return await all<CalibrationStatsRecord>(
      `SELECT * FROM calibration_stats WHERE category = ? AND confidence_tier = ?`,
      [category, confidenceTier]
    );
  } else if (category) {
    return await all<CalibrationStatsRecord>(
      `SELECT * FROM calibration_stats WHERE category = ?`,
      [category]
    );
  }
  return await all<CalibrationStatsRecord>(`SELECT * FROM calibration_stats ORDER BY category, confidence_tier`);
}

// ============================================================================
// INFRA-6: IMMUTABLE AUDIT LEDGER
// ============================================================================

export interface AuditEntryInput {
  entity_type: string;
  entity_id: string;
  action: string;
  before_state?: any;
  after_state: any;
  actor: string;
  dedup_key?: string;
}

export async function initAuditLedgerTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS audit_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_utc TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      before_state TEXT,
      after_state TEXT NOT NULL,
      dedup_key TEXT,
      entry_hash TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS prevent_audit_ledger_update
    BEFORE UPDATE ON audit_ledger
    BEGIN
      SELECT RAISE(ABORT, 'audit_ledger is append-only: updates are prohibited');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS prevent_audit_ledger_delete
    BEFORE DELETE ON audit_ledger
    BEGIN
      SELECT RAISE(ABORT, 'audit_ledger is append-only: deletions are prohibited');
    END;
  `);
}

export async function writeAuditEntry(entry: AuditEntryInput): Promise<number> {
  const timestampUtc = new Date().toISOString();
  const beforeJson = entry.before_state !== undefined ? JSON.stringify(entry.before_state) : null;
  const afterJson = JSON.stringify(entry.after_state);
  const rawData = `${timestampUtc}|${entry.entity_type}|${entry.entity_id}|${entry.action}|${entry.actor}|${afterJson}`;
  const entryHash = crypto.createHash('sha256').update(rawData).digest('hex');

  const result = await run(`
    INSERT INTO audit_ledger
    (timestamp_utc, event_type, entity_type, entity_id, action, actor, before_state, after_state, dedup_key, entry_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    timestampUtc,
    `${entry.entity_type}_${entry.action}`,
    entry.entity_type,
    entry.entity_id,
    entry.action,
    entry.actor,
    beforeJson,
    afterJson,
    entry.dedup_key || null,
    entryHash
  ]);

  return (result as any)?.lastID || 0;
}

export async function getAuditHistoryForEntity(entityType: string, entityId: string): Promise<any[]> {
  return await all(
    `SELECT * FROM audit_ledger WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC`,
    [entityType, entityId]
  );
}

export async function searchAuditLedger(filter: {
  actor?: string;
  action?: string;
  entity_type?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}): Promise<any[]> {
  let query = 'SELECT * FROM audit_ledger WHERE 1=1';
  const params: any[] = [];

  if (filter.actor) {
    query += ' AND actor = ?';
    params.push(filter.actor);
  }
  if (filter.action) {
    query += ' AND action = ?';
    params.push(filter.action);
  }
  if (filter.entity_type) {
    query += ' AND entity_type = ?';
    params.push(filter.entity_type);
  }
  if (filter.from_date) {
    query += ' AND timestamp_utc >= ?';
    params.push(filter.from_date);
  }
  if (filter.to_date) {
    query += ' AND timestamp_utc <= ?';
    params.push(filter.to_date);
  }
  query += ' ORDER BY id DESC LIMIT ?';
  params.push(filter.limit || 100);

  return await all(query, params);
}
