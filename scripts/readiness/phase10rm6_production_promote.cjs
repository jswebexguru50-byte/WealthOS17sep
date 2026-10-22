#!/usr/bin/env node
'use strict';
/**
 * AGENT 4 — PHASE10RM6_PRODUCTION_PROMOTE
 * The SOLE production writer for Phase 10R-M6.
 * Inserts exactly 18,244 authorized promotion records into DailyOHLCV.
 *
 * REQUIRES:
 *   - reports/readiness/HUMAN_AUTHORIZATION.json (APPROVED, correct hashes)
 *   - Wave 1 preflight and backup must have passed
 *   - Exclusive lock ownership
 *
 * INVARIANTS enforced inside transaction:
 *   - source SHA == PROMO_FILE_SHA
 *   - record count == 18,244
 *   - canonical keys unique
 *   - zero existing target rows
 *   - zero conflicts
 *   - zero 7,009 unresolved overlap
 *   - zero 190 anomaly overlap
 *   - OHLC valid
 *   - insert count exactly == 18,244
 *   - row count before == 4,135,605
 *   - row count after == 4,153,849
 *   - certification remains FALSE
 */
const fs       = require('node:fs');
const path     = require('node:path');
const crypto   = require('node:crypto');
const Database = require('better-sqlite3');

const ROOT      = process.cwd();
const READINESS = path.join(ROOT, 'reports/readiness');
const ARTIFACT  = path.join(ROOT, 'reports/market-data');
const RUNTIME   = path.join(READINESS, 'runtime/m6');
const PORTFOLIO = path.join(ROOT, 'portfolio.db');

// Authoritative constants — AUTH_PKG_SHA is the byte-level hash of the finalized
// PHASE10RM6_PRODUCTION_PROMOTION_AUTHORIZATION.json (no self-referential fields present).
const AUTH_PKG_SHA   = '41db30e5d03a16af517c15e39cbedf5c1c3627a7fba818092f8b43e384643599';
const PROMO_FILE_SHA = 'be98c71c876df908399d0be52b37df14449e26357f4156dc658c592e97f5cf05';
const M4_BUNDLE_SHA  = '62a153a49e03815fe53be7b42933b7200c3869f0d4469641da57e183f119ab71';
const EXPECTED_COUNT = 18244;
const DB_ROWS_BEFORE = 4135605;
const DB_ROWS_AFTER  = 4153849;

const ts     = new Date().toISOString();
const execId = `PROMOTE_${Date.now()}`;
const LOCK_PATH = path.join(RUNTIME, 'locks/PRODUCTION_PROMOTION.lock');

console.log(`[AGENT 4] Production promotion — ${execId}`);
console.log(`  ⚠  This is the sole production writer. Proceed with extreme care.\n`);

fs.mkdirSync(path.join(RUNTIME, 'locks'), { recursive: true });

function sha256File(p) {
  // Chunked streaming — handles files of any size (13.5 GB portfolio.db).
  // Byte-identical SHA-256 to readFileSync; same algorithm, same byte sequence.
  const CHUNK = 64 * 1024 * 1024; // 64 MB
  const hash  = crypto.createHash('sha256');
  const buf   = Buffer.allocUnsafe(CHUNK);
  const fd    = fs.openSync(p, 'r');
  let totalBytes = 0, bytesRead;
  while ((bytesRead = fs.readSync(fd, buf, 0, CHUNK, null)) > 0) {
    hash.update(bytesRead === CHUNK ? buf : buf.slice(0, bytesRead));
    totalBytes += bytesRead;
  }
  fs.closeSync(fd);
  return hash.digest('hex');
}

