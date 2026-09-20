const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../../');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');

function reportProgress(msg, progress = null) {
  if (parentPort) parentPort.postMessage({ type: 'progress', phase: 'Phase 4', message: msg, progress });
}

function run() {
  reportProgress('Initializing Phase 4: REAL DailyOHLCV Structural Audit...', 0);
  
  const dbPath = path.join(ROOT, 'portfolio.db');
  let db;
  let totalRows = 0;
  
  const stats = {
    total_scanned: 0,
    valid: 0,
    invalid: 0,
    missing_dates: 0,
    negative_values: 0,
    high_low_violation: 0
  };

  try {
    db = new Database(dbPath, { readonly: true });
    
    reportProgress('Counting total existing rows...', 10);
    totalRows = db.prepare("SELECT COUNT(*) as c FROM DailyOHLCV").get().c;
    stats.total_scanned = totalRows;

    reportProgress('Running deterministic structural audit (Negatives)...', 30);
    const negs = db.prepare(`SELECT symbol, trade_date, 'NEGATIVE_VALUE' as reason FROM DailyOHLCV WHERE open < 0 OR high < 0 OR low < 0 OR close < 0 OR volume < 0`).all();
    stats.negative_values = negs.length;

    reportProgress('Running deterministic structural audit (H/L Violations)...', 50);
    const hl = db.prepare(`SELECT symbol, trade_date, 'HIGH_LOW_VIOLATION' as reason FROM DailyOHLCV WHERE low > high OR open < low OR open > high OR close < low OR close > high`).all();
    stats.high_low_violation = hl.length;

    reportProgress('Running deterministic structural audit (Nulls)...', 70);
    const nulls = db.prepare(`SELECT symbol, trade_date, 'MISSING_ESSENTIAL_FIELD' as reason FROM DailyOHLCV WHERE symbol IS NULL OR trade_date IS NULL`).all();
    stats.missing_dates = nulls.length;

    const allInvalid = [...negs, ...hl, ...nulls];
    stats.invalid = allInvalid.length;
    stats.valid = stats.total_scanned - stats.invalid;

    fs.writeFileSync(path.join(REPORTS_DIR, 'STRUCTURAL_EXCEPTIONS.json'), JSON.stringify(allInvalid, null, 2));

  } catch(e) {
    reportProgress('Query failed: ' + e.message);
  }

  reportProgress('Generating DAILYOHLCV_STRUCTURAL_AUDIT.json...', 95);
  
  fs.writeFileSync(path.join(REPORTS_DIR, 'DAILYOHLCV_STRUCTURAL_AUDIT.json'), JSON.stringify({
    auditMode: "REAL",
    total_scanned: stats.total_scanned,
    structurally_valid: stats.valid,
    structurally_invalid: stats.invalid,
    violations: {
      negative_values: stats.negative_values,
      high_low_violation: stats.high_low_violation,
      missing_essential_fields: stats.missing_dates
    }
  }, null, 2));

  if (db) db.close();
  reportProgress('Phase 4 Complete.', 100);
  if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 4' });
}

run();
