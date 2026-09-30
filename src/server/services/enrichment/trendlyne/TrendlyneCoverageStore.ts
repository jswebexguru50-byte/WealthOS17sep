/**
 * TrendlyneCoverageStore.ts — Provider Metric Applicability & Batch State Tracking
 * WealthOS V2 Mandatory Amendment — Trendlyne MCP Capacity Utilization
 *
 * Tracks provider behavior per archetype to continuously learn and optimize useful yield.
 * Enforces restart idempotency for requested batches.
 */

import { getDB, dbRun, dbAll } from '../../../database.js';
import { TrendlyneMetricApplicability } from './TrendlyneContracts.js';

export class TrendlyneCoverageStore {
  private static instance: TrendlyneCoverageStore;
  private readonly memoryCache: Map<string, TrendlyneMetricApplicability> = new Map();
  private readonly completedBatchHashes: Set<string> = new Set();
  private initialized = false;

  private constructor() {}

  public static getInstance(): TrendlyneCoverageStore {
    if (!TrendlyneCoverageStore.instance) {
      TrendlyneCoverageStore.instance = new TrendlyneCoverageStore();
    }
    return TrendlyneCoverageStore.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    const db = getDB();
    if (db) {
      try {
        const rows = await dbAll<any>(db, `SELECT * FROM trendlyne_metric_applicability`);
        for (const r of rows) {
          const key = `${r.metric_id}:${r.archetype}`;
          this.memoryCache.set(key, {
            metricId: r.metric_id,
            archetype: r.archetype,
            requests: r.requests,
            successfulValues: r.successful_values,
            nullValues: r.null_values,
            coveragePct: r.coverage_pct,
            lastUpdated: r.last_updated,
          });
        }

        const batches = await dbAll<any>(db, `SELECT batch_hash FROM trendlyne_enrichment_batches WHERE state = 'COMPLETED'`);
        for (const b of batches) {
          if (b.batch_hash) this.completedBatchHashes.add(b.batch_hash);
        }
      } catch (err) {
        // Table may exist or in mock mode
      }
    }
    this.initialized = true;
  }

  public isBatchCompleted(batchHash: string): boolean {
    return this.completedBatchHashes.has(batchHash);
  }

  public async markBatchCompleted(batchId: string, batchHash: string, scripCount: number, metricCount: number): Promise<void> {
    this.completedBatchHashes.add(batchHash);
    const db = getDB();
    if (db) {
      try {
        await dbRun(
          db,
          `INSERT OR REPLACE INTO trendlyne_enrichment_batches
           (batch_id, tool_name, stock_set_hash, metric_pack_hash, request_hash, state, completed_at, created_at)
           VALUES (?, 'get_stock_parameter_values', ?, ?, ?, 'COMPLETED', ?, ?)`,
          [batchId, batchHash, batchHash, batchHash, new Date().toISOString(), new Date().toISOString()]
        );
      } catch (err) {
        // Mock fallback
      }
    }
  }

  public isApplicable(metricId: string, archetype: string): boolean {
    const key = `${metricId}:${archetype}`;
    const entry = this.memoryCache.get(key);
    if (!entry) return true; // optimistic until learned otherwise

    // If tested at least 5 times and failure/null rate is > 85%, mark not applicable
    if (entry.requests >= 5 && entry.coveragePct < 15.0) {
      return false;
    }
    return true;
  }

  public async recordObservation(metricId: string, archetype: string, hasValue: boolean): Promise<void> {
    const key = `${metricId}:${archetype}`;
    const now = new Date().toISOString();
    let entry = this.memoryCache.get(key);

    if (!entry) {
      entry = {
        metricId,
        archetype,
        requests: 0,
        successfulValues: 0,
        nullValues: 0,
        coveragePct: 0.0,
        lastUpdated: now,
      };
      this.memoryCache.set(key, entry);
    }

    entry.requests += 1;
    if (hasValue) {
      entry.successfulValues += 1;
    } else {
      entry.nullValues += 1;
    }
    entry.coveragePct = Math.round((entry.successfulValues / entry.requests) * 1000) / 10;
    entry.lastUpdated = now;

    const db = getDB();
    if (db) {
      try {
        await dbRun(
          db,
          `INSERT OR REPLACE INTO trendlyne_metric_applicability
           (metric_id, archetype, requests, successful_values, null_values, coverage_pct, last_updated)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            entry.metricId,
            entry.archetype,
            entry.requests,
            entry.successfulValues,
            entry.nullValues,
            entry.coveragePct,
            entry.lastUpdated,
          ]
        );
      } catch (err) {
        // In-memory fallback
      }
    }
  }

  public getAllApplicability(): TrendlyneMetricApplicability[] {
    return Array.from(this.memoryCache.values());
  }

  public resetForTesting(): void {
    this.memoryCache.clear();
    this.completedBatchHashes.clear();
    this.initialized = false;
  }
}
