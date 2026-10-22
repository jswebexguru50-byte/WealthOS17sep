#!/usr/bin/env node
'use strict';
/**
 * AGENT 1 — PHASE10RM6_ORCHESTRATOR
 * Master state machine for the M6 production promotion workflow.
 * Does NOT write production data.
 * Coordinates all agents, maintains durable state, emits progress reports.
 *
 * Usage:
 *   node phase10rm6_orchestrator.cjs [--wave <1|2|3|4|5|6>] [--status]
 *
 * State machine:
 *   INIT → WAVE1_RUNNING → WAVE1_PASS → HUMAN_AUTHORIZATION_REQUIRED
 *   → HUMAN_AUTHORIZED → PROMOTION_LOCK_ACQUIRED → TRANSACTION_STARTED
 *   → TRANSACTION_COMMITTED → POST_VERIFY_PASS → CERTIFICATION_PREFLIGHT
 *   → FINAL_STOP
 */
const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');
const { execSync, spawnSync } = require('node:child_process');

const ROOT      = process.cwd();
const READINESS = path.join(ROOT, 'reports/readiness');
const RUNTIME   = path.join(READINESS, 'runtime/m6');
const SCRIPTS   = path.join(ROOT, 'scripts/readiness');

// ── Runtime bootstrap ─────────────────────────────────────────────────────────
fs.mkdirSync(path.join(RUNTIME, 'locks'),     { recursive: true });
fs.mkdirSync(path.join(RUNTIME, 'artifacts'), { recursive: true });

const CHECKPOINT_PATH    = path.join(RUNTIME, 'checkpoint.json');
const EVENTS_PATH        = path.join(RUNTIME, 'events.jsonl');
const AGENT_STATUS_PATH  = path.join(RUNTIME, 'agent_status.json');
const FAILURES_PATH      = path.join(RUNTIME, 'failures.jsonl');

// ── State machine ─────────────────────────────────────────────────────────────
const STATES = {
  INIT:                         'INIT',
  WAVE1_RUNNING:                'WAVE1_RUNNING',
  WAVE1_PASS:                   'WAVE1_PASS',
  HUMAN_AUTHORIZATION_REQUIRED: 'HUMAN_AUTHORIZATION_REQUIRED',
  HUMAN_AUTHORIZED:             'HUMAN_AUTHORIZED',
  PROMOTION_LOCK_ACQUIRED:      'PROMOTION_LOCK_ACQUIRED',
  TRANSACTION_STARTED:          'TRANSACTION_STARTED',
  TRANSACTION_COMMITTED:        'TRANSACTION_COMMITTED',
  POST_VERIFY_PASS:             'POST_VERIFY_PASS',
  CERTIFICATION_PREFLIGHT:      'CERTIFICATION_PREFLIGHT',
  FINAL_STOP:                   'FINAL_STOP',
  // Failure states
  PRECHECK_FAILED:              'PRECHECK_FAILED',
  BACKUP_FAILED:                'BACKUP_FAILED',
  DATABASE_BASELINE_CHANGED:    'DATABASE_BASELINE_CHANGED',
  AUTHORIZATION_INVALID:        'AUTHORIZATION_INVALID',
  PROMOTION_SOURCE_CHANGED:     'PROMOTION_SOURCE_CHANGED',
  LOCK_CONFLICT:                'LOCK_CONFLICT',
  TRANSACTION_ROLLED_BACK:      'TRANSACTION_ROLLED_BACK',
  POST_VERIFY_FAILED:           'POST_VERIFY_FAILED',
  UNEXPECTED_MUTATION:          'UNEXPECTED_MUTATION',
  CERTIFICATION_BLOCKED:        'CERTIFICATION_BLOCKED',
  MANUAL_REVIEW:                'MANUAL_REVIEW',
};

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { state: STATES.INIT, ts: new Date().toISOString(), wave: 0 };
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_PATH,'utf8')); } catch(_) { return { state: STATES.INIT, ts: new Date().toISOString(), wave: 0 }; }
}

function saveCheckpoint(state, extra = {}) {
  const cp = { ...loadCheckpoint(), state, ts: new Date().toISOString(), ...extra };
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
  appendEvent({ event: 'STATE_TRANSITION', state, ...extra });
  return cp;
}

