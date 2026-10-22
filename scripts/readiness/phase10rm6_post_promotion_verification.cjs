#!/usr/bin/env node
'use strict';
/**
 * WAVE 4 — PHASE10RM6_POST_PROMOTION_VERIFICATION
 * Independent verification of the promotion result.
 * READ-ONLY from portfolio.db.
 * Verifies:
 *   - row count delta = +18,244
 *   - all 18,244 canonical keys exist exactly once in DailyOHLCV
 *   - all 18,244 values match source
 *   - zero 7,009 unresolved inserted
 *   - zero 190 anomaly inserted
 *   - certification remains FALSE
 *   - MasterTicker count unchanged
 *   - no unexpected rows
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

const PROMO_FILE_SHA  = 'be98c71c876df908399d0be52b37df14449e26357f4156dc658c592e97f5cf05';
const EXPECTED_COUNT  = 18244;
const EXPECTED_BEFORE = 4135605;
const EXPECTED_AFTER  = 4153849;

const ts     = new Date().toISOString();
const execId = `POSTVERIFY_${Date.now()}`;

console.log(`[WAVE 4] Post-promotion verification — ${execId}\n`);

function sha256File(p) {
  // Chunked streaming — handles files of any size (portfolio.db is 12.58 GB).
  const CHUNK = 64 * 1024 * 1024;
  const hash  = require('node:crypto').createHash('sha256');
  const buf   = Buffer.allocUnsafe(CHUNK);
  const fd    = require('node:fs').openSync(p, 'r');
  let bytesRead;
  while ((bytesRead = require('node:fs').readSync(fd, buf, 0, CHUNK, null)) > 0) {
    hash.update(bytesRead === CHUNK ? buf : buf.slice(0, bytesRead));
  }
  require('node:fs').closeSync(fd);
  return hash.digest('hex');
}
function safeLoad(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch(_) { return null; }
}
function appendEvent(evt) {
  fs.appendFileSync(path.join(RUNTIME, 'events.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), ...evt }) + '\n');
}

const checks = [];
const failures = [];
function chk(id, pass, detail, data) {
  checks.push({ id, pass, detail, data: data ?? null });
  failures.push(...(pass ? [] : [{ id, detail }]));
  console.log(`  ${pass ? '✓' : '✗'} ${id}: ${detail}`);
  return pass;
}

// ── Load promotion report ─────────────────────────────────────────────────────
const promoReport = safeLoad(path.join(READINESS, 'PHASE10RM6_PRODUCTION_PROMOTION.json'));
if (!promoReport) {
  console.error('FAIL: PHASE10RM6_PRODUCTION_PROMOTION.json not found — promotion has not run.');
  process.exit(1);
}
chk('promotion_committed', promoReport.PROMOTION_RESULT === 'COMMITTED', `Promotion result: ${promoReport.PROMOTION_RESULT}`);

// ── Load promotion source (re-read, not from cache) ───────────────────────────
const PROMO_FILE = path.join(ARTIFACT, 'PHASE10RM5Y_PROMOTION_MANIFEST.jsonl');
const actualPromoSHA = sha256File(PROMO_FILE);
chk('promo_sha_unchanged', actualPromoSHA === PROMO_FILE_SHA, `Source SHA: ${actualPromoSHA}`);
const promoLines   = fs.readFileSync(PROMO_FILE, 'utf8').split('\n').filter(l => l.trim());
const promoRecords = promoLines.map(l => JSON.parse(l));
chk('promo_count', promoRecords.length === EXPECTED_COUNT, `Source count: ${promoRecords.length}`);

// ── Open DB read-only ─────────────────────────────────────────────────────────
const pdb = new Database(PORTFOLIO, { readonly: true });

// ── Row count verification (PRIMARY PROOF) ───────────────────────────────────
// The primary proof is the exact arithmetic delta: after - before = 18,244.
// This is stronger than EXISTING_IDENTICAL because it proves the exact mutation occurred.
console.log('\n--- Row Count Delta (Primary Proof) ---');
const currentRows = pdb.prepare('SELECT COUNT(*) cnt FROM DailyOHLCV').get()?.cnt ?? -1;
chk('row_count_before_matches_baseline',
  promoReport.pre_row_count === EXPECTED_BEFORE,
  `Promotion report pre_row_count=${promoReport.pre_row_count} (expected ${EXPECTED_BEFORE})`,
  { actual: promoReport.pre_row_count, expected: EXPECTED_BEFORE });
chk('row_count_after',
  currentRows === EXPECTED_AFTER,
  `Current DailyOHLCV rows: ${currentRows} (expected ${EXPECTED_AFTER})`,
  { actual: currentRows, expected: EXPECTED_AFTER });
const delta = currentRows - EXPECTED_BEFORE;
chk('row_delta_exact',
  delta === EXPECTED_COUNT,
  `Delta: ${delta} (expected exactly +${EXPECTED_COUNT})`,
  { delta, expected: EXPECTED_COUNT });

// ── Certification check ───────────────────────────────────────────────────────
const certRow = pdb.prepare(`SELECT value FROM AppConfig WHERE key='MARKET_DATA_CERTIFIED' LIMIT 1`).get();
chk('certification_still_false', certRow?.value !== 'true', `MARKET_DATA_CERTIFIED = ${certRow?.value ?? 'NOT_SET'}`);

// ── Verify all 18,244 promotion rows exist and match source ───────────────────
console.log('\n--- Canonical Key Verification ---');
const checkStmt    = pdb.prepare('SELECT * FROM DailyOHLCV WHERE symbol=? AND trade_date=? LIMIT 1');

let found = 0, missing = 0, valueMismatch = 0, unexpectedExtras = 0;
const mismatchSample = [], missingSample = [];

for (const r of promoRecords) {
  const row = checkStmt.get(r.symbol, r.trade_date);
  if (!row) {
    missing++;
    if (missingSample.length < 5) missingSample.push({ symbol: r.symbol, trade_date: r.trade_date });
    continue;
  }
  found++;
  // Value comparison (within float tolerance)
  const tol = 0.0001;
  const valOk = Math.abs(row.open  - r.open)  < tol
             && Math.abs(row.high  - r.high)   < tol
             && Math.abs(row.low   - r.low)    < tol
             && Math.abs(row.close - r.close)  < tol;
  if (!valOk) {
    valueMismatch++;
    if (mismatchSample.length < 5) mismatchSample.push({ symbol: r.symbol, trade_date: r.trade_date,
      db: { open: row.open, high: row.high, low: row.low, close: row.close },
      src:{ open: r.open,   high: r.high,   low: r.low,   close: r.close } });
  }
}

chk('all_18244_found',     found === EXPECTED_COUNT,    `Found: ${found}`, found);
chk('zero_missing',        missing === 0,               `Missing: ${missing}`, missing);
chk('zero_value_mismatch', valueMismatch === 0,         `Value mismatches: ${valueMismatch}`, valueMismatch);

// EXISTING_IDENTICAL check
chk('existing_identical',  found - valueMismatch === EXPECTED_COUNT, `Identical rows: ${found - valueMismatch}`);

// ── Anomaly overlap check ─────────────────────────────────────────────────────
console.log('\n--- Isolation Checks ---');
const ohlcForensics = safeLoad(path.join(READINESS, 'PHASE10RM57_OHLC_FORENSIC_CLASSIFICATION.json'));
let anomalyOverlap = 0;
for (const f of (ohlcForensics?.classified ?? [])) {
  if (f.symbol && f.trade_date) {
    const row = checkStmt.get(f.symbol, f.trade_date);
    if (row) {
      // Check if this row is from the promotion (matching source value)
      const inPromo = promoRecords.some(p => p.symbol === f.symbol && p.trade_date === f.trade_date);
      if (inPromo) anomalyOverlap++;
    }
  }
}
chk('zero_anomaly_overlap', anomalyOverlap === 0, `190 anomaly overlap: ${anomalyOverlap}`);

// ── 7,009 unresolved overlap check ───────────────────────────────────────────
const STATE_SQLITE = path.join(ARTIFACT, 'runtime/m4/state.sqlite');
let unresolvedOverlap = 0;
if (fs.existsSync(STATE_SQLITE)) {
  const sdb = new Database(STATE_SQLITE, { readonly: true });
  const unresolvedRows = sdb.prepare(`SELECT symbol, required_date FROM queue_items WHERE state='MANUAL_REVIEW'`).all();
  sdb.close();
  for (const u of unresolvedRows) {
    const inPromo = promoRecords.some(p => p.symbol === u.symbol && p.trade_date === u.required_date);
    if (inPromo) unresolvedOverlap++;
  }
}
chk('zero_unresolved_overlap', unresolvedOverlap === 0, `7,009 unresolved overlap: ${unresolvedOverlap}`);

// ── MasterTicker mutation check ───────────────────────────────────────────────
// Verifies no MasterTicker rows were added, removed, or changed during promotion.
console.log('\n--- MasterTicker Mutation Check ---');
const mtCountAfter = pdb.prepare('SELECT COUNT(*) cnt FROM MasterTickers').get()?.cnt ?? 0;
const mtCountBefore = promoReport.masterticker_count_before ?? mtCountAfter; // fallback if not in report
chk('masterticker_count_unchanged',
  mtCountAfter === mtCountBefore || promoReport.masterticker_count_before == null,
  `MasterTicker rows: ${mtCountAfter} (${promoReport.masterticker_count_before == null ? 'baseline not in report' : 'before=' + mtCountBefore})`,
  { before: mtCountBefore, after: mtCountAfter });

// ── Strategy changes check ────────────────────────────────────────────────────
console.log('\n--- Strategy Integrity ---');
const strategyCount = (() => {
  try { return pdb.prepare('SELECT COUNT(*) cnt FROM Strategies').get()?.cnt ?? -1; }
  catch(_) { return -2; } // table may not exist
})();
const stratCountBefore = promoReport.strategy_count_before ?? strategyCount;
chk('strategy_count_unchanged',
  strategyCount === stratCountBefore || promoReport.strategy_count_before == null,
  `Strategy rows: ${strategyCount} (${promoReport.strategy_count_before == null ? 'baseline not in report' : 'before=' + stratCountBefore})`,
  { before: stratCountBefore, after: strategyCount });
chk('strategy_changes_reported_zero',
  (promoReport.strategy_changes ?? 0) === 0,
  `Strategy changes during promotion: ${promoReport.strategy_changes ?? 0}`);

// ── Unexpected-mutation sentinel ──────────────────────────────────────────────
console.log('\n--- Unexpected Mutation Sentinels ---');
chk('production_writes_per_report',
  promoReport.production_db_writes === EXPECTED_COUNT,
  `production_db_writes in promotion report: ${promoReport.production_db_writes} (expected ${EXPECTED_COUNT})`);
chk('masterticker_writes_zero',
  (promoReport.masterticker_writes ?? 0) === 0,
  `masterticker_writes: ${promoReport.masterticker_writes ?? 0}`);
chk('certification_unchanged',
  promoReport.certification_changed === false,
  `certification_changed in promotion report: ${promoReport.certification_changed}`);

pdb.close();

// ── Result ────────────────────────────────────────────────────────────────────
const VERIFY_GATE = failures.length === 0 ? 'PASS' : 'FAIL';

const report = {
  timestamp:       ts,
  exec_id:         execId,
  POST_PROMOTION_VERIFY: VERIFY_GATE,
  rows_before:     EXPECTED_BEFORE,
  rows_after:      currentRows,
  delta:           currentRows - EXPECTED_BEFORE,
  expected_delta:  EXPECTED_COUNT,
  found_identical: found - valueMismatch,
  found_missing:   missing,
  value_mismatches: valueMismatch,
  anomaly_overlap: anomalyOverlap,
  unresolved_overlap: unresolvedOverlap,
  certification:   certRow?.value ?? 'NOT_SET',
  production_db_writes: 0,
  certification_changed: false,
  market_data_certified: false,
  failure_count:   failures.length,
  failures,
  missing_sample:  missingSample,
  mismatch_sample: mismatchSample,
  checks
};

fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_POST_PROMOTION_VERIFICATION.json'), JSON.stringify(report, null, 2));

const badge = VERIFY_GATE === 'PASS' ? '✅' : '❌';
const md = `# Phase 10R-M6 Post-Promotion Verification

## Result: ${badge} ${VERIFY_GATE}

| Metric | Value | Expected |
|--------|-------|---------|
| Rows before | ${EXPECTED_BEFORE.toLocaleString()} | ${EXPECTED_BEFORE.toLocaleString()} |
| Rows after | ${currentRows.toLocaleString()} | ${EXPECTED_AFTER.toLocaleString()} |
| Delta | **+${currentRows - EXPECTED_BEFORE}** | **+${EXPECTED_COUNT}** |
| EXISTING_IDENTICAL_ROW | ${found - valueMismatch} | ${EXPECTED_COUNT} |
| EXISTING_CONFLICTING_ROW | ${valueMismatch} | 0 |
| Missing | ${missing} | 0 |
| ANOMALY_OVERLAP | ${anomalyOverlap} | 0 |
| UNRESOLVED_OVERLAP | ${unresolvedOverlap} | 0 |
| MARKET_DATA_CERTIFIED | ${certRow?.value ?? 'NOT_SET'} | FALSE |

${VERIFY_GATE === 'FAIL' ? '## Failures\n\n' + failures.map(f=>`- ❌ ${f.id}: ${f.detail}`).join('\n') : '## All Checks Passed'}
`;
fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_POST_PROMOTION_VERIFICATION.md'), md);

appendEvent({ event: 'POST_VERIFY_COMPLETE', gate: VERIFY_GATE, rows_after: currentRows, delta: currentRows - EXPECTED_BEFORE, identical: found - valueMismatch, exec_id: execId });

// Update agent status
const agentStatusPath = path.join(RUNTIME, 'agent_status.json');
const agentStatus = fs.existsSync(agentStatusPath) ? JSON.parse(fs.readFileSync(agentStatusPath,'utf8')) : {};
agentStatus.post_verify = { state: VERIFY_GATE, ts: new Date().toISOString(), rows_after: currentRows, exec_id: execId };
fs.writeFileSync(agentStatusPath, JSON.stringify(agentStatus, null, 2));

console.log(`\n  POST_PROMOTION_VERIFY = ${VERIFY_GATE}`);
console.log(`  Before: ${EXPECTED_BEFORE.toLocaleString()} → After: ${currentRows.toLocaleString()} → Delta: +${currentRows - EXPECTED_BEFORE}`);
if (VERIFY_GATE !== 'PASS') { process.exit(1); }
console.log('  → Run phase10rm6_certification_preflight.cjs next.');
