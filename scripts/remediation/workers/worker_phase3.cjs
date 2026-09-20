const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../../');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');

function reportProgress(msg, progress = null) {
  if (parentPort) parentPort.postMessage({ type: 'progress', phase: 'Phase 3', message: msg, progress });
}

function run() {
  reportProgress('Initializing Phase 3: Trading Calendar...', 0);
  
  const dbPath = path.join(ROOT, 'portfolio.db');
  let db;
  let empiricalDates = [];
  
  try {
    db = new Database(dbPath, { readonly: true });
    reportProgress('Extracting empirical trading calendar from DailyOHLCV...', 50);
    // Extract all unique trading dates across the entire universe to build an empirical calendar
    empiricalDates = db.prepare("SELECT DISTINCT trade_date FROM DailyOHLCV ORDER BY trade_date").all().map(r => r.trade_date);
  } catch(e) {
    reportProgress('Failed to query calendar: ' + e.message);
  }

  reportProgress('Generating TRADING_CALENDAR_CERTIFICATION.json...', 90);
  
  const cert = {
    expected_trading_days_range: empiricalDates.length > 0 ? `${empiricalDates[0]} to ${empiricalDates[empiricalDates.length - 1]}` : 'UNKNOWN',
    empirical_trading_days_found: empiricalDates.length,
    status: empiricalDates.length < 2000 ? 'INCOMPLETE_REQUIRES_AUTHORITATIVE_SOURCE' : 'EMPIRICAL_BASELINE_ESTABLISHED',
    delta_required: true,
    resolution: 'Using empirical calendar as baseline. Requires authoritative NSE historical holiday master to certify.'
  };

  fs.writeFileSync(path.join(REPORTS_DIR, 'TRADING_CALENDAR_CERTIFICATION.json'), JSON.stringify(cert, null, 2));
  fs.writeFileSync(path.join(REPORTS_DIR, 'EMPIRICAL_CALENDAR.json'), JSON.stringify(empiricalDates, null, 2));

  if (db) db.close();
  reportProgress('Phase 3 Complete.', 100);
  if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 3' });
}

run();