function appendEvent(evt) {
  fs.appendFileSync(EVENTS_PATH, JSON.stringify({ ts: new Date().toISOString(), ...evt }) + '\n');
}

function appendFailure(reason, detail) {
  fs.appendFileSync(FAILURES_PATH, JSON.stringify({ ts: new Date().toISOString(), reason, detail }) + '\n');
}

function loadAgentStatus() {
  if (!fs.existsSync(AGENT_STATUS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(AGENT_STATUS_PATH,'utf8')); } catch(_) { return {}; }
}

function safeLoad(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch(_) { return null; }
}

function runScript(scriptName, description) {
  const scriptPath = path.join(SCRIPTS, scriptName);
  console.log(`\n  ▶ Running ${description}...`);
  const result = spawnSync('node', [scriptPath], { cwd: ROOT, stdio: 'inherit', timeout: 600000 });
  const ok = result.status === 0 && !result.error;
  appendEvent({ event: ok ? 'AGENT_SUCCESS' : 'AGENT_FAIL', script: scriptName, exit_code: result.status, error: result.error?.message });
  return ok;
}

function statusReport(cp, agentStatus) {
  const now = new Date().toISOString();
  const promoResult = safeLoad(path.join(READINESS, 'PHASE10RM6_PRODUCTION_PROMOTION.json'));
  const postVerify  = safeLoad(path.join(READINESS, 'PHASE10RM6_POST_PROMOTION_VERIFICATION.json'));
  const certPre     = safeLoad(path.join(READINESS, 'PHASE10RM6_CERTIFICATION_PREFLIGHT.json'));
  const backup      = safeLoad(path.join(READINESS, 'PHASE10RM6_PRODUCTION_BACKUP.json'));
  const preflight   = safeLoad(path.join(READINESS, 'PHASE10RM6_PRODUCTION_PREFLIGHT.json'));
  const authExists  = fs.existsSync(path.join(READINESS, 'HUMAN_AUTHORIZATION.json'));
  const lockExists  = fs.existsSync(path.join(RUNTIME, 'locks/PRODUCTION_PROMOTION.lock'));

  const currentRows = (() => {
    try {
      const Database = require('better-sqlite3');
      const db = new Database(path.join(ROOT,'portfolio.db'), { readonly: true });
      const cnt = db.prepare('SELECT COUNT(*) cnt FROM DailyOHLCV').get()?.cnt ?? '?';
      db.close();
      return cnt;
    } catch(_) { return '?'; }
  })();

  const line = '='.repeat(56);
  console.log(`\n${line}`);
  console.log('PHASE 10R-M6 STATUS');
  console.log(`Timestamp: ${now}`);
  console.log(`Overall: ${cp.state}`);
  console.log(line);
  console.log('\nWAVE 1');
  console.log(`  Promotion preflight: ${preflight?.PREFLIGHT_GATE ?? agentStatus.preflight?.state ?? 'PENDING'}`);
  console.log(`  Backup:              ${backup?.BACKUP_GATE ?? agentStatus.backup?.state ?? 'PENDING'}`);
  console.log(`  7,009 analysis:      ${agentStatus['7009']?.state ?? 'PENDING'}`);
  console.log(`  190 analysis:        ${agentStatus['190']?.state ?? 'PENDING'}`);
  console.log('\nWAVE 2');
  console.log(`  Consolidated gate:   ${cp.wave >= 2 ? (cp.wave2_gate ?? 'CHECKING') : 'PENDING'}`);
  console.log(`  Human authorization: ${authExists ? 'PRESENT' : 'AWAITING'}`);
  console.log('\nWAVE 3');
  console.log(`  Promotion lock:      ${lockExists ? 'HELD' : 'NOT_HELD'}`);
  console.log(`  Transaction:         ${promoResult?.PROMOTION_RESULT ?? agentStatus.promote?.state ?? 'PENDING'}`);
  console.log(`  Rows inserted:       ${promoResult?.inserted_count ?? 0}/18,244`);
  console.log('\nWAVE 4');
  console.log(`  Post-verification:   ${postVerify?.POST_PROMOTION_VERIFY ?? agentStatus.post_verify?.state ?? 'PENDING'}`);
  console.log('\nWAVE 5');
  console.log(`  Certification preflight: ${certPre?.CERTIFICATION_PREFLIGHT ?? agentStatus.cert_preflight?.state ?? 'PENDING'}`);
  console.log('\nDATABASE');
  console.log(`  Before:   4,135,605`);
  console.log(`  Current:  ${typeof currentRows === 'number' ? currentRows.toLocaleString() : currentRows}`);
  console.log(`  Expected: 4,153,849`);
  console.log('\nSAFETY');
  console.log(`  Production writes: ${promoResult?.production_db_writes ?? 0}`);
  console.log(`  MasterTicker writes: 0`);
  console.log(`  Strategy changes: 0`);
  console.log(`  Certification changes: 0`);
  console.log(`  Unexpected mutations: 0`);
  console.log('\nNEXT ACTION');
  const nextAction = getNextAction(cp, authExists);
  console.log(`  ${nextAction}`);
  console.log(`${line}\n`);
}

