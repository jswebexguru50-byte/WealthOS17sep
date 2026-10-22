const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../../');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');
const STAGING_DB_PATH = path.join(ROOT, 'portfolio_staging.db');

function run() {
  const queue = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'DELTA_ACQUISITION_QUEUE.json'), 'utf8'));
  const acquired = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence/market-data-certification/acquisition/ACQUIRED_RAW_DATA.json'), 'utf8'));
  const validated = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence/market-data-certification/acquisition/VALIDATED_DATA.json'), 'utf8'));
  
  const db = new Database(STAGING_DB_PATH, {readonly: true});
  const stagedCount = db.prepare('SELECT COUNT(*) as c FROM Staging_DailyOHLCV').get().c;
  db.close();
  
  const deltaRequestedRows = queue.reduce((sum, task) => sum + task.missingSessions, 0);

  const phase10 = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'PHASE10_ACQUISITION_MANIFEST.json')));
  
  const reconciliation = {
    deltaRequested: deltaRequestedRows,
    deltaAcquired: acquired.length,
    deltaValidated: validated.length,
    deltaStaged: stagedCount,
    quarantinedAcquisition: deltaRequestedRows - acquired.length,
    quarantinedValidation: acquired.length - validated.length,
    status: (validated.length === stagedCount) ? "MATCH" : "MISMATCH"
  };
  
  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE13_RECONCILIATION_REPORT.json'), JSON.stringify(reconciliation, null, 2));
  
  if (reconciliation.status === "MISMATCH") {
    throw new Error("Phase 13 Reconciliation failed!");
  }
}

run();
