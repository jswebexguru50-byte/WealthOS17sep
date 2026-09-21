#!/usr/bin/env node
'use strict';
/**
 * AGENT 2 — PHASE10RM6_PRODUCTION_PREFLIGHT
 * Exhaustive read-only pre-promotion check.
 * Verifies all authorization, source, and DB preconditions.
 * Must pass before any production mutation.
 * NO WRITES to production DB.
 */
const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const ROOT      = process.cwd();
const READINESS = path.join(ROOT, 'reports/readiness');
const ARTIFACT  = path.join(ROOT, 'reports/market-data');
const RUNTIME   = path.join(READINESS, 'runtime/m6');
const PORTFOLIO = path.join(ROOT, 'portfolio.db');

// Authoritative constants — authorization package SHA is the byte-level hash of the
// finalized PHASE10RM6_PRODUCTION_PROMOTION_AUTHORIZATION.json (no self-referential fields).
const AUTH_PKG_SHA     = '41db30e5d03a16af517c15e39cbedf5c1c3627a7fba818092f8b43e384643599';
const PROMO_FILE_SHA   = 'be98c71c876df908399d0be52b37df14449e26357f4156dc658c592e97f5cf05';
const M4_BUNDLE_SHA    = '62a153a49e03815fe53be7b42933b7200c3869f0d4469641da57e183f119ab71';
const EXPECTED_COUNT   = 18244;
const EXPECTED_ROWS_BEFORE = 4135605;

const ts = new Date().toISOString();
const execId = `PREFLIGHT_${Date.now()}`;

console.log(`[AGENT 2] Production preflight — ${execId}\n`);

const checks = [];
const failures = [];

function chk(id, pass, detail, value) {
  const rec = { id, pass, detail, value: value ?? null };
  checks.push(rec);
  failures.push(...(pass ? [] : [`FAIL [${id}]: ${detail}`]));
  console.log(`  ${pass ? '✓' : '✗'} ${id}: ${detail}`);
  return pass;
}

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function safeLoad(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return null; }
}

// ── 1. Authorization package ─────────────────────────────────────────────────
console.log('--- Authorization Package ---');
const AUTH_PKG_PATH = path.join(READINESS, 'PHASE10RM6_PRODUCTION_PROMOTION_AUTHORIZATION.json');
const authExists = fs.existsSync(AUTH_PKG_PATH);
chk('auth_pkg_exists',     authExists,    `Authorization package at ${path.relative(ROOT, AUTH_PKG_PATH)}`);
if (authExists) {
  const actualPkgSHA = sha256(AUTH_PKG_PATH);
  chk('auth_pkg_sha256',   actualPkgSHA === AUTH_PKG_SHA, `Package SHA-256`, { expected: AUTH_PKG_SHA, actual: actualPkgSHA });
  const pkg = safeLoad(AUTH_PKG_PATH);
  chk('auth_authorization', pkg?.AUTHORIZATION === 'PENDING_HUMAN_APPROVAL' || pkg?.AUTHORIZATION === 'APPROVED',
    `Authorization field: ${pkg?.AUTHORIZATION}`);
}

// ── 2. Promotion source ───────────────────────────────────────────────────────
console.log('\n--- Promotion Source ---');
const PROMO_FILE = path.join(ARTIFACT, 'PHASE10RM5Y_PROMOTION_MANIFEST.jsonl');
const promoExists = fs.existsSync(PROMO_FILE);
chk('promo_file_exists',   promoExists, path.relative(ROOT, PROMO_FILE));
if (promoExists) {
  const actualPromoSHA = sha256(PROMO_FILE);
  chk('promo_sha256',      actualPromoSHA === PROMO_FILE_SHA, 'Promotion file SHA', { expected: PROMO_FILE_SHA, actual: actualPromoSHA });
  const lines = fs.readFileSync(PROMO_FILE, 'utf8').split('\n').filter(l => l.trim());
  chk('promo_count',       lines.length === EXPECTED_COUNT, `Record count: ${lines.length}`, lines.length);
}

// ── 3. M4 bundle ─────────────────────────────────────────────────────────────
console.log('\n--- M4 Evidence Bundle ---');
const M4_BUNDLE_PATH = path.join(ARTIFACT, 'M4_EVIDENCE_BUNDLE_MANIFEST.json');
const bundleExists = fs.existsSync(M4_BUNDLE_PATH);
chk('m4_bundle_exists', bundleExists, path.relative(ROOT, M4_BUNDLE_PATH));
if (bundleExists) {
  const bundle = safeLoad(M4_BUNDLE_PATH);
  chk('m4_bundle_sha256', bundle?.compound_sha256 === M4_BUNDLE_SHA,
    'M4 bundle compound SHA', { expected: M4_BUNDLE_SHA, actual: bundle?.compound_sha256 });
  chk('m4_evidence_frozen', bundle?.M4_EVIDENCE_FROZEN === 'PASS', 'M4_EVIDENCE_FROZEN');
}