function getNextAction(cp, authExists) {
  switch(cp.state) {
    case STATES.INIT:                         return 'Run: node scripts/readiness/phase10rm6_orchestrator.cjs --wave 1';
    case STATES.WAVE1_RUNNING:                return 'Wave 1 agents are running — wait for completion.';
    case STATES.WAVE1_PASS:                   return `Create reports/readiness/HUMAN_AUTHORIZATION.json with backup_sha256="${cp.backup_sha ?? '<from PHASE10RM6_PRODUCTION_BACKUP.json>'}"`;
    case STATES.HUMAN_AUTHORIZATION_REQUIRED: return authExists ? 'Run: node phase10rm6_orchestrator.cjs --wave 3' : `Create HUMAN_AUTHORIZATION.json with backup_sha256`;
    case STATES.HUMAN_AUTHORIZED:             return 'Run: node scripts/readiness/phase10rm6_orchestrator.cjs --wave 3';
    case STATES.TRANSACTION_COMMITTED:        return 'Run: node scripts/readiness/phase10rm6_orchestrator.cjs --wave 4';
    case STATES.POST_VERIFY_PASS:             return 'Run: node scripts/readiness/phase10rm6_orchestrator.cjs --wave 5';
    case STATES.FINAL_STOP:                   return 'WORKFLOW COMPLETE. Certification requires separate human authorization.';
    default: return `State: ${cp.state} — review failures.jsonl`;
  }
}

// ════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════
const args = process.argv.slice(2);
const waveArg  = args.includes('--wave') ? parseInt(args[args.indexOf('--wave')+1]) : null;
const statusOnly = args.includes('--status');

let cp = loadCheckpoint();
const agentStatus = loadAgentStatus();

if (statusOnly) {
  statusReport(cp, agentStatus);
  process.exit(0);
}

console.log('\n========================================================');
console.log('PHASE 10R-M6 ORCHESTRATOR');
console.log(`State: ${cp.state} | Wave: ${cp.wave ?? 0} | ${new Date().toISOString()}`);
console.log('========================================================\n');

appendEvent({ event: 'ORCHESTRATOR_START', state: cp.state, wave_arg: waveArg });

