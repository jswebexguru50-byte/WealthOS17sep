/**
 * scripts/diagnostics/benchmark_dashboard_payload.ts
 *
 * Deterministic benchmark for buildDashboardPayload.
 * Measures cold-cache and warm-cache latency, query counts, slowest queries,
 * and database file size before and after optimization.
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

// Ensure test environment so background server listeners do not bind port
process.env.NODE_ENV = 'test';
process.env.READ_ONLY_RUNTIME = 'true';
process.env.ENABLE_BACKGROUND_SCHEDULERS = 'false';

import { getDB, getEffectiveDbPath, setQueryProfiler, QueryProfileEvent, dbGet } from '../../src/server/database.js';
import { buildDashboardPayload, dashboardResponseCache, invalidateDashboardCache } from '../../server.js';

interface QueryRecord {
  type: string;
  sql: string;
  durationMs: number;
}

export interface BenchmarkResult {
  evaluation_timestamp: string;
  database_path: string;
  database_size_bytes: number;
  database_size_human: string;
  cold_cache: {
    latency_ms: number;
    query_count: number;
    slowest_queries: { sql: string; type: string; duration_ms: number }[];
  };
  warm_cache: {
    latency_ms: number;
    query_count: number;
  };
  payload_summary: {
    success: boolean;
    total_holdings: number;
    net_worth: number;
    total_invested: number;
  };
}

export async function runDashboardBenchmark(portfolioFilter: string[] | null = null, memberId: any = 1): Promise<BenchmarkResult> {
  const db = getDB();
  const dbPath = getEffectiveDbPath();
  let dbSizeBytes = 0;
  if (fs.existsSync(dbPath)) {
    const stat = fs.statSync(dbPath);
    dbSizeBytes = stat.size;
    const walPath = `${dbPath}-wal`;
    if (fs.existsSync(walPath)) {
      dbSizeBytes += fs.statSync(walPath).size;
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // 1. Force cold cache: invalidate memory and disk cache
  invalidateDashboardCache();
  dashboardResponseCache.clear();

  const coldQueries: QueryRecord[] = [];
  setQueryProfiler((event: QueryProfileEvent) => {
    coldQueries.push({
      type: event.type,
      sql: event.sql.replace(/\s+/g, ' ').trim(),
      durationMs: Math.round(event.durationMs * 100) / 100
    });
  });

  const coldStart = performance.now();
  const coldPayload = await buildDashboardPayload(portfolioFilter, false, `bench_cold_${Date.now()}`, memberId);
  const coldEnd = performance.now();
  const coldLatencyMs = Math.round((coldEnd - coldStart) * 100) / 100;

  // Turn off profiler for sorting queries
  setQueryProfiler(null);

  // Sort slowest queries
  const slowestQueries = [...coldQueries]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5)
    .map(q => ({ sql: q.sql.slice(0, 120), type: q.type, duration_ms: q.durationMs }));

  // 2. Warm cache run
  const warmQueries: QueryRecord[] = [];
  setQueryProfiler((event: QueryProfileEvent) => {
    warmQueries.push({
      type: event.type,
      sql: event.sql.replace(/\s+/g, ' ').trim(),
      durationMs: Math.round(event.durationMs * 100) / 100
    });
  });

  const warmStart = performance.now();
  // Call with cached entry in dashboardResponseCache
  const warmCacheKey = `mem_${memberId}::${(portfolioFilter || ['__all__']).sort().join(',')}::false`;
  dashboardResponseCache.set(warmCacheKey, { data: coldPayload, ts: Date.now() });
  const warmEntry = dashboardResponseCache.get(warmCacheKey);
  const warmPayload = warmEntry ? warmEntry.data : await buildDashboardPayload(portfolioFilter, false, warmCacheKey, memberId);
  const warmEnd = performance.now();
  const warmLatencyMs = Math.round((warmEnd - warmStart) * 100) / 100;

  setQueryProfiler(null);

  return {
    evaluation_timestamp: new Date().toISOString(),
    database_path: dbPath,
    database_size_bytes: dbSizeBytes,
    database_size_human: formatBytes(dbSizeBytes),
    cold_cache: {
      latency_ms: coldLatencyMs,
      query_count: coldQueries.length,
      slowest_queries: slowestQueries
    },
    warm_cache: {
      latency_ms: warmLatencyMs,
      query_count: warmQueries.length
    },
    payload_summary: {
      success: coldPayload?.success ?? false,
      total_holdings: coldPayload?.holdings?.length ?? 0,
      net_worth: coldPayload?.metrics?.total_net_worth ?? 0,
      total_invested: coldPayload?.metrics?.total_invested ?? 0
    }
  };
}

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runDashboardBenchmark()
    .then(result => {
      console.log('=== DASHBOARD PAYLOAD BENCHMARK ===');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}
