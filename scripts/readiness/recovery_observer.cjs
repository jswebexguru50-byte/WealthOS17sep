#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');
const AGENT_DIR = path.join(REPORTS_DIR, 'agents');
const M4_DIR = path.join(ROOT, 'reports', 'market-data');

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
if (!fs.existsSync(AGENT_DIR)) fs.mkdirSync(AGENT_DIR, { recursive: true });

const startTime = new Date().toISOString();
const report = {
  agent_id: "A6_RECOVERY_OBSERVER",
  status: "RUNNING",
  started_at: startTime,
  completed_at: null,
  files_changed: [],
  files_created: [],
  tests_run: 0,
  tests_passed: 0,
  tests_failed: 0,
  production_db_writes: 0,
  certification_changed: false,
  blockers: [],
  warnings: [],
  next_action: "COMPLETED"
};

function computeHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const cpFile = path.join(M4_DIR, 'PHASE10RM4_RECOVERY_CHECKPOINT.json');
const qFile = path.join(M4_DIR, 'PHASE10RM3_9_REMAINING_COVERAGE_RECOVERY_QUEUE.jsonl');

const state = {
  timestamp: new Date().toISOString(),
  phase: "10R-M.4",
  process_status: "UNKNOWN",
  queue_hash: computeHash(qFile),
  checkpoint_hash: computeHash(cpFile),
  checkpoint_age_ms: fs.existsSync(cpFile) ? (Date.now() - fs.statSync(cpFile).mtimeMs) : -1,
  data: null
};

report.tests_run++;
if (fs.existsSync(cpFile)) {
  try {
    state.data = JSON.parse(fs.readFileSync(cpFile, 'utf8'));
    state.process_status = state.checkpoint_age_ms > 120000 ? "PROCESS_STOPPED_OR_IDLE" : "ACTIVE";
    report.tests_passed++;
  } catch (e) {
    state.process_status = "OUTPUT_CORRUPTION";
    report.blockers.push("M.4 Checkpoint is corrupted");
    report.tests_failed++;
  }
} else {
  state.process_status = "NOT_STARTED";
  report.tests_passed++;
}

fs.writeFileSync(path.join(REPORTS_DIR, 'RECOVERY_OBSERVER.json'), JSON.stringify(state, null, 2));

report.status = "DONE";
report.completed_at = new Date().toISOString();

fs.writeFileSync(path.join(AGENT_DIR, 'A6_RECOVERY_OBSERVER.json'), JSON.stringify(report, null, 2));
console.log("A6 Recovery Observer updated.");
