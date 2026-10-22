#!/usr/bin/env node
'use strict';
/**
 * PHASE10RM4_FASTPATH_BENCHMARK — Live Optimized Benchmark
 *
 * Executes the optimized range scheduler against the pre-approved cohort.
 * Concurrency = 1, conservative inter-request timing.
 * All output goes to isolated benchmark evidence — NEVER to production M.4 files.
 *
 * Requires: PHASE10RM4_FASTPATH_BENCHMARK_COHORT.json to exist and be APPROVED.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.cwd();
const ARTIFACT_DIR = path.join(ROOT, 'reports/market-data');

const COHORT_FILE   = path.join(ARTIFACT_DIR, 'PHASE10RM4_FASTPATH_BENCHMARK_COHORT.json');
const CHECKPOINT    = path.join(ARTIFACT_DIR, 'PHASE10RM4_RECOVERY_CHECKPOINT.json');
const QUEUE_FILE    = path.join(ARTIFACT_DIR, 'PHASE10RM3_9_REMAINING_COVERAGE_RECOVERY_QUEUE.jsonl');

// ── ISOLATED benchmark output — never touch production M.4 files ─────────────
const BM_EVIDENCE   = path.join(ARTIFACT_DIR, 'PHASE10RM4_FASTPATH_BENCHMARK_EVIDENCE.jsonl');
const BM_RESULT     = path.join(ARTIFACT_DIR, 'PHASE10RM4_FASTPATH_BENCHMARK.json');
const BM_MD         = path.join(ARTIFACT_DIR, 'PHASE10RM4_FASTPATH_BENCHMARK.md');

const REQUEST_GAP_MS = 10000; // conservative — same as M.4
const sleep = ms => new Promise(r => setTimeout(r, ms));

function validateOHLC(o, h, l, c) {
  if (!isFinite(o)||!isFinite(h)||!isFinite(l)||!isFinite(c)) return false;
  if (o<=0||h<=0||l<=0||c<=0) return false;
  if (h < Math.max(o,c)) return false;
  if (l > Math.min(o,c)) return false;
  if (h < l) return false;
  return true;
}

async function run() {
  console.log('[BENCHMARK] Phase 10R-M.4 Fast-Path Live Benchmark');

  // ── Pre-flight checks ─────────────────────────────────────────────────────
  if (!fs.existsSync(COHORT_FILE)) {
    console.error('FAIL: Cohort file not found. Run phase10rm4_fastpath_benchmark_cohort.cjs first.');
    process.exit(1);
  }

  const cohortReport = JSON.parse(fs.readFileSync(COHORT_FILE, 'utf8'));
  if (cohortReport.LIVE_BENCHMARK !== 'APPROVED') {
    console.error(`LIVE_BENCHMARK = ${cohortReport.LIVE_BENCHMARK}. Benchmark blocked.`);
    process.exit(1);
  }

  // Queue hash re-verification
  const queueHash = crypto.createHash('sha256').update(fs.readFileSync(QUEUE_FILE)).digest('hex');
  const cp = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
  if (queueHash !== cp.queue_hash) {
    console.error('FAIL: Queue hash mismatch at benchmark start. Aborting.');
    process.exit(1);
  }

  // M.4 task ownership check — read-only: verify checkpoint is still alive
  const checkpointAge = (Date.now() - new Date(cp.last_request_timestamp).getTime()) / 1000;
  const m4Status = checkpointAge < 120 ? 'ACTIVE' : 'POSSIBLY_STOPPED';
  console.log(`  M.4 checkpoint age: ${Math.round(checkpointAge)}s → task-5348 status: ${m4Status}`);

  // Re-verify each cohort item is still unclaimed by M.4
  const processedProviders = new Set(cp.processed_providers || []);
  const safeCohort = cohortReport.cohort.filter(item => {
    if (processedProviders.has(item.provider_key)) {
      console.log(`  EXCLUDED (now claimed by M.4): ${item.provider_key}`);
      return false;
    }
    return true;
  });

  if (safeCohort.length === 0) {
    console.log('  All cohort items now claimed by M.4. LIVE_BENCHMARK = BLOCKED (no unsafe work done).');
    fs.writeFileSync(BM_RESULT, JSON.stringify({ LIVE_BENCHMARK: 'BLOCKED', reason: 'ALL_COHORT_CLAIMED_BY_M4', timestamp: new Date().toISOString() }, null, 2));
    fs.writeFileSync(BM_MD, `# Benchmark Blocked\n\nAll cohort items were claimed by task-5348 before benchmark could begin. No API calls made.\n`);
    process.exit(0);
  }

  console.log(`  Safe cohort: ${safeCohort.length} instruments`);

  // Initialize isolated evidence file
  fs.writeFileSync(BM_EVIDENCE, '');

  // ── Run benchmark ─────────────────────────────────────────────────────────
  const metrics = {
    total_requests: 0,
    http_200: 0,
    http_400: 0,
    http_429: 0,
    http_401_403: 0,
    other_failures: 0,
    candles_returned: 0,
    requested_dates_recovered: 0,
    unexpected_dates: 0,
    duplicate_dates: 0,
    identity_mismatches: 0,
    latencies_ms: [],
    consecutive_429: 0
  };

  const benchmarkStaged = new Set();

  let previousRequestAt = 0;

  for (const item of safeCohort) {
    const now = Date.now();
    const wait = Math.max(0, REQUEST_GAP_MS - (now - previousRequestAt));
    if (wait > 0) {
      console.log(`  Waiting ${wait}ms...`);
      await sleep(wait);
    }

    // Final ownership check immediately before request
    const cpFresh = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
    if (new Set(cpFresh.processed_providers || []).has(item.provider_key)) {
      console.log(`  SKIP (M.4 claimed during wait): ${item.provider_key}`);
      continue;
    }

    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(item.provider_key)}/day/${item.to_date}/${item.from_date}`;
    const requestedDates = new Set(item.required_dates);
    metrics.total_requests++;

    const startMs = Date.now();
    let httpStatus = 0;
    let payload = null;

    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      httpStatus = res.status;
      const text = await res.text();
      try { payload = JSON.parse(text); } catch(e) {}
    } catch(err) {
      console.error(`  Fetch error: ${err.message}`);
      metrics.other_failures++;
      previousRequestAt = Date.now();
      continue;
    }

    const latency = Date.now() - startMs;
    metrics.latencies_ms.push(latency);
    previousRequestAt = Date.now();

    console.log(`  ${item.provider_key}: HTTP ${httpStatus}, ${latency}ms`);

    if (httpStatus === 429) {
      metrics.http_429++;
      metrics.consecutive_429++;
      const delays = [60000, 180000, 600000];
      if (metrics.consecutive_429 > 3) {
        console.error('  HALT: 4 consecutive 429s. Stopping benchmark immediately.');
        break;
      }
      const delay = delays[Math.min(metrics.consecutive_429 - 1, 2)];
      console.log(`  Backing off ${delay/1000}s...`);
      await sleep(delay);
      continue;
    }

    metrics.consecutive_429 = 0;

    if (httpStatus === 401 || httpStatus === 403) {
      metrics.http_401_403++;
      console.error(`  HALT: HTTP ${httpStatus}. Auth failure.`);
      break;
    }

    if (httpStatus === 400) { metrics.http_400++; continue; }
    if (!payload || payload.status !== 'success' || !payload.data?.candles) {
      metrics.other_failures++;
      continue;
    }

    metrics.http_200++;
    const candles = payload.data.candles;
    metrics.candles_returned += candles.length;

    for (const c of candles) {
      const dt = c[0].split('T')[0];

      if (requestedDates.has(dt)) {
        const ohlcOk = validateOHLC(c[1], c[2], c[3], c[4]);
        if (!ohlcOk) continue;

        const key = `${item.provider_key}_${dt}`;
        if (benchmarkStaged.has(key)) { metrics.duplicate_dates++; continue; }

        // Identity check: provider_key must embed isin and exchange correctly
        const [exSeg, isin] = item.provider_key.split('|');
        if (!isin || !item.isin || isin !== item.isin) { metrics.identity_mismatches++; continue; }

        benchmarkStaged.add(key);
        metrics.requested_dates_recovered++;

        // Write to ISOLATED benchmark evidence only
        fs.appendFileSync(BM_EVIDENCE, JSON.stringify({
          benchmark_only: true,
          provider_key: item.provider_key,
          trade_date: dt,
          open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5],
          latency_ms: latency,
          http_status: httpStatus,
          retrieved_at: new Date().toISOString()
        }) + '\n');
      } else {
        metrics.unexpected_dates++;
      }
    }
  }

  // ── Compute summary ───────────────────────────────────────────────────────
  const avgLatency = metrics.latencies_ms.length > 0
    ? Math.round(metrics.latencies_ms.reduce((a, b) => a + b, 0) / metrics.latencies_ms.length)
    : 0;
  const rate429 = metrics.total_requests > 0
    ? ((metrics.http_429 / metrics.total_requests) * 100).toFixed(2) + '%'
    : '0%';
  const successRate = metrics.total_requests > 0
    ? ((metrics.http_200 / metrics.total_requests) * 100).toFixed(2) + '%'
    : '0%';

  const result = {
    timestamp: new Date().toISOString(),
    queue_sha256: queueHash,
    m4_task_status: m4Status,
    cohort_evaluated: cohortReport.cohort.length,
    cohort_safe: safeCohort.length,
    ...metrics,
    avg_latency_ms: avgLatency,
    rate_429: rate429,
    success_rate: successRate,
    production_db_writes: 0,
    certification_changed: false,
    benchmark_evidence_file: 'PHASE10RM4_FASTPATH_BENCHMARK_EVIDENCE.jsonl (ISOLATED)',
    gate: metrics.http_401_403 === 0 && metrics.consecutive_429 < 4 && metrics.identity_mismatches === 0
      ? 'PASS'
      : 'FAIL'
  };

  fs.writeFileSync(BM_RESULT, JSON.stringify(result, null, 2));

  const md = `# Phase 10R-M.4 Fast-Path Live Benchmark

## Gate: ${result.gate === 'PASS' ? '✅ PASS' : '❌ FAIL'}

| Metric | Value |
|--------|-------|
| Total Requests | ${metrics.total_requests} |
| HTTP 200 | ${metrics.http_200} |
| HTTP 400 | ${metrics.http_400} |
| HTTP 429 | ${metrics.http_429} |
| HTTP 401/403 | ${metrics.http_401_403} |
| Other Failures | ${metrics.other_failures} |
| Candles Returned | ${metrics.candles_returned} |
| Requested Dates Recovered | ${metrics.requested_dates_recovered} |
| Unexpected Dates | ${metrics.unexpected_dates} |
| Duplicate Dates | ${metrics.duplicate_dates} |
| Identity Mismatches | ${metrics.identity_mismatches} |
| Avg Latency | ${avgLatency}ms |
| 429 Rate | ${rate429} |
| Success Rate | ${successRate} |

Production DB writes: **0**
Certification changed: **NO**
`;

  fs.writeFileSync(BM_MD, md);
  console.log(`\n[BENCHMARK] Gate: ${result.gate}`);
  console.log(`  Requests: ${metrics.total_requests}, 200: ${metrics.http_200}, 429: ${metrics.http_429}`);
  console.log(`  Recovered: ${metrics.requested_dates_recovered}, Unexpected: ${metrics.unexpected_dates}`);
  console.log(`  Avg latency: ${avgLatency}ms`);
}

run().catch(err => {
  console.error('[BENCHMARK] Fatal error:', err.message);
  process.exit(1);
});