// ── 4. Current database ───────────────────────────────────────────────────────
console.log('\n--- Database State ---');
const dbExists = fs.existsSync(PORTFOLIO);
chk('db_exists',         dbExists, 'portfolio.db present');
if (dbExists) {
  const pdb = new Database(PORTFOLIO, { readonly: true });

  // Integrity check
  const integrityRow = pdb.prepare('PRAGMA integrity_check').get();
  chk('db_integrity',    integrityRow?.integrity_check === 'ok', `SQLite integrity: ${integrityRow?.integrity_check}`);

  // Row count in target table
  const rowCountRow = pdb.prepare('SELECT COUNT(*) cnt FROM DailyOHLCV').get();
  const rowCount = rowCountRow?.cnt ?? -1;
  chk('db_row_count',    rowCount === EXPECTED_ROWS_BEFORE,
    `DailyOHLCV rows: ${rowCount}`, { expected: EXPECTED_ROWS_BEFORE, actual: rowCount });

  // Certification state
  const appConfig = pdb.prepare(`SELECT value FROM AppConfig WHERE key='MARKET_DATA_CERTIFIED' LIMIT 1`).get();
  const certified = appConfig?.value === 'true' || appConfig?.value === true;
  chk('certification_false', !certified, `MARKET_DATA_CERTIFIED = ${appConfig?.value ?? 'NOT_SET'}`);

  // MasterTicker count sanity
  const mtCount = pdb.prepare('SELECT COUNT(*) cnt FROM MasterTickers').get()?.cnt ?? 0;
  chk('masterticker_count_sane', mtCount > 0, `MasterTickers rows: ${mtCount}`, mtCount);

  // Diagnostic PRAGMAs
  const pageSize = pdb.prepare('PRAGMA page_size').get()?.page_size;
  const pageCount = pdb.prepare('PRAGMA page_count').get()?.page_count;
  const freelistCount = pdb.prepare('PRAGMA freelist_count').get()?.freelist_count;
  const autoVacuum = pdb.prepare('PRAGMA auto_vacuum').get()?.auto_vacuum;
  chk('diagnostic_pragmas', true, `page_size=${pageSize}, page_count=${pageCount}, freelist_count=${freelistCount}, auto_vacuum=${autoVacuum}`, { pageSize, pageCount, freelistCount, autoVacuum });

  // Check for competing writer lock
  const lockPath = path.join(RUNTIME, 'locks/PRODUCTION_PROMOTION.lock');
  if (fs.existsSync(lockPath)) {
    const lock = safeLoad(lockPath);
    const sameProcess = lock?.pid === process.pid;
    chk('no_competing_lock', sameProcess, `Existing lock pid=${lock?.pid}, this pid=${process.pid}`);
  } else {
    chk('no_competing_lock', true, 'No lock file present');
  }

  // ── 5. Canonical key uniqueness in promotion set ──────────────────────────
  console.log('\n--- Canonical Key Uniqueness ---');
  if (promoExists) {
    const lines = fs.readFileSync(PROMO_FILE, 'utf8').split('\n').filter(l => l.trim());
    const keys = new Set();
    let duplicateKeys = 0;
    for (const l of lines) {
      const r = JSON.parse(l);
      const key = `${r.symbol}|${r.trade_date}`;
      if (keys.has(key)) duplicateKeys++;
      keys.add(key);
    }
    chk('canonical_keys_unique', duplicateKeys === 0, `Duplicate canonical keys: ${duplicateKeys}`, duplicateKeys);

    // ── 6. Existing conflict check — batched via temp table ────────────────
    console.log('\n--- Conflict Check (batched) ---');
    // Load all canonical keys from promotion set
    const promoRecords = lines.map(l => JSON.parse(l));
    // Use a temp table join for performance instead of 18k individual queries
    pdb.exec(`CREATE TEMP TABLE IF NOT EXISTS _promo_keys (symbol TEXT, trade_date TEXT)`);
    pdb.exec(`DELETE FROM _promo_keys`);
    const insertKey = pdb.prepare(`INSERT INTO _promo_keys VALUES (?, ?)`);
    const insertMany = pdb.transaction(recs => { for (const r of recs) insertKey.run(r.symbol, r.trade_date); });
    insertMany(promoRecords);

    const conflictRow = pdb.prepare(`
      SELECT COUNT(*) cnt FROM DailyOHLCV d
      INNER JOIN _promo_keys k ON d.symbol = k.symbol AND d.trade_date = k.trade_date
    `).get();
    const conflicts = conflictRow?.cnt ?? 0;
    const newMissing = EXPECTED_COUNT - conflicts;
    chk('no_existing_conflicts', conflicts === 0, `Conflicting rows: ${conflicts}`, conflicts);
    chk('all_new_missing',       newMissing === EXPECTED_COUNT, `New missing rows: ${newMissing}`, newMissing);
  }

  // ── 7. Prior M5 validation gate ───────────────────────────────────────────
  console.log('\n--- M5 Revalidation Gate ---');
  const m5Promo = safeLoad(path.join(READINESS, 'PHASE10RM56_PROMOTION_REVALIDATION.json'));
  if (m5Promo) {
    chk('m5_gate_pass',         m5Promo.gate === 'PASS', `M5 revalidation gate: ${m5Promo.gate}`);
    chk('m5_anomaly_overlap',   m5Promo.counts.ANOMALY_OVERLAP === 0, 'Anomaly overlap = 0');
    chk('m5_identity_fail',     m5Promo.counts.IDENTITY_FAIL === 0,   'Identity fail = 0');
    chk('m5_ohlc_fail',         m5Promo.counts.OHLC_FAIL === 0,       'OHLC fail = 0');
    chk('m5_conflicting',       m5Promo.counts.EXISTING_CONFLICTING_ROW === 0, 'Conflicting rows = 0');
  } else {
    chk('m5_validation_file',   false, 'PHASE10RM56_PROMOTION_REVALIDATION.json missing');
  }

  // ── 8. Cross-gate ─────────────────────────────────────────────────────────
  console.log('\n--- Cross-Gate ---');
  const crossGate = safeLoad(path.join(READINESS, 'PHASE10RM6_CROSS_GATE_RECONCILIATION.json'));
  if (crossGate) {
    chk('cross_gate_pass', crossGate.CROSS_GATE === 'PASS', `Cross-gate: ${crossGate.CROSS_GATE}`);
  } else {
    chk('cross_gate_exists', false, 'PHASE10RM6_CROSS_GATE_RECONCILIATION.json missing');
  }

  pdb.close();
}

