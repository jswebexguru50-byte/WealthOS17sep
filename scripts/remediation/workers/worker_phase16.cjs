const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../../');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');
const DB_PATH = path.join(ROOT, 'portfolio.db');
const STAGING_DB_PATH = path.join(ROOT, 'portfolio_staging.db');

function reportProgress(msg, progress = null) {
  if (parentPort) parentPort.postMessage({ type: 'progress', phase: 'Phase 16', message: msg, progress });
}

function run() {
  reportProgress('Initializing Phase 16: Independent Final Audit...', 0);

  let certified = false;
  let validationMessage = "Audit in progress.";
  const auditLog = [];

  const addLog = (msg, status = 'INFO') => auditLog.push(`[${status}] ${msg}`);

  try {
    // 1. Re-read Phase 7 Delta
    const phase7Path = path.join(REPORTS_DIR, 'DELTA_ACQUISITION_QUEUE.json');
    if (!fs.existsSync(phase7Path)) throw new Error("Missing Phase 7 Delta Queue evidence.");
    const phase7 = JSON.parse(fs.readFileSync(phase7Path, 'utf8'));
    addLog(`Read Phase 7 Delta Queue: ${phase7.length} records missing.`, 'PASS');

    // 2. Re-read Phase 9 Approval
    const phase9Path = path.join(REPORTS_DIR, 'ACQUISITION_APPROVAL_PACKAGE.json');
    if (!fs.existsSync(phase9Path)) throw new Error("Missing Phase 9 Approval evidence.");
    const phase9 = JSON.parse(fs.readFileSync(phase9Path, 'utf8'));
    if (phase9.auditMode !== "REAL") throw new Error("Phase 9 Approval Package is not REAL.");
    addLog(`Phase 9 Approval Gate passed with REAL audit mode.`, 'PASS');

    // 3. Re-read Staging DB
    if (!fs.existsSync(STAGING_DB_PATH)) throw new Error("Missing Staging DB evidence.");
    const stagingDb = new Database(STAGING_DB_PATH, { fileMustExist: true });
    const stagedRows = stagingDb.prepare('SELECT COUNT(*) as count FROM Staging_DailyOHLCV').get().count;
    stagingDb.close();
    if (stagedRows !== phase7.length) throw new Error("Staging DB rows do not match approved Delta Queue rows.");
    addLog(`Staging DB matches Delta Queue rows (${stagedRows}).`, 'PASS');

    // 4. Re-read Phase 15 Idempotency Evidence
    const phase15Path = path.join(REPORTS_DIR, 'PHASE15_IDEMPOTENCY_TEST.json');
    if (!fs.existsSync(phase15Path)) throw new Error("Missing Phase 15 Idempotency evidence.");
    const phase15 = JSON.parse(fs.readFileSync(phase15Path, 'utf8'));
    if (phase15.idempotency.actionableDelta !== 0) throw new Error("Idempotency test actionable delta is not 0.");
    addLog(`Idempotency tested ACTIONABLE_DELTA = 0.`, 'PASS');

    // 5. Final Boolean Evaluation
    certified = true;
    validationMessage = "All independent deterministic predicates satisfied.";

  } catch (err) {
    certified = false;
    validationMessage = err.message;
    addLog(`AUDIT FAILED: ${err.message}`, 'FAIL');
  }

  reportProgress('Generating Final Certification Manifest...', 90);

  const manifest = {
    phase: "16",
    status: certified ? "PASS" : "FAIL",
    certification: {
      MARKET_DATA_CERTIFIED: certified,
      DATA_REMEDIATION_CERTIFIED: certified,
      CAPITAL_DEPLOYMENT_AUTHORIZED: false // Hard requirement to separate these explicitly
    },
    message: validationMessage,
    auditLog: auditLog
  };

  fs.writeFileSync(path.join(REPORTS_DIR, 'INDEPENDENT_REMEDIATION_AUDIT.json'), JSON.stringify(manifest, null, 2));

  if (certified) {
    reportProgress('Phase 16 Complete: MARKET_DATA_CERTIFIED = true.', 100);
    if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 16', result: 'PASS' });
  } else {
    reportProgress('Phase 16 Complete: MARKET_DATA_CERTIFIED = false.', 100);
    if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 16', result: 'FAILED' });
  }
}

run();
