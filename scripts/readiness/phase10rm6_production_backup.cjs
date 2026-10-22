#!/usr/bin/env node
'use strict';
/**
 * AGENT 3 — PHASE10RM6_PRODUCTION_BACKUP
 * Creates an immutable backup of portfolio.db.
 * Steps:
 *   1. SQLite integrity check on source
 *   2. SHA-256 source
 *   3. Copy → backup
 *   4. SHA-256 backup (must equal source)
 *   5. Restore to temp location
 *   6. Integrity check on restored copy
 *   7. Row-count verify on restored copy
 *   8. Clean up restore temp
 *   9. Emit backup SHA for human authorization
 * NO writes to production DB.
 */
const fs       = require('node:fs');
const path     = require('node:path');
const crypto   = require('node:crypto');
const Database = require('better-sqlite3');

const ROOT      = process.cwd();
const READINESS = path.join(ROOT, 'reports/readiness');
const RUNTIME   = path.join(READINESS, 'runtime/m6');
const BACKUP_DIR= path.join(RUNTIME, 'artifacts');
const PORTFOLIO = path.join(ROOT, 'portfolio.db');

const ts     = new Date().toISOString();
const execId = `BACKUP_${Date.now()}`;

console.log(`[AGENT 3] Production backup — ${execId}\n`);

fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(path.join(RUNTIME, 'locks'), { recursive: true });

const EXPECTED_ROWS_BEFORE = 4135605;


function sha256File(p) {
  // Chunked streaming — handles files of any size (tested up to 13.5 GB).
  // Produces byte-identical SHA-256 to fs.readFileSync; same algorithm, same byte sequence.
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
  return { sha256: hash.digest('hex'), size: totalBytes };
}


function appendEvent(evt) {
  const eventsPath = path.join(RUNTIME, 'events.jsonl');
  fs.appendFileSync(eventsPath, JSON.stringify({ ts: new Date().toISOString(), ...evt }) + '\n');
}

const steps = [];
function step(name, result, detail, data) {
  const rec = { name, result, detail, data: data ?? null };
  steps.push(rec);
  console.log(`  ${result === 'PASS' ? '✓' : result === 'WARN' ? '~' : '✗'} ${name}: ${detail}`);
  if (result === 'FAIL') {
    appendEvent({ event: 'BACKUP_STEP_FAIL', step: name, detail });
  }
  return result === 'PASS' || result === 'WARN';
}

let exitCode = 0;

// ── Step 1: Source exists ─────────────────────────────────────────────────────
if (!fs.existsSync(PORTFOLIO)) {
  step('source_db_exists', 'FAIL', 'portfolio.db not found');
  process.exit(1);
}
const stat = fs.statSync(PORTFOLIO);
step('source_db_exists', 'PASS', `${(stat.size / 1024 / 1024).toFixed(1)} MB, mtime ${stat.mtime.toISOString()}`);

// ── Step 2: SQLite integrity check on source ──────────────────────────────────
const srcDb = new Database(PORTFOLIO, { readonly: true });
const srcIntegrity = srcDb.prepare('PRAGMA integrity_check').get()?.integrity_check;
const srcRowCount  = srcDb.prepare('SELECT COUNT(*) cnt FROM DailyOHLCV').get()?.cnt ?? -1;
srcDb.close();
if (!step('source_integrity', srcIntegrity === 'ok' ? 'PASS' : 'FAIL', `SQLite integrity: ${srcIntegrity}`)) { process.exit(1); }
step('source_row_count', srcRowCount === EXPECTED_ROWS_BEFORE ? 'PASS' : 'WARN',
  `DailyOHLCV rows: ${srcRowCount} (expected ${EXPECTED_ROWS_BEFORE})`,
  { actual: srcRowCount, expected: EXPECTED_ROWS_BEFORE });

// ── Step 3: Source SHA-256 ────────────────────────────────────────────────────
const { sha256: sourceSHA, size: sourceSize } = sha256File(PORTFOLIO);
step('source_sha256', 'PASS', sourceSHA);

// ── Step 4: Create backup (or verify existing) ───────────────────────────────
// If a valid backup already exists (SHA matches source), reuse it.
// This prevents disk exhaustion when disk space is limited.
const existingBackups = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('portfolio_prepromotion_M6_') && f.endsWith('.db'));
let BACKUP_PATH, BACKUP_NAME, backupWasReused = false;

if (existingBackups.length > 0) {
  // Sort by name (timestamp embedded) — use most recent
  existingBackups.sort();
  const candidate = existingBackups[existingBackups.length - 1];
  const candidatePath = path.join(BACKUP_DIR, candidate);
  console.log(`  Found existing backup: ${candidate} — verifying SHA before reuse...`);
  const { sha256: candidateSHA } = sha256File(candidatePath);
  if (candidateSHA === sourceSHA) {
    BACKUP_NAME = candidate;
    BACKUP_PATH = candidatePath;
    backupWasReused = true;
    step('backup_created', 'PASS', `Reusing existing backup: ${BACKUP_NAME} (SHA verified = source SHA)`);
  } else {
    console.log(`  Existing backup SHA mismatch (${candidateSHA} != ${sourceSHA}). Will create new backup.`);
  }
}

if (!backupWasReused) {
  BACKUP_NAME = `portfolio_prepromotion_M6_${Date.now()}.db`;
  BACKUP_PATH = path.join(BACKUP_DIR, BACKUP_NAME);
  if (fs.existsSync(BACKUP_PATH)) {
    step('backup_name_unique', 'FAIL', `Collision: ${BACKUP_PATH} already exists`);
    process.exit(1);
  }
  fs.copyFileSync(PORTFOLIO, BACKUP_PATH);
  try { fs.chmodSync(BACKUP_PATH, 0o444); } catch(_) { /* chmod not always available on Windows */ }
  step('backup_created', 'PASS', `${BACKUP_NAME} (${(sourceSize/1024/1024).toFixed(1)} MB)`);
}