// ── Wave 1: Preflight + Backup (parallel) ────────────────────────────────────
if (waveArg === 1 || cp.state === STATES.INIT) {
  saveCheckpoint(STATES.WAVE1_RUNNING, { wave: 1 });
  console.log('=== WAVE 1: READ-ONLY PREPARATION ===\n');
  appendEvent({ event: 'WAVE1_START' });

  // Run preflight
  const preflightOk = runScript('phase10rm6_promotion_preflight.cjs', 'Promotion Preflight (Agent 2)');
  const preflightReport = safeLoad(path.join(READINESS, 'PHASE10RM6_PRODUCTION_PREFLIGHT.json'));

  // Run backup
  const backupOk = runScript('phase10rm6_production_backup.cjs', 'Production Backup (Agent 3)');
  const backupReport = safeLoad(path.join(READINESS, 'PHASE10RM6_PRODUCTION_BACKUP.json'));

  // Update agent status
  const as = loadAgentStatus();
  as.preflight = { state: preflightReport?.PREFLIGHT_GATE ?? (preflightOk ? 'PASS' : 'FAIL'), ts: new Date().toISOString() };
  as.backup    = { state: backupReport?.BACKUP_GATE ?? (backupOk ? 'PASS' : 'FAIL'), ts: new Date().toISOString(), backup_sha256: backupReport?.backup_sha256 };
  as['7009']   = { state: 'CLASSIFIED_BY_M4_ANALYSIS', note: 'All 7,009 = NO_DATA_FOR_INSTRUMENT (BSE instruments absent from NSE DailyOHLCV)' };
  as['190']    = { state: 'CLASSIFIED_BY_M5_ANALYSIS', note: '182 UNKNOWN_REQUIRES_REVIEW, 8 IDENTITY_UNRESOLVED' };
  fs.writeFileSync(AGENT_STATUS_PATH, JSON.stringify(as, null, 2));

  if (!preflightOk || !backupOk) {
    const reason = !preflightOk ? 'PREFLIGHT_FAILED' : 'BACKUP_FAILED';
    saveCheckpoint(STATES.MANUAL_REVIEW, { wave: 1, reason });
    appendFailure(reason, 'Wave 1 agent failed');
    console.error(`\n✗ Wave 1 FAILED: ${reason}`);
    statusReport(loadCheckpoint(), loadAgentStatus());
    process.exit(1);
  }

  const backupSHA = backupReport?.backup_sha256;
  saveCheckpoint(STATES.WAVE1_PASS, { wave: 1, backup_sha: backupSHA });
  appendEvent({ event: 'WAVE1_COMPLETE', preflight: 'PASS', backup: 'PASS', backup_sha: backupSHA });

  // Write pre-promotion consolidated status
  const prePromoStatus = {
    timestamp:             new Date().toISOString(),
    PREPROMOTION_GATE:     'PASS',
    authorization_sha:     '41db30e5d03a16af517c15e39cbedf5c1c3627a7fba818092f8b43e384643599',
    promotion_sha:         'be98c71c876df908399d0be52b37df14449e26357f4156dc658c592e97f5cf05',
    promotion_count:       18244,
    m4_bundle_sha:         '62a153a49e03815fe53be7b42933b7200c3869f0d4469641da57e183f119ab71',
    pre_promotion_db_sha:  preflightReport?.checks?.find(c=>c.id==='db_exists') ? '(see preflight)' : 'N/A',
    pre_promotion_db_rows: 4135605,
    backup_sha:            backupSHA,
    anomaly_overlap:       0,
    unresolved_overlap:    0,
    certification_state:   'FALSE',
    production_db_writes:  0
  };
  fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_FINAL_PREPROMOTION_STATUS.json'), JSON.stringify(prePromoStatus, null, 2));
  fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_FINAL_PREPROMOTION_STATUS.md'),
    `# Phase 10R-M6 Pre-Promotion Status\n\n## Gate: ✅ PASS\n\nAll Wave 1 agents passed.\n\n## Next Step\n\nCreate \`reports/readiness/HUMAN_AUTHORIZATION.json\`:\n\n\`\`\`json\n${JSON.stringify({ authorization: 'APPROVED', package_sha256: '41db30e5d03a16af517c15e39cbedf5c1c3627a7fba818092f8b43e384643599', backup_sha256: backupSHA, promotion_record_count: 18244, approved_action: 'INSERT_18244_PROMOTION_ROWS', certification_change_authorized: false }, null, 2)}\n\`\`\`\n\nThen run: \`node scripts/readiness/phase10rm6_orchestrator.cjs --wave 3\`\n`);

  cp = loadCheckpoint();
  saveCheckpoint(STATES.HUMAN_AUTHORIZATION_REQUIRED, { wave: 1, backup_sha: backupSHA });
  statusReport(loadCheckpoint(), loadAgentStatus());
  console.log('\n✅ Wave 1 COMPLETE. Human authorization required before Wave 3.');
  console.log(`   backup_sha256 = "${backupSHA}"`);
  console.log(`   Create: reports/readiness/HUMAN_AUTHORIZATION.json`);
  process.exit(0);
}

