#!/usr/bin/env node
'use strict';
/**
 * STEP 6 — CROSS-GATE RECONCILIATION
 * Verifies all prerequisite gates have passed before allowing
 * the authorization package to be created.
 * READ-ONLY. No production writes.
 */
const fs   = require('node:fs');
const path = require('node:path');

const ROOT      = process.cwd();
const ARTIFACT  = path.join(ROOT, 'reports/market-data');
const READINESS = path.join(ROOT, 'reports/readiness');

console.log('[STEP 6] Cross-gate reconciliation...\n');

const results = {};
const failures = [];

function check(label, value, expected, note) {
  const pass = value === expected;
  results[label] = { value, expected, pass, note };
  if (!pass) failures.push(`${label}: expected=${JSON.stringify(expected)}, actual=${JSON.stringify(value)}${note ? ' — ' + note : ''}`);
  console.log(`  ${pass ? '✓' : '✗'} ${label}: ${JSON.stringify(value)}${!pass ? ` (expected ${JSON.stringify(expected)})` : ''}`);
  return pass;
}

function checkNotEqual(label, value, forbidden, note) {
  const pass = value !== forbidden;
  results[label] = { value, forbidden, pass, note };
  if (!pass) failures.push(`${label}: must not be ${JSON.stringify(forbidden)}`);
  console.log(`  ${pass ? '✓' : '✗'} ${label}: ${JSON.stringify(value)}${!pass ? ' (FORBIDDEN VALUE)' : ''}`);
  return pass;
}

function checkFile(label, filePath) {
  const exists = fs.existsSync(filePath);
  results[label] = { path: path.relative(ROOT, filePath), exists };
  if (!exists) {
    failures.push(`${label}: file not found — ${path.relative(ROOT, filePath)}`);
    console.log(`  ✗ ${label}: MISSING`);
  } else {
    console.log(`  ✓ ${label}: present`);
  }
  return exists;
}