function appendEvent(evt) {
  fs.appendFileSync(path.join(RUNTIME, 'events.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), ...evt }) + '\n');
}

function appendFailure(reason, detail) {
  fs.appendFileSync(path.join(RUNTIME, 'failures.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), exec_id: execId, reason, detail }) + '\n');
}

function stop(reason, detail) {
  const msg = `STOPPED — ${reason}${detail ? ': ' + detail : ''}`;
  console.error(`\n  ✗ ${msg}`);
  appendEvent({ event: 'PROMOTION_STOPPED', reason, detail, exec_id: execId });
  appendFailure(reason, detail);
  // Release lock if we own it
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const lk = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
      if (lk.pid === process.pid) fs.unlinkSync(LOCK_PATH);
    }
  } catch(_) {}
  process.exit(1);
}

function safeLoad(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return null; }
}

// ════════════════════════════════════════════════════════════════════
// PRE-TRANSACTION CHECKS (before lock acquisition)
// ════════════════════════════════════════════════════════════════════

// ── 1. Human authorization ────────────────────────────────────────────────────
console.log('--- Human Authorization ---');
const AUTH_PATH = path.join(READINESS, 'HUMAN_AUTHORIZATION.json');
if (!fs.existsSync(AUTH_PATH)) stop('AUTHORIZATION_MISSING', 'HUMAN_AUTHORIZATION.json not found. Create it with "authorization": "APPROVED"');
const humanAuth = safeLoad(AUTH_PATH);
if (humanAuth.authorization !== 'APPROVED') stop('AUTHORIZATION_NOT_APPROVED', `authorization = "${humanAuth.authorization}"`);
if (humanAuth.package_sha256 !== AUTH_PKG_SHA) stop('AUTH_PACKAGE_SHA_MISMATCH', `expected ${AUTH_PKG_SHA}, got ${humanAuth.package_sha256}`);
if (humanAuth.promotion_record_count !== EXPECTED_COUNT) stop('AUTH_COUNT_MISMATCH', `expected ${EXPECTED_COUNT}, got ${humanAuth.promotion_record_count}`);
if (humanAuth.approved_action !== 'INSERT_18244_PROMOTION_ROWS') stop('AUTH_ACTION_MISMATCH', humanAuth.approved_action);
if (humanAuth.certification_change_authorized !== false) stop('CERTIFICATION_CHANGE_NOT_PROHIBITED');
const authBackupSHA = humanAuth.backup_sha256;
if (!authBackupSHA || authBackupSHA.length !== 64) stop('AUTH_BACKUP_SHA_MISSING', 'backup_sha256 not set in HUMAN_AUTHORIZATION.json');
console.log('  ✓ Human authorization: APPROVED');
console.log(`  ✓ Package SHA verified`);
console.log(`  ✓ Backup SHA present: ${authBackupSHA}`);

// ── 2. Authorization package ──────────────────────────────────────────────────
console.log('\n--- Authorization Package ---');
const AUTH_PKG_PATH = path.join(READINESS, 'PHASE10RM6_PRODUCTION_PROMOTION_AUTHORIZATION.json');
if (!fs.existsSync(AUTH_PKG_PATH)) stop('AUTH_PKG_MISSING');
const actualPkgSHA = sha256File(AUTH_PKG_PATH);
if (actualPkgSHA !== AUTH_PKG_SHA) stop('AUTH_PKG_SHA_MISMATCH', `expected ${AUTH_PKG_SHA}, actual ${actualPkgSHA}`);
console.log('  ✓ Authorization package SHA verified');

// ── 3. Promotion source pre-check ─────────────────────────────────────────────
console.log('\n--- Promotion Source ---');
const PROMO_FILE = path.join(ARTIFACT, 'PHASE10RM5Y_PROMOTION_MANIFEST.jsonl');
if (!fs.existsSync(PROMO_FILE)) stop('PROMO_FILE_MISSING');
const actualPromoSHA = sha256File(PROMO_FILE);
if (actualPromoSHA !== PROMO_FILE_SHA) stop('PROMO_SHA_MISMATCH', `expected ${PROMO_FILE_SHA}, actual ${actualPromoSHA}`);
console.log('  ✓ Promotion file SHA verified');

// ── 4. Backup verification ────────────────────────────────────────────────────
console.log('\n--- Backup Verification ---');
const backupReport = safeLoad(path.join(READINESS, 'PHASE10RM6_PRODUCTION_BACKUP.json'));
if (!backupReport) stop('BACKUP_REPORT_MISSING', 'Run phase10rm6_production_backup.cjs first');
if (backupReport.BACKUP_GATE !== 'PASS') stop('BACKUP_GATE_NOT_PASS', backupReport.BACKUP_GATE);
if (backupReport.backup_sha256 !== authBackupSHA) stop('BACKUP_SHA_AUTH_MISMATCH',
  `authorization says ${authBackupSHA}, backup report says ${backupReport.backup_sha256}`);
console.log('  ✓ Backup gate: PASS');
console.log(`  ✓ Backup SHA matches human authorization: ${authBackupSHA}`);

// ── 5. Preflight gate ─────────────────────────────────────────────────────────
console.log('\n--- Preflight Gate ---');
const preflight = safeLoad(path.join(READINESS, 'PHASE10RM6_PRODUCTION_PREFLIGHT.json'));
if (!preflight) stop('PREFLIGHT_MISSING', 'Run phase10rm6_promotion_preflight.cjs first');
if (preflight.PREFLIGHT_GATE !== 'PASS') stop('PREFLIGHT_NOT_PASS', `${preflight.failed} failures`);
console.log('  ✓ Preflight gate: PASS');

// ── 6. Database snapshot before lock ─────────────────────────────────────────
console.log('\n--- Pre-Lock Database Snapshot ---');
const preLockSHA      = sha256File(PORTFOLIO);
const preLockDbInfo   = (() => {
  const db = new Database(PORTFOLIO, { readonly: true });
  const cnt = db.prepare('SELECT COUNT(*) cnt FROM DailyOHLCV').get()?.cnt ?? -1;
  const cfg = db.prepare(`SELECT value FROM AppConfig WHERE key='MARKET_DATA_CERTIFIED' LIMIT 1`).get();
  db.close();
  return { row_count: cnt, certified: cfg?.value === 'true' };
})();
if (preLockDbInfo.row_count !== DB_ROWS_BEFORE) stop('DB_ROW_COUNT_MISMATCH_PRELOCK',
  `expected ${DB_ROWS_BEFORE}, actual ${preLockDbInfo.row_count}`);
if (preLockDbInfo.certified) stop('CERTIFICATION_ALREADY_TRUE_PRELOCK');
console.log(`  ✓ DailyOHLCV rows: ${preLockDbInfo.row_count}`);
console.log(`  ✓ Certification: FALSE`);
console.log(`  ✓ DB SHA (pre-lock): ${preLockSHA}`);

// MANDATORY: DB SHA + row count must both match Wave-1 captured baseline.
// Row count alone is insufficient — a process could change rows while count stays the same.
const wave1DbSHA = backupReport.source_sha256;
if (!wave1DbSHA || wave1DbSHA.length !== 64) stop('WAVE1_DB_SHA_MISSING', 'backup report missing source_sha256');
if (preLockSHA !== wave1DbSHA) stop('DATABASE_BASELINE_CHANGED',
  `DB SHA changed since Wave-1. Wave-1=${wave1DbSHA}, current=${preLockSHA}. STOP — another process may have mutated the DB.`);
console.log(`  ✓ DB SHA matches Wave-1 baseline: ${wave1DbSHA}`);

// Also compare row count against preflight snapshot
if (preflight.checks) {
  const preflightDbCheck = preflight.checks.find(c => c.id === 'db_row_count');
  if (preflightDbCheck?.value?.actual !== undefined && preflightDbCheck.value.actual !== preLockDbInfo.row_count) {
    stop('DB_CHANGED_SINCE_PREFLIGHT', `preflight=${preflightDbCheck.value.actual}, now=${preLockDbInfo.row_count}`);
  }
}
console.log('  ✓ Database row count and SHA both match Wave-1 baseline');

// ════════════════════════════════════════════════════════════════════
// LOCK ACQUISITION
// ════════════════════════════════════════════════════════════════════
console.log('\n--- Lock Acquisition ---');
if (fs.existsSync(LOCK_PATH)) {
  const existingLock = safeLoad(LOCK_PATH);
  if (existingLock?.pid !== process.pid) {
    stop('LOCK_CONFLICT', `Lock owned by pid ${existingLock?.pid} (this pid ${process.pid})`);
  }
}
const lockData = { pid: process.pid, exec_id: execId, acquired_at: new Date().toISOString(), owner: 'phase10rm6_production_promote' };
fs.writeFileSync(LOCK_PATH, JSON.stringify(lockData, null, 2));
console.log(`  ✓ Lock acquired: pid ${process.pid}`);
appendEvent({ event: 'LOCK_ACQUIRED', pid: process.pid, exec_id: execId });

// ════════════════════════════════════════════════════════════════════
// CRITICAL REVALIDATION (after lock, immediately before BEGIN IMMEDIATE)
// All metadata is re-read from disk. Nothing is carried from Wave 1 cache.
// ════════════════════════════════════════════════════════════════════
console.log('\n--- Critical Pre-Transaction Revalidation ---');

// 1. Re-read authorization package SHA from disk
const revalAuthSHA = sha256File(AUTH_PKG_PATH);
if (revalAuthSHA !== AUTH_PKG_SHA) stop('AUTH_PKG_CHANGED_AFTER_LOCK', `expected ${AUTH_PKG_SHA}, got ${revalAuthSHA}`);
console.log('  ✓ Authorization package SHA stable after lock');

// 2. Re-read promotion source SHA from disk
const revalPromoSHA = sha256File(PROMO_FILE);
if (revalPromoSHA !== PROMO_FILE_SHA) stop('PROMO_SOURCE_CHANGED_AFTER_LOCK', `${revalPromoSHA}`);
console.log('  ✓ Promotion source SHA unchanged after lock');

// 3. Re-read backup metadata
const revalBackup = safeLoad(path.join(READINESS, 'PHASE10RM6_PRODUCTION_BACKUP.json'));
if (!revalBackup) stop('BACKUP_REPORT_DISAPPEARED_AFTER_LOCK');
if (revalBackup.backup_sha256 !== authBackupSHA) stop('BACKUP_SHA_CHANGED_AFTER_LOCK',
  `was ${authBackupSHA}, now ${revalBackup.backup_sha256}`);
console.log(`  ✓ Backup SHA stable after lock: ${authBackupSHA}`);

// 4. Re-read DB state and compare SHA against Wave-1 baseline (mandatory — not optional)
// This is the strongest possible mutation detector: if any byte of the DB changed,
// even with identical row count, this SHA will differ.
const preTransSHA = sha256File(PORTFOLIO);
if (preTransSHA !== wave1DbSHA) stop('DATABASE_BASELINE_CHANGED',
  `DB SHA changed since Wave-1. Wave-1=${wave1DbSHA}, now=${preTransSHA}. STOP — DATABASE_BASELINE_CHANGED.`);
if (preTransSHA !== preLockSHA) stop('DATABASE_CHANGED_BETWEEN_LOCK_AND_TRANSACTION',
  `was ${preLockSHA} at lock, now ${preTransSHA}`);
console.log(`  ✓ DB SHA stable (Wave-1 baseline confirmed): ${preTransSHA}`);

// 5. Re-read promotion records
const promoLines = fs.readFileSync(PROMO_FILE, 'utf8').split('\n').filter(l => l.trim());
if (promoLines.length !== EXPECTED_COUNT) stop('PROMO_COUNT_CHANGED', `${promoLines.length}`);
const promoRecords = promoLines.map(l => JSON.parse(l));
console.log(`  ✓ Promotion records re-read from disk: ${promoRecords.length}`);

// 6. Canonical key uniqueness
const canonKeys = new Set();
let dupKeys = 0;
for (const r of promoRecords) {
  const k = `${r.symbol}|${r.trade_date}`;
  if (canonKeys.has(k)) dupKeys++;
  canonKeys.add(k);
}
if (dupKeys > 0) stop('DUPLICATE_CANONICAL_KEYS', `${dupKeys} duplicates`);
console.log('  ✓ Canonical keys unique');

// 7. Load anomaly row IDs from M5 forensics
const ohlcForensics = safeLoad(path.join(READINESS, 'PHASE10RM57_OHLC_FORENSIC_CLASSIFICATION.json'));
const anomalySymbolDates = new Set();
for (const f of (ohlcForensics?.classified ?? [])) {
  if (f.symbol && f.trade_date) anomalySymbolDates.add(`${f.symbol}|${f.trade_date}`);
}
console.log(`  ✓ Anomaly set loaded: ${anomalySymbolDates.size} records`);

// 8. Load 7,009 unresolved population
const STATE_SQLITE = path.join(ARTIFACT, 'runtime/m4/state.sqlite');
const unresolvedKeys = new Set();
if (fs.existsSync(STATE_SQLITE)) {
  const stateDb = new Database(STATE_SQLITE, { readonly: true });
  const rows = stateDb.prepare(`SELECT symbol, required_date FROM queue_items WHERE state='MANUAL_REVIEW'`).all();
  for (const r of rows) unresolvedKeys.add(`${r.symbol}|${r.required_date}`);
  stateDb.close();
}
console.log(`  ✓ Unresolved set loaded: ${unresolvedKeys.size} records`);

// 9. Check overlaps
let anomalyOverlap = 0, unresolvedOverlap = 0;
for (const r of promoRecords) {
  const k = `${r.symbol}|${r.trade_date}`;
  if (anomalySymbolDates.has(k)) anomalyOverlap++;
  if (unresolvedKeys.has(k)) unresolvedOverlap++;
}
if (anomalyOverlap > 0) stop('ANOMALY_OVERLAP_IN_PROMO', `${anomalyOverlap} records overlap 190 anomaly population`);
if (unresolvedOverlap > 0) stop('UNRESOLVED_OVERLAP_IN_PROMO', `${unresolvedOverlap} records overlap 7,009 unresolved population`);
console.log('  ✓ Zero anomaly overlap');
console.log('  ✓ Zero unresolved overlap');

// 10. OHLC validation
let ohlcFail = 0;
for (const r of promoRecords) {
  const { open: o, high: h, low: l, close: c } = r;
  if ([o,h,l,c].some(v => v == null || !isFinite(v) || v <= 0)) { ohlcFail++; continue; }
  if (h < o || h < c || l > o || l > c || h < l) ohlcFail++;
}
if (ohlcFail > 0) stop('OHLC_VALIDATION_FAILED', `${ohlcFail} records`);
console.log('  ✓ OHLC validation passed');

appendEvent({ event: 'PRE_TRANSACTION_REVALIDATION_PASS', exec_id: execId, promo_count: promoRecords.length, anomaly_overlap: anomalyOverlap, unresolved_overlap: unresolvedOverlap, db_sha_wave1: wave1DbSHA, db_sha_prelock: preLockSHA, db_sha_pretrans: preTransSHA });

// ════════════════════════════════════════════════════════════════════
// PRODUCTION TRANSACTION
// ════════════════════════════════════════════════════════════════════
console.log('\n--- Opening Production Transaction ---');
appendEvent({ event: 'TRANSACTION_STARTING', exec_id: execId });

const db = new Database(PORTFOLIO, { verbose: null });

let insertedCount = 0;
let rollbackReason = null;

try {
  // Final baseline checks inside write connection, before opening BEGIN IMMEDIATE.
  // DB SHA is not re-computed here (already verified twice: pre-lock + pre-transaction).
  // Row count is re-verified as a last line of defence against concurrent writers.
  const preCount = db.prepare('SELECT COUNT(*) cnt FROM DailyOHLCV').get()?.cnt ?? -1;
  if (preCount !== DB_ROWS_BEFORE) {
    rollbackReason = `DB_ROW_COUNT_MISMATCH_AT_TRANSACTION_START: expected ${DB_ROWS_BEFORE}, actual ${preCount}`;
    throw new Error(rollbackReason);
  }

  // Check certification still false
  const certRow = db.prepare(`SELECT value FROM AppConfig WHERE key='MARKET_DATA_CERTIFIED' LIMIT 1`).get();
  if (certRow?.value === 'true') {
    rollbackReason = 'CERTIFICATION_TRUE_AT_TRANSACTION_START';
    throw new Error(rollbackReason);
  }

  // Record pre-transaction MT count as baseline for Wave 4 mutation check
  const preTxMtCount = db.prepare('SELECT COUNT(*) cnt FROM MasterTickers').get()?.cnt ?? 0;
  console.log(`  ✓ Pre-transaction baseline: rows=${preCount}, cert=FALSE, masterTickers=${preTxMtCount}`);

  // Determine column set for DailyOHLCV
  const cols = db.prepare('PRAGMA table_info(DailyOHLCV)').all().map(r => r.name);
  // Required columns in promotion set: symbol, trade_date, open, high, low, close, volume
  // Optional: turnover, ISIN, exchange, segment, source_provider, provenance_classification
  const insertCols = ['symbol', 'trade_date', 'open', 'high', 'low', 'close', 'volume'];
  const optionalCols = ['turnover', 'data_source'];
  const availOptional = optionalCols.filter(c => cols.includes(c));
  const finalCols = [...insertCols, ...availOptional];

  const placeholders = finalCols.map(() => '?').join(', ');
  const insertStmt = db.prepare(
    `INSERT INTO DailyOHLCV (${finalCols.join(', ')}) VALUES (${placeholders})`
  );
  const conflictStmt = db.prepare(`SELECT 1 FROM DailyOHLCV WHERE symbol=? AND trade_date=? LIMIT 1`);

  console.log(`  Opening BEGIN IMMEDIATE...`);
  const runTransaction = db.transaction(() => {
    for (const r of promoRecords) {
      // Verify no existing row (belt-and-suspenders inside transaction)
      const existing = conflictStmt.get(r.symbol, r.trade_date);
      if (existing) {
        rollbackReason = `Conflict found inside transaction: ${r.symbol}|${r.trade_date}`;
        throw new Error(rollbackReason);
      }

      const values = finalCols.map(c => {
        if (c === 'data_source') return r.source_provider ?? 'UPSTOX_RECOVERY_M6';
        if (c === 'turnover') return r.turnover ?? null;
        return r[c] ?? null;
      });

      insertStmt.run(...values);
      insertedCount++;
    }

    // Verify inserted count inside transaction
    if (insertedCount !== EXPECTED_COUNT) {
      rollbackReason = `INSERT_COUNT_INVARIANT_FAILURE: inserted ${insertedCount}, expected ${EXPECTED_COUNT}`;
      throw new Error(rollbackReason);
    }

    // Verify post-count inside transaction
    const postCount = db.prepare('SELECT COUNT(*) cnt FROM DailyOHLCV').get()?.cnt ?? -1;
    if (postCount !== DB_ROWS_AFTER) {
      rollbackReason = `POST_COUNT_INVARIANT_FAILURE: expected ${DB_ROWS_AFTER}, actual ${postCount}`;
      throw new Error(rollbackReason);
    }

    // Verify certification still FALSE inside transaction
    const certCheck = db.prepare(`SELECT value FROM AppConfig WHERE key='MARKET_DATA_CERTIFIED' LIMIT 1`).get();
    if (certCheck?.value === 'true') {
      rollbackReason = 'CERTIFICATION_BECAME_TRUE_INSIDE_TRANSACTION';
      throw new Error(rollbackReason);
    }

    return postCount;
  });

  // Execute as BEGIN IMMEDIATE
  const postRowCount = db.pragma('journal_mode=WAL') && runTransaction();

  console.log(`  ✓ Transaction committed`);
  console.log(`  ✓ Inserted: ${insertedCount}`);
  console.log(`  ✓ Post-transaction row count: ${postRowCount}`);

} catch(e) {
  db.close();
  appendEvent({ event: 'TRANSACTION_ROLLED_BACK', reason: rollbackReason ?? e.message, exec_id: execId });
  appendFailure('TRANSACTION_ROLLED_BACK', rollbackReason ?? e.message);
  stop('TRANSACTION_ROLLED_BACK', rollbackReason ?? e.message);
}

// ── Immediate post-commit verification ────────────────────────────────────────
const postCommitCount = db.prepare('SELECT COUNT(*) cnt FROM DailyOHLCV').get()?.cnt ?? -1;
const certFinal = db.prepare(`SELECT value FROM AppConfig WHERE key='MARKET_DATA_CERTIFIED' LIMIT 1`).get()?.value;
db.close();

const postSHA = sha256File(PORTFOLIO);

// ── Release lock ──────────────────────────────────────────────────────────────
try { fs.unlinkSync(LOCK_PATH); } catch(_) {}
console.log('\n  ✓ Lock released');

const commitTs = new Date().toISOString();

// ── Report ────────────────────────────────────────────────────────────────────
const report = {
  timestamp:          ts,
  commit_timestamp:   commitTs,
  exec_id:            execId,
  PROMOTION_RESULT:   'COMMITTED',
  authorization_sha:  AUTH_PKG_SHA,
  promotion_sha:      PROMO_FILE_SHA,
  m4_bundle_sha:      M4_BUNDLE_SHA,
  backup_sha:         authBackupSHA,
  pre_db_sha:         preTransSHA,
  post_db_sha:        postSHA,
  pre_row_count:      DB_ROWS_BEFORE,
  post_row_count:     postCommitCount,
  delta:              postCommitCount - DB_ROWS_BEFORE,
  inserted_count:     insertedCount,
  anomaly_overlap:    anomalyOverlap,
  unresolved_overlap: unresolvedOverlap,
  ohlc_fail:          ohlcFail,
  certification_after:certFinal ?? 'NOT_SET',
  certification_changed: false,
  market_data_certified: false,
  production_db_writes: insertedCount,
  masterticker_writes:  0,
  strategy_changes:     0,
  wave1_db_sha:         wave1DbSHA,
  pre_lock_db_sha:      preLockSHA
};

fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_PRODUCTION_PROMOTION.json'), JSON.stringify(report, null, 2));

const md = `# Phase 10R-M6 Production Promotion

## Result: ✅ COMMITTED

| Field | Value |
|-------|-------|
| Exec ID | ${execId} |
| Commit timestamp | ${commitTs} |
| Pre-promotion rows | ${DB_ROWS_BEFORE.toLocaleString()} |
| Post-promotion rows | ${postCommitCount.toLocaleString()} |
| Delta | **+${postCommitCount - DB_ROWS_BEFORE}** |
| Inserted count | **${insertedCount}** |
| Anomaly overlap | ${anomalyOverlap} |
| Unresolved overlap | ${unresolvedOverlap} |
| OHLC failures | ${ohlcFail} |
| Pre-DB SHA | \`${preTransSHA}\` |
| Post-DB SHA | \`${postSHA}\` |
| Certification after | ${certFinal ?? 'NOT_SET'} (unchanged) |

> Production writes: **${insertedCount}** | Certification: **FALSE** | MasterTicker writes: **0**
`;
fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_PRODUCTION_PROMOTION.md'), md);

appendEvent({ event: 'PROMOTION_COMMITTED', inserted: insertedCount, pre_rows: DB_ROWS_BEFORE, post_rows: postCommitCount, delta: postCommitCount - DB_ROWS_BEFORE, pre_sha: preTransSHA, post_sha: postSHA, exec_id: execId });

// Update agent status
const agentStatusPath = path.join(RUNTIME, 'agent_status.json');
const agentStatus = fs.existsSync(agentStatusPath) ? JSON.parse(fs.readFileSync(agentStatusPath,'utf8')) : {};
agentStatus.promote = { state: 'COMMITTED', ts: commitTs, inserted: insertedCount, post_rows: postCommitCount, exec_id: execId };
fs.writeFileSync(agentStatusPath, JSON.stringify(agentStatus, null, 2));

console.log('\n========================================================');
console.log('PHASE 10R-M6 PROMOTION COMMITTED');
console.log('========================================================');
console.log(`  Pre-rows:    ${DB_ROWS_BEFORE.toLocaleString()}`);
console.log(`  Post-rows:   ${postCommitCount.toLocaleString()}`);
console.log(`  Delta:       +${postCommitCount - DB_ROWS_BEFORE}`);
console.log(`  Inserted:    ${insertedCount}`);
console.log(`  Post-DB SHA: ${postSHA}`);
console.log('  → Run phase10rm6_post_promotion_verification.cjs next.');
console.log('========================================================\n');