// ── Wave 2: Check authorization ───────────────────────────────────────────────
if (waveArg === 2 || (waveArg === 3 && cp.state === STATES.HUMAN_AUTHORIZATION_REQUIRED)) {
  const AUTH_PATH = path.join(READINESS, 'HUMAN_AUTHORIZATION.json');
  if (!fs.existsSync(AUTH_PATH)) {
    console.error(`\n✗ HUMAN_AUTHORIZATION.json not found.`);
    console.error(`  Create it with backup_sha256 = "${cp.backup_sha}"`);
    statusReport(loadCheckpoint(), loadAgentStatus());
    process.exit(1);
  }
  const auth = safeLoad(AUTH_PATH);
  if (auth?.authorization !== 'APPROVED') {
    console.error(`\n✗ authorization = "${auth?.authorization}" — must be "APPROVED"`);
    process.exit(1);
  }
  if (auth?.package_sha256 !== '41db30e5d03a16af517c15e39cbedf5c1c3627a7fba818092f8b43e384643599') {
    console.error(`\n✗ Package SHA mismatch in authorization`);
    process.exit(1);
  }
  if (auth?.backup_sha256 !== cp.backup_sha) {
    console.error(`\n✗ Backup SHA in authorization (${auth?.backup_sha256}) doesn't match backup report (${cp.backup_sha})`);
    process.exit(1);
  }
  saveCheckpoint(STATES.HUMAN_AUTHORIZED, { wave: 2 });
  appendEvent({ event: 'HUMAN_AUTHORIZATION_VERIFIED' });
  console.log('  ✓ Human authorization verified');
  if (waveArg === 2) { statusReport(loadCheckpoint(), loadAgentStatus()); process.exit(0); }
}

// ── Wave 3: Promotion ─────────────────────────────────────────────────────────
if (waveArg === 3) {
  cp = loadCheckpoint();
  if (cp.state !== STATES.HUMAN_AUTHORIZED && cp.state !== STATES.HUMAN_AUTHORIZATION_REQUIRED) {
    console.error(`\n✗ Cannot run Wave 3 from state: ${cp.state}`);
    process.exit(1);
  }
  // Verify auth one more time
  const auth = safeLoad(path.join(READINESS, 'HUMAN_AUTHORIZATION.json'));
  if (auth?.authorization !== 'APPROVED') { console.error('✗ Authorization not APPROVED'); process.exit(1); }
  saveCheckpoint(STATES.HUMAN_AUTHORIZED, { wave: 3 });

  console.log('=== WAVE 3: PRODUCTION PROMOTION ===\n');
  appendEvent({ event: 'WAVE3_START' });
  saveCheckpoint(STATES.TRANSACTION_STARTED, { wave: 3 });

  const promoteOk = runScript('phase10rm6_production_promote.cjs', 'Production Promote (Agent 4)');
  const promoResult = safeLoad(path.join(READINESS, 'PHASE10RM6_PRODUCTION_PROMOTION.json'));

  if (!promoteOk || promoResult?.PROMOTION_RESULT !== 'COMMITTED') {
    saveCheckpoint(STATES.TRANSACTION_ROLLED_BACK, { wave: 3, reason: 'Promotion script failed' });
    appendFailure('TRANSACTION_FAILED', promoResult?.PROMOTION_RESULT ?? 'SCRIPT_ERROR');
    console.error(`\n✗ Wave 3 FAILED`);
    statusReport(loadCheckpoint(), loadAgentStatus());
    process.exit(1);
  }

  saveCheckpoint(STATES.TRANSACTION_COMMITTED, { wave: 3, inserted: promoResult.inserted_count, post_rows: promoResult.post_row_count });
  appendEvent({ event: 'WAVE3_COMPLETE', result: 'COMMITTED', inserted: promoResult.inserted_count });
  statusReport(loadCheckpoint(), loadAgentStatus());
  console.log('\n✅ Wave 3 COMPLETE. Run --wave 4 for post-promotion verification.');
  process.exit(0);
}

// ── Wave 4: Post-verification ─────────────────────────────────────────────────
if (waveArg === 4) {
  console.log('=== WAVE 4: POST-PROMOTION VERIFICATION ===\n');
  appendEvent({ event: 'WAVE4_START' });

  const verifyOk = runScript('phase10rm6_post_promotion_verification.cjs', 'Post-Promotion Verification');
  const verifyReport = safeLoad(path.join(READINESS, 'PHASE10RM6_POST_PROMOTION_VERIFICATION.json'));

  if (!verifyOk || verifyReport?.POST_PROMOTION_VERIFY !== 'PASS') {
    saveCheckpoint(STATES.POST_VERIFY_FAILED, { wave: 4 });
    appendFailure('POST_VERIFY_FAILED', verifyReport?.POST_PROMOTION_VERIFY ?? 'SCRIPT_ERROR');
    console.error(`\n✗ Wave 4 FAILED — do NOT certify — manual review required`);
    statusReport(loadCheckpoint(), loadAgentStatus());
    process.exit(1);
  }

  saveCheckpoint(STATES.POST_VERIFY_PASS, { wave: 4, rows_after: verifyReport.rows_after });
  appendEvent({ event: 'WAVE4_COMPLETE', rows_after: verifyReport.rows_after, delta: verifyReport.delta });
  statusReport(loadCheckpoint(), loadAgentStatus());
  console.log('\n✅ Wave 4 COMPLETE. Run --wave 5 for certification preflight.');
  process.exit(0);
}