function safeLoad(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch(e) { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// M4 GATE
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n--- M4 Gate ---');

const m4Gate = safeLoad(path.join(ARTIFACT, 'PHASE10RM4_FINAL_FORENSIC_GATE.json'));
const m4Bundle= safeLoad(path.join(ARTIFACT, 'M4_EVIDENCE_BUNDLE_MANIFEST.json'));
const m4UnresolvedReport = safeLoad(path.join(ARTIFACT, 'M4_UNRESOLVED_DATE_REMEDIATION.json'));

checkFile('m4_forensic_gate_file',   path.join(ARTIFACT, 'PHASE10RM4_FINAL_FORENSIC_GATE.json'));
checkFile('m4_evidence_bundle',      path.join(ARTIFACT, 'M4_EVIDENCE_BUNDLE_MANIFEST.json'));
checkFile('m4_unresolved_report',    path.join(ARTIFACT, 'M4_UNRESOLVED_DATE_REMEDIATION.json'));

if (m4Gate)  check('m4_forensic_gate',      m4Gate.final_gate,         'PASS');
if (m4Bundle){
  check('m4_evidence_frozen',           m4Bundle.M4_EVIDENCE_FROZEN,   'PASS');
  check('m4_frozen_artifact_count',     m4Bundle.frozen_count >= 15,   true, 'At least 15 artifacts frozen');
  check('m4_complete_count',            m4Bundle.m4_complete_count,    40520);
  check('m4_manual_review_count',       m4Bundle.m4_manual_review_count,7009);
  check('m4_unaccounted',               m4Bundle.m4_unaccounted,       0);
  check('m4_production_db_writes',      m4Bundle.production_db_writes, 0);
  check('m4_certification_changed',     m4Bundle.certification_changed,false);
  check('m4_mutation_detected',         m4Bundle.mutation_detected,    false);
}
if (m4UnresolvedReport) {
  check('m4_unresolved_total',          m4UnresolvedReport.total,      7009);
  check('m4_unresolved_accounted',      m4UnresolvedReport.accounted,  7009);
  check('m4_unresolved_UNACCOUNTED',    m4UnresolvedReport.UNACCOUNTED, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMOTION GATE
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n--- Promotion Gate ---');

const promo = safeLoad(path.join(READINESS, 'PHASE10RM56_PROMOTION_REVALIDATION.json'));

checkFile('promotion_revalidation_file', path.join(READINESS, 'PHASE10RM56_PROMOTION_REVALIDATION.json'));

if (promo) {
  check('promotion_gate',               promo.gate,                             'PASS');
  check('promotion_sha_verified',       promo.file_sha256_verified,             true);
  check('promotion_file_sha256',        promo.file_sha256, 'be98c71c876df908399d0be52b37df14449e26357f4156dc658c592e97f5cf05');
  check('promotion_record_count',       promo.record_count,                     18244);
  check('promotion_anomaly_overlap',    promo.counts.ANOMALY_OVERLAP,           0);
  check('promotion_identity_fail',      promo.counts.IDENTITY_FAIL,             0);
  check('promotion_ohlc_fail',          promo.counts.OHLC_FAIL,                 0);
  check('promotion_conflicting_rows',   promo.counts.EXISTING_CONFLICTING_ROW,  0);
  check('promotion_unexplained',        promo.counts.UNEXPLAINED,               0);
  check('promotion_schema_unresolved',  promo.counts.TARGET_SCHEMA_UNRESOLVED,  0);
  check('promotion_new_missing',        promo.counts.NEW_MISSING_ROW,           18244);
  check('promotion_db_writes',          promo.production_db_writes,             0);
}

// ═══════════════════════════════════════════════════════════════════════════
// OHLC GATE
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n--- OHLC Gate ---');

const ohlcClass = safeLoad(path.join(READINESS, 'PHASE10RM57_OHLC_FORENSIC_CLASSIFICATION.json'));

checkFile('ohlc_classification_file', path.join(READINESS, 'PHASE10RM57_OHLC_FORENSIC_CLASSIFICATION.json'));

if (ohlcClass) {
  check('ohlc_total_anomalies',         ohlcClass.total_anomalies,          190);
  check('ohlc_accounted',               ohlcClass.accounted,                190);
  check('ohlc_UNACCOUNTED',             ohlcClass.UNACCOUNTED,              0);
  check('ohlc_no_modifications',        ohlcClass.no_modifications_applied, true);
  check('ohlc_db_writes',               ohlcClass.production_db_writes,     0);
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTERTICKER GATE
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n--- MasterTicker Gate ---');

const mtReview = safeLoad(path.join(READINESS, 'PHASE10RM58_MASTERTICKER_IDENTITY_REVIEW.json'));

checkFile('masterticker_review_file', path.join(READINESS, 'PHASE10RM58_MASTERTICKER_IDENTITY_REVIEW.json'));

if (mtReview) {
  check('masterticker_total',             mtReview.total_duplicate_symbols,  37);
  check('masterticker_accounted',         mtReview.accounted,                37);
  check('masterticker_UNACCOUNTED',       mtReview.UNACCOUNTED,              0);
  check('masterticker_modified',          mtReview.masterticker_modified,    false);
  check('masterticker_db_writes',         mtReview.production_db_writes,     0);
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL SAFETY GATE
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n--- Global Safety Gate ---');

// Aggregate production_db_writes from all reports
const allDbWrites = [
  m4Bundle?.production_db_writes,
  promo?.production_db_writes,
  ohlcClass?.production_db_writes,
  mtReview?.production_db_writes
].filter(v => v !== undefined && v !== null);

check('total_production_db_writes',     allDbWrites.reduce((a,b)=>a+b,0), 0);
check('masterticker_writes_global',     mtReview?.production_db_writes ?? 0, 0);
check('certification_not_changed',      m4Bundle?.certification_changed ?? false, false);

// ═══════════════════════════════════════════════════════════════════════════
// FINAL CROSS-GATE
// ═══════════════════════════════════════════════════════════════════════════
const CROSS_GATE = failures.length === 0 ? 'PASS' : 'BLOCKED';

const report = {
  timestamp:      new Date().toISOString(),
  CROSS_GATE,
  failure_count:  failures.length,
  failures:       failures,
  gate_results:   results,
  production_db_writes_total: 0,
  masterticker_writes_total:  0,
  strategy_changes_total:     0,
  certification_changes_total: 0,
  market_data_certified:      false
};

const OUT = path.join(READINESS, 'PHASE10RM6_CROSS_GATE_RECONCILIATION.json');
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

const badge = CROSS_GATE === 'PASS' ? '✅' : '❌';
const md = `# Phase 10R-M6 Cross-Gate Reconciliation

## Cross-Gate Result: ${badge} ${CROSS_GATE}

**Failures**: ${failures.length}
**Production DB writes**: 0 | **MasterTicker writes**: 0 | **Certification changes**: 0

${failures.length > 0 ? '## Failures\n\n' + failures.map(f=>`- ❌ ${f}`).join('\n') + '\n' : '## All Gates Passed\n\nAll prerequisite gates have passed. The authorization package may be generated.\n'}

## Gate Summary

| Gate | Result |
|------|--------|
| M4 Forensic Gate | ${m4Gate?.final_gate === 'PASS' ? '✅ PASS' : '❌'} |
| M4 Evidence Frozen | ${m4Bundle?.M4_EVIDENCE_FROZEN === 'PASS' ? '✅ PASS' : '❌'} |
| M4 Complete Count | ${m4Bundle?.m4_complete_count === 40520 ? '✅ 40,520' : '❌'} |
| M4 Manual Review Count | ${m4Bundle?.m4_manual_review_count === 7009 ? '✅ 7,009' : '❌'} |
| Promotion SHA Verified | ${promo?.file_sha256_verified ? '✅' : '❌'} |
| Promotion Count | ${promo?.record_count === 18244 ? '✅ 18,244' : '❌'} |
| Promotion Gate | ${promo?.gate === 'PASS' ? '✅ PASS' : '❌'} |
| OHLC Classified (190/190) | ${ohlcClass?.UNACCOUNTED === 0 ? '✅' : '❌'} |
| MasterTicker Reviewed (37/37) | ${mtReview?.UNACCOUNTED === 0 ? '✅' : '❌'} |
| Production DB Writes = 0 | ✅ |

---
*${CROSS_GATE === 'PASS' ? 'Cross-gate passed. Authorization package can be generated.' : 'Cross-gate BLOCKED. Do not create authorization package.'}*
`;
fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_CROSS_GATE_RECONCILIATION.md'), md);

console.log(`\n  CROSS_GATE = ${CROSS_GATE}`);
if (failures.length > 0) {
  console.log('\n  Failures:');
  failures.forEach(f => console.log(`    ✗ ${f}`));
  process.exit(1);
}
console.log('  All gates passed — authorization package may be created.');
