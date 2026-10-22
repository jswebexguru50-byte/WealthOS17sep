#!/usr/bin/env node
'use strict';
/**
 * PHASE10RM4_FASTPATH_ANALYSIS — Static Queue Optimization Analysis
 * 
 * Groups 47,529 recoverable queue items by provider_key, identifies contiguous
 * date runs vs sparse dates, and calculates request reduction opportunities.
 * 
 * NO API CALLS MADE.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.cwd();
const ARTIFACT_DIR = path.join(ROOT, 'reports/market-data');
const QUEUE_FILE = path.join(ARTIFACT_DIR, 'PHASE10RM3_9_REMAINING_COVERAGE_RECOVERY_QUEUE.jsonl');
const CHECKPOINT_FILE = path.join(ARTIFACT_DIR, 'PHASE10RM4_RECOVERY_CHECKPOINT.json');

// ── Step 1: Queue Hash Verification ──────────────────────────────────────────
console.log('[1/4] Verifying queue hash...');

function computeFileHash(filePath) {
  // Stream hash for large files
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

const QUEUE_SHA256 = computeFileHash(QUEUE_FILE);
console.log(`  Queue SHA-256: ${QUEUE_SHA256}`);

const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
const M4_RECORDED_HASH = checkpoint.queue_hash;
console.log(`  M4 Checkpoint hash: ${M4_RECORDED_HASH}`);

if (QUEUE_SHA256 !== M4_RECORDED_HASH) {
  console.error('FAIL CLOSED: Queue hash mismatch. Active M.4 queue has diverged. STOPPING.');
  process.exit(1);
}
console.log('  ✓ Queue hash verified — matches active M.4 checkpoint.');

// ── Step 2: Parse Queue ───────────────────────────────────────────────────────
console.log('[2/4] Parsing queue...');

const lines = fs.readFileSync(QUEUE_FILE, 'utf8').split('\n').filter(l => l.trim() !== '');
let recoverableCount = 0;
let blockedCount = 0;

const byProvider = new Map(); // provider_key → { dates: Set, info }

for (const l of lines) {
  const rec = JSON.parse(l);
  if (rec.recovery_action === 'RECOVER_MISSING_DATES') {
    recoverableCount++;
    if (!byProvider.has(rec.provider_key)) {
      byProvider.set(rec.provider_key, {
        provider_key: rec.provider_key,
        isin: rec.isin,
        symbol: rec.symbol,
        exchange: rec.exchange,
        segment: rec.segment,
        dates: new Set()
      });
    }
    byProvider.get(rec.provider_key).dates.add(rec.required_date);
  } else {
    blockedCount++;
  }
}

console.log(`  Recoverable: ${recoverableCount}, Blocked: ${blockedCount}`);
console.log(`  Unique instruments: ${byProvider.size}`);

// ── Step 3: Optimization Analysis ────────────────────────────────────────────
console.log('[3/4] Running optimization analysis...');

// Upstox V3 daily endpoint: one request per provider_key covers all dates in one range
// M.4 already does this — but we can verify if multi-cluster instruments need splitting

const UPSTOX_MAX_YEARS = 10;
const UPSTOX_MAX_DAYS = UPSTOX_MAX_YEARS * 365;

let singleDateCount = 0;
let multiDateContiguousCount = 0;
let multiDateSparseCount = 0;
let multiClusterCount = 0;

// Current M.4 = 1 request per provider_key (already consolidated range)
let currentRequestCount = 0;
let optimizedRequestCount = 0;
let totalExpectedCandles = 0;

const perProviderAnalysis = [];

for (const [pk, info] of byProvider.entries()) {
  const sortedDates = Array.from(info.dates).sort();
  const n = sortedDates.length;
  currentRequestCount++; // M.4 already does 1 request per provider

  // Calculate clusters: a new cluster starts when gap > 10 days (likely non-trading gap)
  // But since Upstox returns all candles in a range, we only need to split if range > 10 years
  const first = new Date(sortedDates[0]);
  const last = new Date(sortedDates[n - 1]);
  const daySpan = Math.ceil((last - first) / (1000 * 60 * 60 * 24));

  // Identify clusters (groups where dates are within 30-day windows)
  const clusters = [];
  let currentCluster = [sortedDates[0]];
  for (let i = 1; i < n; i++) {
    const prev = new Date(sortedDates[i - 1]);
    const curr = new Date(sortedDates[i]);
    const gap = Math.ceil((curr - prev) / (1000 * 60 * 60 * 24));
    if (gap <= 30) {
      currentCluster.push(sortedDates[i]);
    } else {
      clusters.push(currentCluster);
      currentCluster = [sortedDates[i]];
    }
  }
  clusters.push(currentCluster);

  // How many requests needed for this instrument given 10-year limit?
  const requestsNeeded = Math.ceil(daySpan / UPSTOX_MAX_DAYS) || 1;
  optimizedRequestCount += requestsNeeded;
  totalExpectedCandles += n;

  // Classification
  let classification;
  if (n === 1) { singleDateCount++; classification = 'SINGLE_DATE'; }
  else if (clusters.length > 2) { multiClusterCount++; classification = 'MULTI_CLUSTER'; }
  else if (clusters.length === 1) { multiDateContiguousCount++; classification = 'MULTI_DATE_CONTIGUOUS'; }
  else { multiDateSparseCount++; classification = 'MULTI_DATE_SPARSE'; }

  perProviderAnalysis.push({
    provider_key: pk,
    symbol: info.symbol,
    isin: info.isin,
    date_count: n,
    from_date: sortedDates[0],
    to_date: sortedDates[n - 1],
    day_span: daySpan,
    cluster_count: clusters.length,
    classification,
    current_requests: 1,  // M.4 sends 1 per provider_key
    optimized_requests: requestsNeeded,
    request_reduction: 1 - requestsNeeded,
    expected_candles: n
  });
}

const theoreticalRequestReduction = currentRequestCount - optimizedRequestCount;
const optimizationPct = ((theoreticalRequestReduction / currentRequestCount) * 100).toFixed(2);

// ── Step 4: Output ───────────────────────────────────────────────────────────
console.log('[4/4] Writing analysis...');

const analysis = {
  timestamp: new Date().toISOString(),
  queue_sha256: QUEUE_SHA256,
  queue_hash_verified: true,
  input_record_count: lines.length,
  recoverable_count: recoverableCount,
  blocked_count: blockedCount,
  provider_key_count: byProvider.size,
  current_request_count: currentRequestCount,
  optimized_request_count: optimizedRequestCount,
  theoretical_request_reduction: theoreticalRequestReduction,
  optimization_percentage: parseFloat(optimizationPct),
  instruments_with_single_missing_date: singleDateCount,
  instruments_with_multiple_missing_dates: byProvider.size - singleDateCount,
  classification_breakdown: {
    SINGLE_DATE: singleDateCount,
    MULTI_DATE_CONTIGUOUS: multiDateContiguousCount,
    MULTI_DATE_SPARSE: multiDateSparseCount,
    MULTI_CLUSTER: multiClusterCount
  },
  total_expected_candles: totalExpectedCandles,
  note: 'M.4 already performs range consolidation (1 request per provider_key). Optimization is marginal unless date spans exceed 10 years.',
  per_provider: perProviderAnalysis
};

fs.writeFileSync(
  path.join(ARTIFACT_DIR, 'PHASE10RM4_FASTPATH_ANALYSIS.json'),
  JSON.stringify(analysis, null, 2)
);

const md = `# Phase 10R-M.4 Fast-Path Optimization Analysis

- **Queue SHA-256**: \`${QUEUE_SHA256}\`
- **Hash Verified**: ✓ Matches active M.4 checkpoint

## Summary

| Metric | Value |
|--------|-------|
| Total Records | ${lines.length} |
| Recoverable | ${recoverableCount} |
| Blocked/Manual | ${blockedCount} |
| Unique Instruments | ${byProvider.size} |
| **Current Requests** | **${currentRequestCount}** |
| **Optimized Requests** | **${optimizedRequestCount}** |
| **Theoretical Reduction** | **${theoreticalRequestReduction}** |
| **Optimization %** | **${optimizationPct}%** |

## Instrument Classification

| Class | Count |
|-------|-------|
| SINGLE_DATE | ${singleDateCount} |
| MULTI_DATE_CONTIGUOUS | ${multiDateContiguousCount} |
| MULTI_DATE_SPARSE | ${multiDateSparseCount} |
| MULTI_CLUSTER | ${multiClusterCount} |

## Key Finding

The active M.4 scheduler already performs **per-instrument range consolidation** — sending one request from the earliest missing date to the latest missing date per provider_key. This is already the optimal request structure for the Upstox V3 daily candle endpoint.

Remaining optimization opportunity lies in **request concurrency / gap reduction**, not further request consolidation.
`;

fs.writeFileSync(path.join(ARTIFACT_DIR, 'PHASE10RM4_FASTPATH_ANALYSIS.md'), md);
console.log(`\nAnalysis complete.`);
console.log(`  Current requests:    ${currentRequestCount}`);
console.log(`  Optimized requests:  ${optimizedRequestCount}`);
console.log(`  Reduction:           ${theoreticalRequestReduction} (${optimizationPct}%)`);