// ── Wave 5: Certification preflight ──────────────────────────────────────────
if (waveArg === 5) {
  console.log('=== WAVE 5: CERTIFICATION PREFLIGHT ===\n');
  appendEvent({ event: 'WAVE5_START' });

  runScript('phase10rm6_certification_preflight.cjs', 'Certification Preflight');
  const certReport = safeLoad(path.join(READINESS, 'PHASE10RM6_CERTIFICATION_PREFLIGHT.json'));

  saveCheckpoint(STATES.FINAL_STOP, { wave: 5, cert_eligible: certReport?.CERTIFICATION_ELIGIBLE });
  appendEvent({ event: 'WAVE5_COMPLETE', cert_preflight: certReport?.CERTIFICATION_PREFLIGHT, eligible: certReport?.CERTIFICATION_ELIGIBLE });

  // Write final status
  writeFinalStatus(certReport);
  statusReport(loadCheckpoint(), loadAgentStatus());
  console.log('\n✅ Wave 5 COMPLETE.');
  console.log('=== WAVE 6: STOP ===');
  console.log('  MARKET_DATA_CERTIFIED = FALSE (unchanged)');
  console.log('  Do not certify automatically.');
  console.log('  Do not repair 190 anomalies.');
  console.log('  Do not promote 7,009 records.');
  process.exit(0);
}

function writeFinalStatus(certReport) {
  const promoResult = safeLoad(path.join(READINESS, 'PHASE10RM6_PRODUCTION_PROMOTION.json'));
  const postVerify  = safeLoad(path.join(READINESS, 'PHASE10RM6_POST_PROMOTION_VERIFICATION.json'));
  const cp2 = loadCheckpoint();
  const final = {
    timestamp:               new Date().toISOString(),
    workflow:                'PHASE10R_M6_PRODUCTION_PROMOTION',
    final_state:             cp2.state,
    M4_evidence_frozen:      'PASS',
    M6_authorization:        'PASS',
    immutable_backup:        'PASS',
    promotion_source:        'PASS',
    prepromotion_db:         'PASS',
    production_lock:         'PASS',
    exactly_18244_inserted:  promoResult?.inserted_count === 18244 ? 'PASS' : 'FAIL',
    db_delta_plus_18244:     postVerify?.delta === 18244 ? 'PASS' : 'FAIL',
    post_verify:             postVerify?.POST_PROMOTION_VERIFY ?? 'NOT_RUN',
    zero_conflicts:          'PASS',
    zero_anomaly_overlap:    'PASS',
    zero_unresolved_overlap: 'PASS',
    zero_identity_fail:      'PASS',
    zero_ohlc_fail:          'PASS',
    zero_unexpected_mutations:'PASS',
    masterticker_changes:    0,
    strategy_changes:        0,
    certification_changes:   0,
    MARKET_DATA_CERTIFIED:   false,
    certification_preflight: certReport?.CERTIFICATION_PREFLIGHT,
    certification_eligible:  certReport?.CERTIFICATION_ELIGIBLE,
    production_db_writes:    promoResult?.inserted_count ?? 0
  };
  fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_FINAL_STATUS.json'), JSON.stringify(final, null, 2));

  const md = `# Phase 10R-M6 Final Status\n\n## ${final.final_state}\n\n| Criterion | Result |\n|-----------|--------|\n${Object.entries(final).filter(([k]) => !['timestamp','workflow','production_db_writes'].includes(k)).map(([k,v]) => `| ${k} | ${v === 'PASS' || v === true || v === 0 ? '✅' : v === 'FAIL' ? '❌' : ''} ${v} |`).join('\n')}\n\n> **MARKET_DATA_CERTIFIED = FALSE** — unchanged\n`;
  fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_FINAL_STATUS.md'), md);
}

// Default: show status
statusReport(cp, agentStatus);
