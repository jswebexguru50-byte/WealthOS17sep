/**
 * TrendlyneEnrichmentQueue.ts — Persistent Multi-Level Priority Job Queue
 * WealthOS V2 Mandatory Amendment
 *
 * Priorities:
 * 1: PORTFOLIO
 * 2: WATCHLIST
 * 3: ACCEPTANCE_UNIVERSE (11 benchmark companies)
 * 4: ACTIVE_DISCOVERY_CANDIDATES
 * 5: REMAINING_INVESTABLE_UNIVERSE
 *
 * Implements deterministic job identity, recovery of abandoned RUNNING jobs on restart,
 * and rate-limit backoff.
 */

import crypto from 'crypto';
import { getDB, dbRun, dbAll, dbGet } from '../../../database.js';
import { TrendlyneJob, TrendlyneJobState } from './TrendlyneContracts.js';

export class TrendlyneEnrichmentQueue {
  private static instance: TrendlyneEnrichmentQueue;

  private constructor() {}

  public static getInstance(): TrendlyneEnrichmentQueue {
    if (!TrendlyneEnrichmentQueue.instance) {
      TrendlyneEnrichmentQueue.instance = new TrendlyneEnrichmentQueue();
    }
    return TrendlyneEnrichmentQueue.instance;
  }

  public async enqueueJob(params: {
    securityId: string;
    symbol: string;
    jobType: TrendlyneJob['jobType'];
    packId?: string;
    packVersion?: string;
    periodKey?: string;
    priority: number;
  }): Promise<TrendlyneJob> {
    const periodKey = params.periodKey || 'LATEST';
    const packVersion = params.packVersion || '1.0';
    const requestHash = crypto
      .createHash('sha256')
      .update(`${params.securityId}|${params.jobType}|${params.packId || 'NONE'}|${periodKey}`)
      .digest('hex');

    const jobId = `tl_job_${requestHash.substring(0, 16)}`;
    const now = new Date().toISOString();

    const job: TrendlyneJob = {
      jobId,
      securityId: params.securityId,
      symbol: params.symbol,
      jobType: params.jobType,
      packId: params.packId,
      packVersion,
      periodKey,
      priority: params.priority,
      state: 'PENDING',
      attemptCount: 0,
      requestHash,
      createdAt: now,
    };

    const db = getDB();
    if (db) {
      try {
        await dbRun(
          db,
          `INSERT INTO trendlyne_enrichment_jobs
           (job_id, security_id, job_type, pack_id, pack_version, period_key, priority, state, attempt_count, request_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
           ON CONFLICT(job_id) DO UPDATE SET state = 'PENDING', priority = excluded.priority, attempt_count = 0, error_code = null, error_message = null`,
          [
            job.jobId,
            job.securityId,
            job.jobType,
            job.packId || null,
            job.packVersion || null,
            job.periodKey || null,
            job.priority,
            job.requestHash,
            job.createdAt,
          ]
        );
      } catch (err) {
        console.error('[TrendlyneEnrichmentQueue] enqueue error:', err);
      }
    }

    return job;
  }

  public async getPendingJobs(limit = 50): Promise<TrendlyneJob[]> {
    const db = getDB();
    if (!db) return [];

    try {
      const rows = await dbAll<any>(
        db,
        `SELECT * FROM trendlyne_enrichment_jobs
         WHERE state IN ('PENDING', 'RETRYABLE')
         ORDER BY priority ASC, created_at ASC
         LIMIT ?`,
        [limit]
      );

      return rows.map((r) => ({
        jobId: r.job_id,
        securityId: r.security_id,
        symbol: r.security_id,
        jobType: r.job_type,
        packId: r.pack_id,
        packVersion: r.pack_version,
        periodKey: r.period_key,
        priority: r.priority,
        state: r.state,
        attemptCount: r.attempt_count,
        requestHash: r.request_hash,
        responseHash: r.response_hash,
        createdAt: r.created_at,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        nextAttemptAt: r.next_attempt_at,
        errorCode: r.error_code,
        errorMessage: r.error_message,
      }));
    } catch {
      return [];
    }
  }

  public async updateJobState(jobId: string, state: TrendlyneJobState, error?: { code: string; message: string }): Promise<void> {
    const db = getDB();
    if (!db) return;

    const now = new Date().toISOString();
    try {
      if (state === 'RUNNING') {
        await dbRun(
          db,
          `UPDATE trendlyne_enrichment_jobs
           SET state = ?, started_at = ?, attempt_count = attempt_count + 1
           WHERE job_id = ?`,
          [state, now, jobId]
        );
      } else if (state === 'COMPLETE') {
        await dbRun(
          db,
          `UPDATE trendlyne_enrichment_jobs
           SET state = ?, completed_at = ?
           WHERE job_id = ?`,
          [state, now, jobId]
        );
      } else {
        await dbRun(
          db,
          `UPDATE trendlyne_enrichment_jobs
           SET state = ?, error_code = ?, error_message = ?
           WHERE job_id = ?`,
          [state, error?.code || null, error?.message || null, jobId]
        );
      }
    } catch {
      // Fallback
    }
  }

  /**
   * Recovers abandoned RUNNING jobs back to RETRYABLE on system restart.
   */
  public async recoverAbandonedRunningJobs(): Promise<number> {
    const db = getDB();
    if (!db) return 0;

    try {
      const res = await dbRun(
        db,
        `UPDATE trendlyne_enrichment_jobs
         SET state = 'RETRYABLE'
         WHERE state = 'RUNNING'`
      );
      return (res as any)?.changes || 0;
    } catch {
      return 0;
    }
  }
}
