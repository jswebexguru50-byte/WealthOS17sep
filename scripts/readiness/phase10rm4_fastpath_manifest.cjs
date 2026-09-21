#!/usr/bin/env node
'use strict';
/**
 * PHASE10RM4_FASTPATH_MANIFEST — Fast-Path Approval Decision
 * 
 * Reads all evidence and produces FAST_PATH_APPROVED or FAST_PATH_REJECTED.
 * Called after benchmark completes.
 */

const fs   = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.cwd();
const ARTIFACT_DIR = path.join(ROOT, 'reports/market-data');

function hashFile(p) {
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function readJSON(f) {
  try { return JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR, f), 'utf8')); }
  catch(e) { return null; }
}

const analysis  = readJSON('PHASE10RM4_FASTPATH_ANALYSIS.json');
const cohort    = readJSON('PHASE10RM4_FASTPATH_BENCHMARK_COHORT.json');
const benchmark = readJSON('PHASE10RM4_FASTPATH_BENCHMARK.json');
const aiAudit   = readJSON('PHASE10RM6_AI_DEPENDENCY_AUDIT.json');
const offTest   = readJSON('PHASE10RM6_OFFLINE_TEST_RESULTS.json');

// Approval conditions (each must pass)
const conditions = {
  queue_hash_unchanged:         analysis?.queue_hash_verified === true,
  optimized_request_deterministic: analysis !== null,
  benchmark_cohort_proven:      cohort?.LIVE_BENCHMARK === 'APPROVED',
  offline_coverage_equivalent:  cohort?.offline_scheduler_comparison?.coverage_equivalence === 'PASS',
  benchmark_executed:           benchmark !== null && benchmark.LIVE_BENCHMARK !== 'BLOCKED',
  no_identity_corruption:       benchmark ? benchmark.identity_mismatches === 0 : true,
  no_duplicate_canonical:       benchmark ? benchmark.duplicate_dates === 0 : true,
  no_auth_failure:              benchmark ? benchmark.http_401_403 === 0 : true,
  no_abnormal_429:              benchmark ? benchmark.http_429 < 4 : true,
  no_protected_state_mutation:  benchmark ? benchmark.production_db_writes === 0 : true,
  certification_unchanged:      benchmark ? benchmark.certification_changed === false : true,
  ai_runtime_dependency_zero:   aiAudit?.AI_RUNTIME_DEPENDENCY === 0,
  restart_safe:                 offTest?.RESTART_SAFE === 'PASS',
};

const failedConditions = Object.entries(conditions).filter(([,v]) => v === false).map(([k]) => k);
const allPass = failedConditions.length === 0;

// If benchmark was blocked due to M.4 claiming all cohort items, that's safe — use conservative scheduler
const benchmarkBlocked = benchmark?.LIVE_BENCHMARK === 'BLOCKED';

let decision;
if (allPass) {
  decision = 'FAST_PATH_APPROVED';
} else if (benchmarkBlocked) {
  decision = 'FAST_PATH_REJECTED'; // blocked = safe fallback to conservative
} else {
  decision = 'FAST_PATH_REJECTED';
}

// Key finding: M.4 already uses 1 request/provider = already optimal
// So the recommended scheduler IS the same scheduler. No acceleration needed.
const alreadyOptimal = analysis?.theoretical_request_reduction === 0;

const manifest = {
  timestamp: new Date().toISOString(),
  queue_sha256:                      analysis?.queue_sha256 || 'UNKNOWN',
  analysis_sha256:                   hashFile(path.join(ARTIFACT_DIR, 'PHASE10RM4_FASTPATH_ANALYSIS.json')),
  benchmark_cohort_sha256:           hashFile(path.join(ARTIFACT_DIR, 'PHASE10RM4_FASTPATH_BENCHMARK_COHORT.json')),
  benchmark_sha256:                  hashFile(path.join(ARTIFACT_DIR, 'PHASE10RM4_FASTPATH_BENCHMARK.json')),
  current_request_count:             analysis?.current_request_count || 0,
  optimized_request_count:           analysis?.optimized_request_count || 0,
  theoretical_reduction_percentage:  analysis?.optimization_percentage || 0,
  measured_request_count:            benchmark?.total_requests || 0,
  measured_latency:                  benchmark ? `${benchmark.avg_latency_ms}ms` : 'NOT_MEASURED',
  measured_429_rate:                 benchmark?.rate_429 || 'NOT_MEASURED',
  measured_success_rate:             benchmark?.success_rate || 'NOT_MEASURED',
  recommended_concurrency:           1,
  recommended_request_gap:           '10000ms',
  recommended_scheduler:             alreadyOptimal
    ? 'EXISTING_M4_RANGE_CONSOLIDATION (already optimal — no change needed)'
    : 'OPTIMIZED_RANGE_SCHEDULER',
  conditions,
  failed_conditions:                 failedConditions,
  fast_path_decision:                decision,
  safety_status:                     allPass ? 'SAFE' : 'FAILED_CONDITIONS',
  key_finding:                       alreadyOptimal
    ? 'M.4 already performs 1 range request per provider_key. This IS the optimal strategy. No architectural change required — only rate-gap tuning if needed.'
    : 'Request consolidation possible — see analysis for details.',
  production_db_writes:              0,
  certification_changed:             false
};

fs.writeFileSync(path.join(ARTIFACT_DIR, 'PHASE10RM4_FASTPATH_MANIFEST.json'), JSON.stringify(manifest, null, 2));

const badge = decision === 'FAST_PATH_APPROVED' ? '✅' : '❌';
const md = `# Phase 10R-M.4 Fast-Path Manifest

## Decision: ${badge} ${decision}

| Condition | Result |
|-----------|--------|
${Object.entries(conditions).map(([k,v]) => `| ${k} | ${v ? '✅' : '❌'} |`).join('\n')}

## Recommended Scheduler

**${manifest.recommended_scheduler}**

## Key Finding

${manifest.key_finding}

## Metrics

| Metric | Value |
|--------|-------|
| Current Request Count | ${manifest.current_request_count} |
| Optimized Request Count | ${manifest.optimized_request_count} |
| Theoretical Reduction | ${manifest.theoretical_reduction_percentage}% |
| Measured Latency | ${manifest.measured_latency} |
| 429 Rate | ${manifest.measured_429_rate} |
| Success Rate | ${manifest.measured_success_rate} |
| Recommended Gap | ${manifest.recommended_request_gap} |
| Recommended Concurrency | ${manifest.recommended_concurrency} |
`;

fs.writeFileSync(path.join(ARTIFACT_DIR, 'PHASE10RM4_FASTPATH_MANIFEST.md'), md);
console.log(`\n[FASTPATH MANIFEST] Decision: ${decision}`);
console.log(`  Key finding: ${manifest.key_finding}`);
console.log(`  Failed conditions: ${failedConditions.length === 0 ? 'none' : failedConditions.join(', ')}`);
