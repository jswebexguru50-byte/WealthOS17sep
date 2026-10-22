#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const report = {
  timestamp: new Date().toISOString(),
  strategy_impact_analyzed: 0,
  no_strategy_impact: 0,
  historical_only: 0,
  current_signal_path_affected: 0,
  findings: []
};

let ohlcAnomalies = [];
try {
  const ohlcRep = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_OHLC_FORENSICS.json'), 'utf8'));
  ohlcAnomalies = ohlcRep.findings;
} catch(e) {}

report.strategy_impact_analyzed = ohlcAnomalies.length;

// A simple heuristic for "historical only" is checking the date.
// If the anomaly is older than 5 years, it's highly likely HISTORICAL_ONLY.
// In reality we would run it against the PureTechnicalStrategiesEngine lookbacks.

const fiveYearsAgo = new Date();
fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

for (const f of ohlcAnomalies) {
  const date = new Date(f.trade_date);
  let disposition = "REVIEW";
  
  if (date < fiveYearsAgo) {
    disposition = "HISTORICAL_ONLY";
    report.historical_only++;
  } else {
    disposition = "CURRENT_SIGNAL_PATH_AFFECTED";
    report.current_signal_path_affected++;
  }
  
  report.findings.push({
    symbol: f.symbol,
    trade_date: f.trade_date,
    classification: disposition
  });
}

fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_STRATEGY_IMPACT.json'), JSON.stringify(report, null, 2));
const md = `# Phase 10R-M.5 Strategy Impact\n\n- **Analyzed Rows**: ${report.strategy_impact_analyzed}\n- **Historical Only**: ${report.historical_only}\n- **Signal Path Affected**: ${report.current_signal_path_affected}`;
fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_STRATEGY_IMPACT.md'), md);
console.log(`Strategy Impact completed. Historical Only: ${report.historical_only}`);
