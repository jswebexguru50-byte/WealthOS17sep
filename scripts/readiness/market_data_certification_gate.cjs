#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');
const AGENT_DIR = path.join(REPORTS_DIR, 'agents');

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
if (!fs.existsSync(AGENT_DIR)) fs.mkdirSync(AGENT_DIR, { recursive: true });

const startTime = new Date().toISOString();
const report = {
  agent_id: "A3_MARKET_DATA_GATE",
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

const gate = {
  timestamp: startTime,
  market_data_recovery_status: "IN_PROGRESS",
  market_data_coverage_status: "INCOMPLETE",
  provenance_status: "REVIEW", // Pending PROVENANCE_SOURCE_PHASE_UNVERIFIED
  promotion_status: "BLOCKED", // Cannot promote until phase completes
  market_data_certified: false, // NEVER SET TO TRUE AUTOMATICALLY
  blockers: []
};

// Check Recovery Observer
try {
  const obs = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'RECOVERY_OBSERVER.json'), 'utf8'));
  if (obs.process_status === 'ACTIVE') {
    gate.blockers.push("Phase 10R-M.4 recovery is actively running in background.");
  } else {
    gate.market_data_recovery_status = "PENDING_RECONCILIATION";
  }
} catch (e) {}

fs.writeFileSync(path.join(REPORTS_DIR, 'MARKET_DATA_CERTIFICATION_GATE.json'), JSON.stringify(gate, null, 2));
const md = `# Market Data Certification Gate\n\n**Certified**: ${gate.market_data_certified}\n\n- Recovery Status: ${gate.market_data_recovery_status}\n- Coverage Status: ${gate.market_data_coverage_status}\n- Provenance: ${gate.provenance_status}\n- Promotion: ${gate.promotion_status}\n\n## Blockers\n` + gate.blockers.map(b => `- ${b}`).join('\n');
fs.writeFileSync(path.join(REPORTS_DIR, 'MARKET_DATA_CERTIFICATION_GATE.md'), md);

report.files_created.push('reports/readiness/MARKET_DATA_CERTIFICATION_GATE.json', 'reports/readiness/MARKET_DATA_CERTIFICATION_GATE.md');
report.status = "DONE";
report.completed_at = new Date().toISOString();
fs.writeFileSync(path.join(AGENT_DIR, 'A3_MARKET_DATA_GATE.json'), JSON.stringify(report, null, 2));
console.log("A3 Market Data Gate completed.");
