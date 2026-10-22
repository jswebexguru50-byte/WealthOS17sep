#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

function getHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function getFileSize(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).size;
}

const report = {
  timestamp: new Date().toISOString(),
  m4_active: false,
  m4_pid: null,
  runtime: null,
  output_file_size: getFileSize(path.join(ROOT, 'reports', 'market-data', 'PHASE10RM4_RECOVERED_CANDLES.jsonl')),
  output_file_hash: getHash(path.join(ROOT, 'reports', 'market-data', 'PHASE10RM4_RECOVERED_CANDLES.jsonl')),
  queue_hash: getHash(path.join(ROOT, 'reports', 'market-data', 'PHASE10RM3_9_REMAINING_COVERAGE_RECOVERY_QUEUE.jsonl')),
  checkpoint_hash: getHash(path.join(ROOT, 'reports', 'market-data', 'PHASE10RM4_RECOVERY_CHECKPOINT.json')),
  request_count: 0,
  success_count: 0,
  failure_count: 0,
  recovery_count: 0
};

// Check if node is running phase10rm4_upstox_targeted_recovery.cjs
try {
  let psOutput = "";
  if (process.platform === 'win32') {
    // We are on Windows, use PowerShell
    psOutput = execSync('powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Select-Object ProcessId, CommandLine"', { encoding: 'utf8' });
  } else {
    psOutput = execSync('ps aux | grep node', { encoding: 'utf8' });
  }

  const lines = psOutput.split('\n');
  for (const line of lines) {
    if (line.includes('phase10rm4_upstox_targeted_recovery.cjs')) {
      report.m4_active = true;
      // Extract PID on Windows (usually the last token on the line)
      const parts = line.trim().split(/\s+/);
      report.m4_pid = parts[parts.length - 1];
    }
  }
} catch(e) {}

// Read Checkpoint
try {
  const chk = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'market-data', 'PHASE10RM4_RECOVERY_CHECKPOINT.json'), 'utf8'));
  report.request_count = chk.total_requests_made || 0;
  report.success_count = chk.successful_recoveries || 0;
  report.failure_count = chk.failed_recoveries || 0;
  report.recovery_count = chk.total_candles_recovered || 0;
  if (chk.start_time) {
    report.runtime = Date.now() - new Date(chk.start_time).getTime();
  }
} catch(e) {}

fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_M4_OBSERVER.json'), JSON.stringify(report, null, 2));
console.log(`M4 Observer completed. M4 Active: ${report.m4_active}, PID: ${report.m4_pid}`);
