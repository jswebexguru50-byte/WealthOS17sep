import { dbRun } from '../../database.js';
import type { Database } from 'sqlite3';

/** Idempotent production schema bootstrap for the unified acquisition lifecycle. */
export async function ensureUnifiedDataSchema(db: Database): Promise<void> {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS acquisition_jobs (
    job_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, isin TEXT, domain TEXT NOT NULL, metric TEXT,
    source_provider TEXT NOT NULL, source_url TEXT, cache_key TEXT NOT NULL UNIQUE, requested_at TEXT NOT NULL,
    completed_at TEXT, next_retry_at TEXT, status TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
    ttl_seconds INTEGER NOT NULL, payload_sha256 TEXT, raw_location TEXT, normalization_error TEXT,
    promotion_error TEXT, consumed_by_json TEXT NOT NULL DEFAULT '[]', metadata_json TEXT NOT NULL DEFAULT '{}'
  )`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS source_metric_policy (
    metric TEXT NOT NULL, domain TEXT NOT NULL, provider TEXT NOT NULL, priority INTEGER NOT NULL,
    ttl_seconds INTEGER NOT NULL, requires_primary_filing INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(metric,domain,provider)
  )`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_acquisition_jobs_lookup ON acquisition_jobs(symbol,domain,metric,status,completed_at)`);
}
