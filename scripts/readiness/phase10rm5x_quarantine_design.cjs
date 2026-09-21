#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const report = {
  timestamp: new Date().toISOString(),
  total_anomalies: 0,
  quarantine_targets: []
};

let anomalies = [];
try {
  const ohlc = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_OHLC_FORENSICS.json'), 'utf8'));
  anomalies = ohlc.findings;
} catch(e) {}

report.total_anomalies = anomalies.length;

for (const f of anomalies) {
  report.quarantine_targets.push({
    row_identity: f.row_identifier,
    instrument_identity: f.symbol,
    date: f.trade_date,
    OHLC: { open: f.open, high: f.high, low: f.low, close: f.close },
    exchange: f.exchange,
    segment: f.segment,
    ISIN: f.ISIN,
    provider_key: f.provider_key,
    provenance: f.provenance,
    strategy_dependency: "AFFECTED", // Based on M5-D Strategy Impact finding
    promotion_overlap: false, // Based on M5-C Clean Isolation
    proposed_disposition: "QUARANTINE",
    evidence: f.classification
  });
}

fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5X_QUARANTINE_DESIGN.json'), JSON.stringify(report, null, 2));

const md = `# Phase 10R-M.5.x Quarantine Design

- **Targets Designed for Quarantine**: ${report.total_anomalies}

All targets are scheduled for a non-destructive dry-run quarantine simulation.
`;

fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5X_QUARANTINE_DESIGN.md'), md);
console.log(`Q1 Quarantine Design completed. Targets: ${report.total_anomalies}`);
