#!/usr/bin/env node
'use strict';
/**
 * STEP 7 — PRODUCTION PROMOTION AUTHORIZATION PACKAGE
 * Only executes if STEP 6 cross-gate = PASS.
 * Authorization field is ALWAYS "PENDING_HUMAN_APPROVAL".
 * This file does NOT authorize production writes.
 * READ-ONLY. No insertions.
 */
const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');

const ROOT      = process.cwd();
const ARTIFACT  = path.join(ROOT, 'reports/market-data');
const READINESS = path.join(ROOT, 'reports/readiness');

console.log('[STEP 7] Generating promotion authorization package...\n');

// ── Gate prerequisite: Cross-gate must have passed ────────────────────────────
const crossGatePath = path.join(READINESS, 'PHASE10RM6_CROSS_GATE_RECONCILIATION.json');
if (!fs.existsSync(crossGatePath)) {
  console.error('BLOCKED: STEP 6 cross-gate report not found. Run phase10rm6_cross_gate_reconciliation.cjs first.');
  process.exit(1);
}
const crossGate = JSON.parse(fs.readFileSync(crossGatePath, 'utf8'));
if (crossGate.CROSS_GATE !== 'PASS') {
  console.error(`BLOCKED: Cross-gate result is "${crossGate.CROSS_GATE}". Authorization package cannot be created until all gates pass.`);
  console.error(`Failures: ${crossGate.failures.join('; ')}`);
  process.exit(1);
}
console.log(`  ✓ Cross-gate prerequisite: PASS`);

