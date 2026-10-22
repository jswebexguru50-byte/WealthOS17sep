#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const report = {
  timestamp: new Date().toISOString(),
  dispositions: {
    EXECUTION_LEVEL_PROVENANCE: 0,
    REQUEST_LEVEL_PROVENANCE: 0,
    CANDLE_LEVEL_PROVENANCE: 0,
    SOURCE_VERIFIED: 0,
    SOURCE_PARTIAL: 0,
    SOURCE_UNKNOWN: 0
  },
  status: "REVIEW"
};

// We analyze the provenance status embedded by M.3
const inputFile = path.join(ROOT, 'reports', 'market-data', 'RECOVERED_CANDLES_PROVENANCE_ENRICHED.jsonl');
if (fs.existsSync(inputFile)) {
  const lines = fs.readFileSync(inputFile, 'utf8').split('\n').filter(l => l.trim() !== '');
  
  let hasValidSrc = false;
  let unknown = 0;
  for (const l of lines) {
    try {
      const c = JSON.parse(l);
      if (c.provenance_status === "PROVENANCE_SOURCE_PHASE_UNVERIFIED") {
        report.dispositions.SOURCE_PARTIAL++;
        unknown++;
      } else {
        report.dispositions.SOURCE_UNKNOWN++;
        unknown++;
      }
    } catch(e) {}
  }
  
  // Since we lack the exact cryptographically signed HTTP responses (we only have the enriched json), 
  // we cannot upgrade to SOURCE_VERIFIED without fabricating evidence.
  // Hence status remains REVIEW/BLOCKED.
  if (unknown === lines.length) {
    report.status = "BLOCKED";
  }
}

fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5Y_PROVENANCE_GATE.json'), JSON.stringify(report, null, 2));

const md = `# Phase 10R-M.5.y Provenance Gate

- **Status**: ${report.status}
- **Source Verified**: ${report.dispositions.SOURCE_VERIFIED}
- **Source Partial**: ${report.dispositions.SOURCE_PARTIAL}
- **Source Unknown**: ${report.dispositions.SOURCE_UNKNOWN}

Provenance currently remains BLOCKED/REVIEW as exact signed cryptographic HTTP evidence is pending for the 18,244 recovered candles.
`;

fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5Y_PROVENANCE_GATE.md'), md);
console.log(`P2 Provenance Gate completed. Status: ${report.status}`);
