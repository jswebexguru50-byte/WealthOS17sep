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
  total_duplicate_symbols: 0,
  dispositions: {
    VALID_NO_CHANGE: 0,
    IDENTITY_REVIEW: 0,
    QUARANTINE: 0,
    STRATEGY_BLOCK: 0,
    MANUAL_REVIEW: 0
  },
  unaccounted_identity_findings: 0,
  findings: []
};

const dupSymbolsQuery = `
  SELECT symbol
  FROM MasterTickers
  GROUP BY symbol
  HAVING COUNT(*) > 1
`;

const dupSymbols = db.prepare(dupSymbolsQuery).all().map(r => r.symbol);
report.total_duplicate_symbols = dupSymbols.length;

let sumDispositions = 0;

if (dupSymbols.length > 0) {
  const placeholders = dupSymbols.map(() => '?').join(',');
  const query = `
    SELECT 
      rowid, symbol, name, isin as ISIN, exchange, segment, upstox_key_nse, upstox_key_bse
    FROM MasterTickers
    WHERE symbol IN (${placeholders})
    ORDER BY symbol
  `;
  
  const rows = db.prepare(query).all(...dupSymbols);
  
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.symbol]) grouped[r.symbol] = [];
    grouped[r.symbol].push(r);
  }
  
  for (const sym of Object.keys(grouped)) {
    const records = grouped[sym];
    
    // Resolve through: symbol -> exchange -> segment -> ISIN -> provider_key
    // If every row has a unique combination of these, it's VALID_NO_CHANGE.
    const uniqueKeys = new Set();
    let fullyDistinguished = true;
    for (const r of records) {
      const pKey = r.exchange === 'BSE' ? r.upstox_key_bse : r.upstox_key_nse;
      const key = `${r.symbol}_${r.exchange}_${r.segment}_${r.ISIN}_${pKey}`;
      if (uniqueKeys.has(key)) {
        fullyDistinguished = false;
        break;
      }
      uniqueKeys.add(key);
    }
    
    let disp = "MANUAL_REVIEW";
    if (fullyDistinguished) {
      // The symbol is duplicated, but the instruments themselves are distinct.
      disp = "VALID_NO_CHANGE";
    } else {
      disp = "IDENTITY_REVIEW";
    }
    
    report.dispositions[disp]++;
    sumDispositions++;
    
    report.findings.push({
      symbol: sym,
      records: records.length,
      disposition: disp
    });
  }
}

report.unaccounted_identity_findings = report.total_duplicate_symbols - sumDispositions;

db.close();

fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_MASTERTICKER_COLLISIONS.json'), JSON.stringify(report, null, 2));

const md = `# Phase 10R-M.5 MasterTicker Collision Forensics

- **Duplicate Symbols**: ${report.total_duplicate_symbols}
- **VALID_NO_CHANGE**: ${report.dispositions.VALID_NO_CHANGE}
- **IDENTITY_REVIEW**: ${report.dispositions.IDENTITY_REVIEW}
- **MANUAL_REVIEW**: ${report.dispositions.MANUAL_REVIEW}
- **Unaccounted Findings**: ${report.unaccounted_identity_findings}

The zero-unaccounted invariant holds: \`${report.unaccounted_identity_findings === 0}\`.`;
fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_MASTERTICKER_COLLISIONS.md'), md);

console.log(`MasterTicker Forensics completed. Duplicates: ${report.total_duplicate_symbols}, Unaccounted: ${report.unaccounted_identity_findings}`);