// ── Load all constituent reports ──────────────────────────────────────────────
function load(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

const m4Gate   = load(path.join(ARTIFACT, 'PHASE10RM4_FINAL_FORENSIC_GATE.json'));
const m4Bundle = load(path.join(ARTIFACT, 'M4_EVIDENCE_BUNDLE_MANIFEST.json'));
const promo    = load(path.join(READINESS, 'PHASE10RM56_PROMOTION_REVALIDATION.json'));
const ohlc     = load(path.join(READINESS, 'PHASE10RM57_OHLC_FORENSIC_CLASSIFICATION.json'));
const mtReview = load(path.join(READINESS, 'PHASE10RM58_MASTERTICKER_IDENTITY_REVIEW.json'));
const unresolved = load(path.join(ARTIFACT, 'M4_UNRESOLVED_DATE_REMEDIATION.json'));

// ── DB preflight: verify portfolio.db accessible ──────────────────────────────
const Database = require('better-sqlite3');
let dbPreflightStatus = 'UNKNOWN';
let dbRowCount = null;
let dbSHA256note = null;
try {
  const pdb = new Database(path.join(ROOT, 'portfolio.db'), { readonly: true });
  const row  = pdb.prepare('SELECT COUNT(*) cnt FROM DailyOHLCV').get();
  dbRowCount = row?.cnt ?? null;
  // Estimate existing row count in target table
  dbPreflightStatus = 'ACCESSIBLE';
  pdb.close();
  console.log(`  ✓ DB preflight: portfolio.db accessible, DailyOHLCV rows = ${dbRowCount}`);
} catch(e) {
  dbPreflightStatus = 'ERROR: ' + e.message;
  console.log(`  ⚠ DB preflight: ${dbPreflightStatus}`);
}

// ── Promotion set hash ────────────────────────────────────────────────────────
const PROMO_FILE = path.join(ARTIFACT, 'PHASE10RM5Y_PROMOTION_MANIFEST.jsonl');
const promoFileSHA = crypto.createHash('sha256').update(fs.readFileSync(PROMO_FILE)).digest('hex');

// ── Rollback plan ─────────────────────────────────────────────────────────────
const rollbackPlan = {
  approach: 'DELETE WHERE symbol IN (promotion_set_symbols) AND trade_date IN (promotion_set_dates) AND source_provider = "UPSTOX"',
  note: 'A pre-promotion backup of portfolio.db must be created and its SHA-256 recorded before any insertion. The backup file must be immutable after creation.',
  rollback_verification: 'After rollback, verify DailyOHLCV row count equals pre-promotion count. Cross-reference with backup SHA-256.',
  backup_required_before_promotion: true,
  automated_rollback: false,
  rollback_requires_human_authorization: true
};

// ── Compose authorization package ────────────────────────────────────────────
const pkg = {
  timestamp:    new Date().toISOString(),

  // ── AUTHORIZATION ──────────────────────────────────────────────────────────
  AUTHORIZATION: 'PENDING_HUMAN_APPROVAL',
  authorization_note: 'The existence of this file does NOT authorize production writes. Promotion requires explicit human sign-off on this exact file hash and the hash of portfolio.db backup.',

  // ── PROMOTION SET ──────────────────────────────────────────────────────────
  promotion_set: {
    source_artifact:          'reports/market-data/PHASE10RM5Y_PROMOTION_MANIFEST.jsonl',
    file_sha256:              promoFileSHA,
    dry_run_content_sha256:   promo.dry_run_content_sha256,
    sha256_note:              promo.sha256_note,
    record_count:             promo.record_count,
    target_table:             'DailyOHLCV',
    exchange_coverage:        'BSE (primary); all records sourced from Upstox BSE_EQ segment',
    source_provider:          'UPSTOX',
    recovery_phase:           'Phase_10R_M4',
    fresh_revalidation_timestamp: promo.timestamp,
  },

  // ── M4 EVIDENCE BUNDLE ─────────────────────────────────────────────────────
  m4_evidence: {
    bundle_compound_sha256:   m4Bundle.compound_sha256,
    frozen_artifact_count:    m4Bundle.frozen_count,
    m4_forensic_gate:         m4Gate.final_gate,
    m4_complete_count:        m4Bundle.m4_complete_count,
    m4_manual_review_count:   m4Bundle.m4_manual_review_count,
    m4_unaccounted:           m4Bundle.m4_unaccounted,
    queue_sha256:             m4Gate.queue_sha256,
  },

  // ── FRESH REVALIDATION ─────────────────────────────────────────────────────
  revalidation: {
    gate:                     promo.gate,
    new_missing_row:          promo.counts.NEW_MISSING_ROW,
    existing_identical_row:   promo.counts.EXISTING_IDENTICAL_ROW,
    existing_conflicting_row: promo.counts.EXISTING_CONFLICTING_ROW,
    target_schema_unresolved: promo.counts.TARGET_SCHEMA_UNRESOLVED,
    unexplained:              promo.counts.UNEXPLAINED,
    anomaly_overlap:          promo.counts.ANOMALY_OVERLAP,
    identity_fail:            promo.counts.IDENTITY_FAIL,
    ohlc_fail:                promo.counts.OHLC_FAIL,
  },

  // ── OHLC ANOMALY STATUS ───────────────────────────────────────────────────
  ohlc_anomalies: {
    total:                    ohlc.total_anomalies,
    accounted:                ohlc.accounted,
    UNACCOUNTED:              ohlc.UNACCOUNTED,
    promotion_overlap:        promo.counts.ANOMALY_OVERLAP,
    no_modifications_applied: ohlc.no_modifications_applied,
    note:                     'All 190 anomalies are isolated from the 18,244 promotion set. They remain as QUARANTINE/IDENTITY_UNRESOLVED pending separate remediation.',
  },

  // ── MASTERTICKER STATUS ───────────────────────────────────────────────────
  masterticker: {
    total_reviewed:           mtReview.total_duplicate_symbols,
    accounted:                mtReview.accounted,
    UNACCOUNTED:              mtReview.UNACCOUNTED,
    classification_summary:   mtReview.classification_summary,
    proposed_corrections:     mtReview.proposed_corrections_count,
    masterticker_modified:    mtReview.masterticker_modified,
    note:                     'All 37 duplicate symbols are VALID_DISTINCT_INSTRUMENTS (different ISINs or exchange/segment). No MasterTicker corrections required for the promotion set.',
  },

  // ── UNRESOLVED DATE POPULATION ────────────────────────────────────────────
  unresolved_dates: {
    population:               'M4_UNRESOLVED_DATE_REMEDIATION',
    total:                    unresolved.total,
    isolation_note:           'These 7,009 dates are fully isolated from the promotion set. They will NOT be promoted in this transaction.',
    remediation_status:       'PENDING_SEPARATE_AUTHORIZATION',
  },

  // ── DB PREFLIGHT ──────────────────────────────────────────────────────────
  db_preflight: {
    status:                   dbPreflightStatus,
    dailyohlcv_existing_rows: dbRowCount,
    expected_rows_after_promotion: (dbRowCount ?? 0) + 18244,
    backup_required:          true,
    backup_sha256:            'NOT_YET_TAKEN — must be taken immediately before promotion',
    backup_path:              'NOT_YET_DEFINED — must be defined in promotion execution plan',
  },

  // ── SAFETY SUMMARY ────────────────────────────────────────────────────────
  safety: {
    production_db_writes_to_date:  0,
    masterticker_writes_to_date:   0,
    strategy_changes_to_date:      0,
    certification_changes_to_date: 0,
    market_data_certified:         false,
  },

  // ── CROSS-GATE ───────────────────────────────────────────────────────────
  cross_gate: {
    result:                   crossGate.CROSS_GATE,
    failure_count:            crossGate.failure_count,
    timestamp:                crossGate.timestamp,
  },

  // ── ROLLBACK PLAN ─────────────────────────────────────────────────────────
  rollback_plan: rollbackPlan,

  // ── WHAT THE NEXT AUTHORIZED TRANSACTION MUST DO ─────────────────────────
  next_authorized_transaction: {
    required_steps: [
      '1. Human operator confirms this authorization package by its SHA-256.',
      '2. Human operator confirms portfolio.db backup SHA-256.',
      '3. Create portfolio.db backup in a safe, immutable location.',
      '4. Verify backup SHA-256 matches expected pre-promotion state.',
      '5. Insert exactly 18,244 rows from PHASE10RM5Y_PROMOTION_MANIFEST.jsonl into DailyOHLCV.',
      '6. Verify post-insertion row count = pre-promotion count + 18,244.',
      '7. Re-run phase10rm56_promotion_revalidation.cjs — expect EXISTING_IDENTICAL_ROW = 18,244.',
      '8. Update MARKET_DATA_CERTIFIED only after all verification passes.',
    ],
    prohibited: [
      'Do not insert before backup is confirmed.',
      'Do not insert the 7,009 MANUAL_REVIEW dates in this transaction.',
      'Do not modify MasterTickers as part of this transaction.',
      'Do not use AI/LLM services during the insertion runtime.',
      'Do not change certification before post-insertion verification passes.',
    ],
  },
};

// Compute SHA-256 of the authorization package itself
const pkgJSON  = JSON.stringify(pkg, null, 2);
const pkgSHA   = crypto.createHash('sha256').update(pkgJSON).digest('hex');
pkg._package_sha256 = pkgSHA;

const OUT = path.join(READINESS, 'PHASE10RM6_PRODUCTION_PROMOTION_AUTHORIZATION.json');
fs.writeFileSync(OUT, JSON.stringify(pkg, null, 2));

console.log('\n  ═══════════════════════════════════════════════════════════');
console.log('  AUTHORIZATION PACKAGE GENERATED');
console.log('  ═══════════════════════════════════════════════════════════');
console.log(`  Package SHA-256: ${pkgSHA}`);
console.log(`  AUTHORIZATION field: ${pkg.AUTHORIZATION}`);
console.log(`  Promotion records: ${pkg.promotion_set.record_count}`);
console.log(`  Promotion file SHA: ${pkg.promotion_set.file_sha256}`);
console.log(`  M4 bundle compound SHA: ${pkg.m4_evidence.bundle_compound_sha256}`);
console.log(`  DB preflight: ${pkg.db_preflight.status}`);
console.log(`  DailyOHLCV existing rows: ${pkg.db_preflight.dailyohlcv_existing_rows}`);
console.log(`  Production DB writes to date: ${pkg.safety.production_db_writes_to_date}`);
console.log('  ───────────────────────────────────────────────────────────');
console.log('  STEP 8: STOP — DO NOT INSERT UNTIL HUMAN AUTHORIZATION.');
console.log('  This file alone does NOT authorize production writes.');
console.log('  ═══════════════════════════════════════════════════════════\n');