// ── Result ───────────────────────────────────────────────────────────────────
const PREFLIGHT_GATE = failures.length === 0 ? 'PASS' : 'BLOCKED';
const passCount = checks.filter(c => c.pass).length;

const report = {
  timestamp:       ts,
  exec_id:         execId,
  PREFLIGHT_GATE,
  total_checks:    checks.length,
  passed:          passCount,
  failed:          failures.length,
  failures,
  production_db_writes: 0,
  certification_changed: false,
  market_data_certified: false,
  checks
};

fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_PRODUCTION_PREFLIGHT.json'), JSON.stringify(report, null, 2));

const badge = PREFLIGHT_GATE === 'PASS' ? '✅' : '❌';
const md = `# Phase 10R-M6 Production Preflight

## Gate: ${badge} ${PREFLIGHT_GATE}

**Checks**: ${passCount}/${checks.length} passed
**Production DB writes**: 0

${failures.length > 0 ? '## Failures\n\n' + failures.map(f => `- ❌ ${f}`).join('\n') : '## All Checks Passed\n\nAll preconditions satisfied. Authorization and backup required before promotion.'}

## Check Results

| Check | Pass | Detail |
|-------|------|--------|
${checks.map(c => `| ${c.id} | ${c.pass ? '✅' : '❌'} | ${c.detail} |`).join('\n')}
`;
fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_PRODUCTION_PREFLIGHT.md'), md);

// Write to runtime events
fs.mkdirSync(RUNTIME, { recursive: true });
const evt = { ts, event: 'PREFLIGHT_COMPLETE', gate: PREFLIGHT_GATE, failures, exec_id: execId };
fs.appendFileSync(path.join(RUNTIME, 'events.jsonl'), JSON.stringify(evt) + '\n');

console.log(`\n  PREFLIGHT_GATE = ${PREFLIGHT_GATE} (${passCount}/${checks.length} checks passed)`);
if (failures.length > 0) {
  failures.forEach(f => console.log(`    ✗ ${f}`));
  process.exit(1);
}
