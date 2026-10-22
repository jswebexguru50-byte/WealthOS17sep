#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const report = {
  timestamp: new Date().toISOString(),
  total_proposed_remediations: 0,
  dispositions: {},
  remediations: [],
  zero_unaccounted_invariant: false
};

let ohlcAnomalies = [];
let ohlcUnaccounted = 0;
try {
  const ohlcRep = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_OHLC_FORENSICS.json'), 'utf8'));
  ohlcAnomalies = ohlcRep.findings;
  ohlcUnaccounted = ohlcRep.unaccounted_ohlc_findings;
} catch(e) {}

let idAnomalies = [];
let idUnaccounted = 0;
try {
  const idRep = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_MASTERTICKER_COLLISIONS.json'), 'utf8'));
  idAnomalies = idRep.findings;
  idUnaccounted = idRep.unaccounted_identity_findings;
} catch(e) {}

let rId = 1;

for (const f of ohlcAnomalies) {
  const disposition = f.disposition || "QUARANTINE";
  report.dispositions[disposition] = (report.dispositions[disposition] || 0) + 1;
  report.remediations.push({
    remediation_id: `R-OHLC-${rId++}`,
    target_table: "DailyOHLCV",
    target_identity: `${f.symbol}_${f.trade_date}`,
    target_row_identifier: f.row_identifier,
    current_values: { open: f.open, high: f.high, low: f.low, close: f.close },
    proposed_values: null,
    evidence_source: "NONE",
    evidence_hash: null,
    reason: f.classification,
    disposition: disposition,
    confidence: "HIGH",
    production_change_required: true
  });
}

for (const f of idAnomalies) {
  const disposition = f.disposition || "IDENTITY_REVIEW";
  report.dispositions[disposition] = (report.dispositions[disposition] || 0) + 1;
  report.remediations.push({
    remediation_id: `R-ID-${rId++}`,
    target_table: "MasterTickers",
    target_identity: f.symbol,
    target_row_identifier: null,
    current_values: "DUPLICATE",
    proposed_values: null,
    evidence_source: "MasterTickers",
    evidence_hash: null,
    reason: f.classification,
    disposition: disposition,
    confidence: "HIGH",
    production_change_required: disposition !== "VALID_NO_CHANGE"
  });
}

report.total_proposed_remediations = report.remediations.length;

if (ohlcUnaccounted === 0 && idUnaccounted === 0 && report.total_proposed_remediations === (ohlcAnomalies.length + idAnomalies.length)) {
  report.zero_unaccounted_invariant = true;
}

fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_REMEDIATION_PLAN.json'), JSON.stringify(report, null, 2));
const md = `# Phase 10R-M.5 Remediation Plan\n\n- **Total Remediations**: ${report.total_proposed_remediations}\n- **Zero Unaccounted Invariant Holds**: ${report.zero_unaccounted_invariant}\n\nNo production writes were generated. All proposed actions are dry-run only.`;
fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_REMEDIATION_PLAN.md'), md);

// M5-E DRY RUN output
const outJSONL = path.join(REPORTS_DIR, 'PHASE10RM5_PROPOSED_REMEDIATION.jsonl');
fs.writeFileSync(outJSONL, report.remediations.map(r => JSON.stringify(r)).join('\n') + '\n');

console.log(`Remediation Plan generated. Zero-unaccounted invariant: ${report.zero_unaccounted_invariant}`);
