#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

async function run() {
  const ROOT = process.cwd();
  const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');

  const inputDesign = path.join(REPORTS_DIR, 'PHASE10RM5X_QUARANTINE_DESIGN.json');
  let design = { quarantine_targets: [] };
  if (fs.existsSync(inputDesign)) {
    design = JSON.parse(fs.readFileSync(inputDesign, 'utf8'));
  }

  const prodDbPath = path.join(ROOT, 'portfolio.db');
  const disposableDbPath = path.join(ROOT, 'portfolio_quarantine_dryrun.db');

  console.log("Backing up portfolio.db safely...");
  const src = new Database(prodDbPath, { readonly: true });
  await src.backup(disposableDbPath);
  src.close();
  console.log("Backup complete.");

  const db = new Database(disposableDbPath);
  db.exec('BEGIN TRANSACTION');

  const report = {
    timestamp: new Date().toISOString(),
    represented: 0,
    rollback_capable: 0,
    unaccounted: 0,
    ambiguous: 0,
    proposed_quarantines: []
  };

  db.exec(`
    CREATE TABLE IF NOT EXISTS QuarantinedDailyOHLCV (
      original_rowid INTEGER,
      symbol TEXT,
      trade_date TEXT,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume REAL,
      quarantine_reason TEXT,
      quarantined_at TEXT
    )
  `);

  const insertQStmt = db.prepare(`
    INSERT INTO QuarantinedDailyOHLCV 
    (original_rowid, symbol, trade_date, open, high, low, close, volume, quarantine_reason, quarantined_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deleteStmt = db.prepare(`DELETE FROM DailyOHLCV WHERE rowid = ?`);
  const selectStmt = db.prepare(`SELECT * FROM DailyOHLCV WHERE rowid = ?`);

  for (const t of design.quarantine_targets) {
    const row = selectStmt.get(t.row_identity);
    if (!row) {
      report.unaccounted++;
      continue;
    }
    
    if (row.symbol !== t.instrument_identity || row.trade_date !== t.date) {
      report.ambiguous++;
      continue;
    }
    
    insertQStmt.run(t.row_identity, row.symbol, row.trade_date, row.open, row.high, row.low, row.close, row.volume, t.evidence, new Date().toISOString());
    deleteStmt.run(t.row_identity);
    
    report.represented++;
    report.rollback_capable++; 
    
    report.proposed_quarantines.push({
      original_row_identity: t.row_identity,
      proposed_action: "DELETE_AND_MOVE_TO_QUARANTINE_TABLE",
      original_values: { open: row.open, high: row.high, low: row.low, close: row.close },
      evidence: t.evidence,
      rollback_identity: t.row_identity,
      rollback_values: { open: row.open, high: row.high, low: row.low, close: row.close },
      affected_indexes: ["DailyOHLCV_symbol", "DailyOHLCV_trade_date"]
    });
  }

  db.exec('ROLLBACK');
  db.close();

  try { fs.unlinkSync(disposableDbPath); } catch(e) {}

  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5X_QUARANTINE_DRY_RUN.json'), JSON.stringify(report, null, 2));

  const md = `# Phase 10R-M.5.x Quarantine Dry Run

- **Represented**: ${report.represented}
- **Rollback Capable**: ${report.rollback_capable}
- **Unaccounted**: ${report.unaccounted}
- **Ambiguous**: ${report.ambiguous}

Dry Run completed successfully. Simulated on a disposable database copy and rolled back. Zero production mutations.
`;

  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5X_QUARANTINE_DRY_RUN.md'), md);
  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5X_PROPOSED_QUARANTINE.jsonl'), report.proposed_quarantines.map(r => JSON.stringify(r)).join('\n') + '\n');

  console.log(`Q2 Quarantine Dry Run completed. Represented: ${report.represented}, Unaccounted: ${report.unaccounted}`);
}

run().catch(console.error);
