const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../../');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');
const ACQUISITION_DIR = path.join(ROOT, 'evidence/market-data-certification/acquisition');
const DB_PATH = path.join(ROOT, 'portfolio_staging.db');

function reportProgress(msg, progress = null) {
  if (parentPort) parentPort.postMessage({ type: 'progress', phase: 'Phase 13', message: msg, progress });
}

function run() {
  reportProgress('Initializing Phase 13: Conflict Reconciliation...', 0);
  
  const phase7Path = path.join(REPORTS_DIR, 'DELTA_ACQUISITION_QUEUE.json');
  const phase9Path = path.join(REPORTS_DIR, 'ACQUISITION_APPROVAL_PACKAGE.json');
  const phase10Path = path.join(REPORTS_DIR, 'PHASE10_ACQUISITION_MANIFEST.json');
  const phase11Path = path.join(ACQUISITION_DIR, 'PHASE11_VALIDATION_REPORT.json');
  
  if (!fs.existsSync(phase7Path) || !fs.existsSync(phase10Path) || !fs.existsSync(phase11Path) || !fs.existsSync(DB_PATH)) {
    reportProgress('Failed: Missing required evidence files or staging DB.', 100);
    if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 13', result: 'FAILED' });
    return;
  }

  const phase7 = JSON.parse(fs.readFileSync(phase7Path, 'utf8'));
  const phase10 = JSON.parse(fs.readFileSync(phase10Path, 'utf8'));
  const phase11 = JSON.parse(fs.readFileSync(phase11Path, 'utf8'));
  
  reportProgress('Reconciling execution chain...', 30);
  
  const approvedRows = phase7.length;
  const acquiredRows = phase10.deltasAcquired;
  const validatedRows = phase11.validatedRows;
  
  const db = new Database(DB_PATH, { fileMustExist: true });
  const stagedRows = db.prepare('SELECT COUNT(*) as count FROM Staging_DailyOHLCV').get().count;
  
  let match = true;
  if (approvedRows !== acquiredRows || acquiredRows !== validatedRows || validatedRows !== stagedRows) {
    match = false;
  }
  
  const report = {
    phase: "13",
    status: match ? "PASS" : "FAIL",
    reconciliation: {
      approvedDeltaQueueRows: approvedRows,
      acquiredManifestRows: acquiredRows,
      validatedReportRows: validatedRows,
      stagedDatabaseRows: stagedRows
    },
    message: match ? "approved == acquired == validated == staged" : "Discrepancy detected in execution chain."
  };

  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE13_RECONCILIATION_REPORT.json'), JSON.stringify(report, null, 2));

  db.close();

  if (match) {
    reportProgress('Phase 13 Complete: Independent Reconciliation PASS.', 100);
    if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 13', result: 'PASS' });
  } else {
    reportProgress('Phase 13 Complete: Reconciliation FAILED.', 100);
    if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 13', result: 'FAILED' });
  }
}

run();