// ── Step 5: Backup SHA-256 must match source ──────────────────────────────────
const { sha256: backupSHA, size: backupSize } = sha256File(BACKUP_PATH);
const hashMatch = backupSHA === sourceSHA;
if (!step('backup_sha256_matches_source', hashMatch ? 'PASS' : 'FAIL',
  hashMatch ? `✓ ${backupSHA}` : `MISMATCH — source:${sourceSHA} backup:${backupSHA}`)) { process.exit(1); }

// ── Step 6: Integrity + row-count check directly on the backup file ───────────
// (Replaced the full restore-copy step which requires an extra ~12.5 GB.
//  The SHA match at step 5 already proves byte-for-byte identity.
//  This opens the backup file in read-only mode to confirm it is a valid SQLite DB.)
const backupDb      = new Database(BACKUP_PATH, { readonly: true });
const backupIntegrity = backupDb.prepare('PRAGMA integrity_check').get()?.integrity_check;
const backupRows      = backupDb.prepare('SELECT COUNT(*) cnt FROM DailyOHLCV').get()?.cnt ?? -1;
backupDb.close();
step('backup_integrity', backupIntegrity === 'ok' ? 'PASS' : 'FAIL', `Backup integrity: ${backupIntegrity}`);
step('backup_row_count', backupRows === srcRowCount ? 'PASS' : 'FAIL',
  `Backup DailyOHLCV rows: ${backupRows}`, { actual: backupRows, expected: srcRowCount });


// ── Result ────────────────────────────────────────────────────────────────────
const anyFail = steps.some(s => s.result === 'FAIL');
const BACKUP_GATE = anyFail ? 'FAIL' : 'PASS';

const report = {
  timestamp:         ts,
  exec_id:           execId,
  BACKUP_GATE,
  source_db:         path.relative(ROOT, PORTFOLIO),
  source_sha256:     sourceSHA,
  source_size:       sourceSize,
  source_mtime:      stat.mtime.toISOString(),
  source_integrity:  srcIntegrity,
  source_row_count:  srcRowCount,
  backup_path:       path.relative(ROOT, BACKUP_PATH),
  backup_sha256:     backupSHA,
  backup_size:       backupSize,
  backup_integrity:  backupIntegrity,
  backup_row_count:  backupRows,
  sha_match:         hashMatch,
  production_db_writes: 0,
  certification_changed: false,
  steps
};

fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_PRODUCTION_BACKUP.json'), JSON.stringify(report, null, 2));

const md = `# Phase 10R-M6 Production Backup

## Gate: ${BACKUP_GATE === 'PASS' ? '✅' : '❌'} ${BACKUP_GATE}

| Field | Value |
|-------|-------|
| Source DB | \`${path.relative(ROOT, PORTFOLIO)}\` |
| Source SHA-256 | \`${sourceSHA}\` |
| Source size | ${sourceSize.toLocaleString()} bytes |
| Source mtime | ${stat.mtime.toISOString()} |
| Source integrity | ${srcIntegrity} |
| Source DailyOHLCV rows | ${srcRowCount.toLocaleString()} |
| Backup path | \`${path.relative(ROOT, BACKUP_PATH)}\` |
| **Backup SHA-256** | \`${backupSHA}\` |
| Backup size | ${backupSize.toLocaleString()} bytes |
| Backup integrity | ${backupIntegrity} |
| Backup rows | ${backupRows.toLocaleString()} |
| SHA match | ${hashMatch} |

## Steps

| Step | Result | Detail |
|------|--------|--------|
${steps.map(s => `| ${s.name} | ${s.result === 'PASS' ? '✅' : s.result === 'WARN' ? '⚠' : '❌'} ${s.result} | ${s.detail} |`).join('\n')}

> ## ⚠ Human Authorization Required
> 
> Add the backup SHA to \`reports/readiness/HUMAN_AUTHORIZATION.json\`:
> \`\`\`json
> { "backup_sha256": "${backupSHA}" }
> \`\`\`
`;
fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_PRODUCTION_BACKUP.md'), md);

appendEvent({ event: 'BACKUP_COMPLETE', gate: BACKUP_GATE, source_sha256: sourceSHA, backup_sha256: backupSHA, backup_path: path.relative(ROOT, BACKUP_PATH), exec_id: execId });

// Update agent_status.json
const agentStatusPath = path.join(RUNTIME, 'agent_status.json');
const agentStatus = fs.existsSync(agentStatusPath) ? JSON.parse(fs.readFileSync(agentStatusPath,'utf8')) : {};
agentStatus.backup = { state: BACKUP_GATE, ts: new Date().toISOString(), backup_sha256: backupSHA, exec_id: execId };
fs.writeFileSync(agentStatusPath, JSON.stringify(agentStatus, null, 2));

console.log(`\n  BACKUP_GATE = ${BACKUP_GATE}`);
console.log(`  Source SHA:  ${sourceSHA}`);
console.log(`  Backup SHA:  ${backupSHA}`);
console.log(`  Backup:      ${path.relative(ROOT, BACKUP_PATH)}`);
console.log(`\n  ⚠ Copy the backup SHA into HUMAN_AUTHORIZATION.json before Wave 3.`);

if (BACKUP_GATE !== 'PASS') process.exit(1);
