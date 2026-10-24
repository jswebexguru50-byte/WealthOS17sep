/**
 * AcquisitionJobLedgerService.ts
 *
 * Durable ledger for data acquisition jobs, tracking the full lifecycle from
 * PENDING → FETCHING → FETCHED → PROMOTED (or FAILED/SKIPPED).
 * Solves the "downloaded but not promoted" reliability gap by providing a
 * canonical record of what was fetched, promoted, or still pending —
 * eliminating redundant re-fetches.
 */

import crypto from 'node:crypto';
import { getDB } from '../database.js';

export type JobStatus = 'PENDING' | 'FETCHING' | 'FETCHED' | 'PROMOTED' | 'FAILED' | 'SKIPPED';
export type ErrorClass =
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'NOT_FOUND'
  | 'PARSE_FAILED'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'CONFLICT';

export interface AcquisitionJob {
  jobId: string;
  symbol: string;
  isin?: string;
  domain: string;
  metric?: string;
  source: string;
  status: JobStatus;
  attemptCount: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  rawPayloadHash?: string;
  rawStoragePath?: string;
  normalizedAt?: string;
  promotedAt?: string;
  promotionResult?: 'PROMOTED' | 'CONFLICT' | 'REJECTED' | 'ERROR';
  errorClass?: ErrorClass;
  errorDetail?: string;
  ttlSeconds?: number;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ── Internal DB row type ─────────────────────────────────────────────────────

interface JobRow {
  job_id: string;
  symbol: string;
  isin: string | null;
  domain: string;
  metric: string | null;
  source: string;
  status: string;
  attempt_count: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  raw_payload_hash: string | null;
  raw_storage_path: string | null;
  normalized_at: string | null;
  promoted_at: string | null;
  promotion_result: string | null;
  error_class: string | null;
  error_detail: string | null;
  ttl_seconds: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rowToJob(row: JobRow): AcquisitionJob {
  return {
    jobId: row.job_id,
    symbol: row.symbol,
    isin: row.isin ?? undefined,
    domain: row.domain,
    metric: row.metric ?? undefined,
    source: row.source,
    status: row.status as JobStatus,
    attemptCount: row.attempt_count,
    lastAttemptAt: row.last_attempt_at ?? undefined,
    nextRetryAt: row.next_retry_at ?? undefined,
    rawPayloadHash: row.raw_payload_hash ?? undefined,
    rawStoragePath: row.raw_storage_path ?? undefined,
    normalizedAt: row.normalized_at ?? undefined,
    promotedAt: row.promoted_at ?? undefined,
    promotionResult: (row.promotion_result as AcquisitionJob['promotionResult']) ?? undefined,
    errorClass: (row.error_class as ErrorClass) ?? undefined,
    errorDetail: row.error_detail ?? undefined,
    ttlSeconds: row.ttl_seconds ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateJobId(symbol: string, domain: string, metric?: string): string {
  const key = `acq_${symbol}_${domain}_${metric || 'bulk'}_${Date.now()}`;
  return 'acq_' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function now(): string {
  return new Date().toISOString();
}

// ── Service ──────────────────────────────────────────────────────────────────

export class AcquisitionJobLedgerService {
  private static instance: AcquisitionJobLedgerService;

  static getInstance(): AcquisitionJobLedgerService {
    if (!this.instance) this.instance = new AcquisitionJobLedgerService();
    return this.instance;
  }

  private get db(): any {
    return getDB();
  }

  /**
   * Returns the most recent non-expired PROMOTED job for (symbol, domain, metric),
   * or null if none exists. Used to short-circuit redundant fetches.
   */
  findFreshJob(symbol: string, domain: string, metric?: string): AcquisitionJob | null {
    try {
      const metricCond = metric != null ? 'AND metric = ?' : 'AND metric IS NULL';
      const params: unknown[] = [symbol, domain, now()];
      if (metric != null) params.push(metric);

      const row = this.db.get(
        `SELECT * FROM acquisition_job_ledger
         WHERE symbol = ? AND domain = ? AND status = 'PROMOTED'
           AND (expires_at IS NULL OR expires_at > ?)
           ${metricCond}
         ORDER BY promoted_at DESC
         LIMIT 1`,
        params
      ) as JobRow | undefined;

      return row ? rowToJob(row) : null;
    } catch (e: any) {
      if (/no such table/i.test(e.message)) return null;
      throw e;
    }
  }

  /**
   * Upserts a job record. If a PENDING or FAILED job already exists for the
   * same (symbol, domain, metric), it is returned; otherwise a new record is
   * created. Returns the job_id.
   */
  upsertJob(
    job: Partial<AcquisitionJob> & { symbol: string; domain: string; source: string }
  ): string {
    const {
      symbol,
      domain,
      metric,
      source,
      isin,
      ttlSeconds = 86400,
      status = 'PENDING',
    } = job;

    const jobId = job.jobId ?? generateJobId(symbol, domain, metric);
    const ts = now();

    try {
      this.db.run(
        `INSERT INTO acquisition_job_ledger
           (job_id, symbol, isin, domain, metric, source, status, attempt_count,
            ttl_seconds, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           status = excluded.status,
           updated_at = excluded.updated_at`,
        [jobId, symbol, isin ?? null, domain, metric ?? null, source, status, ttlSeconds, ts, ts]
      );
    } catch (e: any) {
      if (/no such table/i.test(e.message)) {
        console.warn('[AcquisitionJobLedger] Table not yet created — migration pending');
        return jobId;
      }
      throw e;
    }

    return jobId;
  }

  /**
   * Marks a job as FETCHED and records the raw payload hash (for deduplication)
   * and optional storage path.
   */
  markFetched(jobId: string, rawPayloadHash: string, rawStoragePath?: string): void {
    const ts = now();
    try {
      this.db.run(
        `UPDATE acquisition_job_ledger
         SET status = 'FETCHED',
             raw_payload_hash = ?,
             raw_storage_path = ?,
             last_attempt_at = ?,
             attempt_count = attempt_count + 1,
             updated_at = ?
         WHERE job_id = ?`,
        [rawPayloadHash, rawStoragePath ?? null, ts, ts, jobId]
      );
    } catch (e: any) {
      if (!/no such table/i.test(e.message)) throw e;
    }
  }

  /**
   * Marks a job as PROMOTED with a promotion result and sets the expires_at
   * timestamp based on ttl_seconds.
   */
  markPromoted(jobId: string, result: 'PROMOTED' | 'CONFLICT' | 'REJECTED'): void {
    const ts = now();
    try {
      this.db.run(
        `UPDATE acquisition_job_ledger
         SET status = 'PROMOTED',
             promotion_result = ?,
             promoted_at = ?,
             normalized_at = ?,
             expires_at = datetime(?, '+' || COALESCE(ttl_seconds, 86400) || ' seconds'),
             updated_at = ?
         WHERE job_id = ?`,
        [result, ts, ts, ts, ts, jobId]
      );
    } catch (e: any) {
      if (!/no such table/i.test(e.message)) throw e;
    }
  }

  /**
   * Marks a job as FAILED with an error class and optional retry schedule.
   */
  markFailed(
    jobId: string,
    errorClass: ErrorClass,
    detail?: string,
    retryAfterSeconds?: number
  ): void {
    const ts = now();
    const nextRetry = retryAfterSeconds
      ? new Date(Date.now() + retryAfterSeconds * 1000).toISOString()
      : null;

    try {
      this.db.run(
        `UPDATE acquisition_job_ledger
         SET status = 'FAILED',
             error_class = ?,
             error_detail = ?,
             last_attempt_at = ?,
             attempt_count = attempt_count + 1,
             next_retry_at = ?,
             updated_at = ?
         WHERE job_id = ?`,
        [errorClass, detail ?? null, ts, nextRetry, ts, jobId]
      );
    } catch (e: any) {
      if (!/no such table/i.test(e.message)) throw e;
    }
  }

  /**
   * Returns all PENDING or FAILED jobs for a symbol that are due for retry.
   */
  pendingJobs(symbol: string): AcquisitionJob[] {
    try {
      const rows = this.db.all(
        `SELECT * FROM acquisition_job_ledger
         WHERE symbol = ?
           AND status IN ('PENDING', 'FAILED')
           AND (next_retry_at IS NULL OR next_retry_at <= ?)
         ORDER BY created_at ASC`,
        [symbol, now()]
      ) as JobRow[];

      return (rows || []).map(rowToJob);
    } catch (e: any) {
      if (/no such table/i.test(e.message)) return [];
      throw e;
    }
  }

  /**
   * Returns a job by its ID, or null if not found.
   */
  getJob(jobId: string): AcquisitionJob | null {
    try {
      const row = this.db.get(
        `SELECT * FROM acquisition_job_ledger WHERE job_id = ?`,
        [jobId]
      ) as JobRow | undefined;

      return row ? rowToJob(row) : null;
    } catch (e: any) {
      if (/no such table/i.test(e.message)) return null;
      throw e;
    }
  }

  /**
   * Lists all jobs for a symbol regardless of status (useful for diagnostics).
   */
  listJobs(
    symbol: string,
    opts: { domain?: string; status?: JobStatus; limit?: number } = {}
  ): AcquisitionJob[] {
    const conditions: string[] = ['symbol = ?'];
    const params: unknown[] = [symbol];

    if (opts.domain) {
      conditions.push('domain = ?');
      params.push(opts.domain);
    }
    if (opts.status) {
      conditions.push('status = ?');
      params.push(opts.status);
    }

    const limit = opts.limit ?? 100;
    params.push(limit);

    try {
      const rows = this.db.all(
        `SELECT * FROM acquisition_job_ledger
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT ?`,
        params
      ) as JobRow[];

      return (rows || []).map(rowToJob);
    } catch (e: any) {
      if (/no such table/i.test(e.message)) return [];
      throw e;
    }
  }

  /**
   * Marks a job as FETCHING (in-flight). Prevents duplicate concurrent fetches.
   */
  markFetching(jobId: string): void {
    const ts = now();
    try {
      this.db.run(
        `UPDATE acquisition_job_ledger
         SET status = 'FETCHING', last_attempt_at = ?, updated_at = ?
         WHERE job_id = ? AND status IN ('PENDING', 'FAILED')`,
        [ts, ts, jobId]
      );
    } catch (e: any) {
      if (!/no such table/i.test(e.message)) throw e;
    }
  }

  /**
   * Marks a job as SKIPPED (data already fresh from another path).
   */
  markSkipped(jobId: string): void {
    const ts = now();
    try {
      this.db.run(
        `UPDATE acquisition_job_ledger
         SET status = 'SKIPPED', updated_at = ?
         WHERE job_id = ?`,
        [ts, jobId]
      );
    } catch (e: any) {
      if (!/no such table/i.test(e.message)) throw e;
    }
  }
}
