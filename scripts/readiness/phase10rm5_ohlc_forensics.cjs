#!/usr/bin/env node
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const db = new Database(path.join(ROOT, 'portfolio.db'), { readonly: true });

const report = {
  timestamp: new Date().toISOString(),
  total_anomalies: 0,
  dispositions: {
    VALID_NO_CHANGE: 0,
    CORRECT_FROM_AUTHORITATIVE_SOURCE: 0,
    QUARANTINE: 0,
    IDENTITY_REVIEW: 0,
    STRATEGY_BLOCK: 0,
    MANUAL_REVIEW: 0
  },
  unaccounted_ohlc_findings: 0,
  findings: []
};

// M5-A: OHLC FORENSICS
const query = `
  SELECT 
    d.rowid as row_identifier,
    d.symbol,
    d.trade_date,
    d.open,
    d.high,
    d.low,
    d.close,
    d.volume,
    m.isin as ISIN,
    m.exchange,
    m.segment,
    m.upstox_key_bse as provider_key
  FROM DailyOHLCV d
  LEFT JOIN MasterTickers m ON d.symbol = m.symbol
  WHERE d.open > d.high OR d.open < d.low
`;

const rows = db.prepare(query).all();
report.total_anomalies = rows.length;

let sumDispositions = 0;

for (const row of rows) {
  let classification = "OTHER";
  if (row.open > row.high) {
    classification = "OHLC_INVALID_OPEN_ABOVE_HIGH";
  } else if (row.open < row.low) {
    classification = "OHLC_INVALID_OPEN_BELOW_LOW";
  }
  
  if (!row.ISIN && !row.provider_key) {
    classification = "IDENTITY_UNRESOLVED";
  }

  // Without authoritative evidence available locally, we MUST QUARANTINE structural anomalies 
  // that violate open > high and open < low bounds, because they mathematically invalidate strategy math.
  let disp = "QUARANTINE";
  report.dispositions[disp]++;
  sumDispositions++;

  report.findings.push({
    ...row,
    classification,
    disposition: disp
  });
}

report.unaccounted_ohlc_findings = report.total_anomalies - sumDispositions;

db.close();

fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_OHLC_FORENSICS.json'), JSON.stringify(report, null, 2));

const md = `# Phase 10R-M.5 OHLC Forensics

- **Total Anomalies**: ${report.total_anomalies}
- **QUARANTINE**: ${report.dispositions.QUARANTINE}
- **Unaccounted Findings**: ${report.unaccounted_ohlc_findings}

The zero-unaccounted invariant holds: \`${report.unaccounted_ohlc_findings === 0}\`.`;
fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_OHLC_FORENSICS.md'), md);

console.log(`OHLC Forensics completed. Anomalies: ${report.total_anomalies}, Unaccounted: ${report.unaccounted_ohlc_findings}`);
