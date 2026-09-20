const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../../');
const DB_PATH = path.join(ROOT, 'portfolio.db');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');

function reportProgress(msg, progress = null) {
  if (parentPort) parentPort.postMessage({ type: 'progress', phase: 'Phase 15', message: msg, progress });
}

function run() {
  reportProgress('Initializing Phase 15: Idempotency Test...', 0);

  const calendarPath = path.join(REPORTS_DIR, 'EMPIRICAL_CALENDAR.json');
  let empiricalDates = [];
  
  try {
    if (fs.existsSync(calendarPath)) {
      empiricalDates = JSON.parse(fs.readFileSync(calendarPath, 'utf8'));
    }
  } catch(e) {}

  if (empiricalDates.length === 0) {
    reportProgress('Failed: No empirical calendar found.', 100);
    if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 15', result: 'FAILED' });
    return;
  }

  const db = new Database(DB_PATH, { readonly: true });
  
  reportProgress('Querying existing symbol boundaries...', 20);
  const boundaries = db.prepare(`SELECT symbol, MIN(trade_date) as min_date, MAX(trade_date) as max_date, COUNT(*) as existing_count FROM DailyOHLCV GROUP BY symbol`).all();
  
  const symbolsToDeepCheck = boundaries.slice(0, 50); // Using the same deterministic scope as Phase 7
  let totalMissing = 0;
  let totalExpected = 0;
  let totalFound = 0;

  reportProgress('Re-calculating actionable delta across portfolio.db...', 40);
  
  for (let i = 0; i < symbolsToDeepCheck.length; i++) {
    const b = symbolsToDeepCheck[i];
    const startIndex = empiricalDates.indexOf(b.min_date);
    const endIndex = empiricalDates.indexOf(b.max_date);
    
    if (startIndex !== -1 && endIndex !== -1) {
      const expectedDates = empiricalDates.slice(startIndex, endIndex + 1);
      totalExpected += expectedDates.length;
      
      const existing = db.prepare(`SELECT trade_date FROM DailyOHLCV WHERE symbol = ?`).all(b.symbol).map(r => r.trade_date);
      const existingSet = new Set(existing);
      totalFound += existing.length;
      
      for (const date of expectedDates) {
        if (!existingSet.has(date)) {
          totalMissing++;
        }
      }
    }
    
    if (i % 10 === 0) {
      reportProgress(`Verified ${i}/${symbolsToDeepCheck.length} symbols...`, 40 + (i / symbolsToDeepCheck.length) * 50);
    }
  }

  db.close();

  const actionableDelta = totalMissing;

  const report = {
    phase: "15",
    status: actionableDelta === 0 ? "PASS" : "FAIL",
    idempotency: {
      actionableDelta: actionableDelta,
      totalExpectedSessions: totalExpected,
      totalProductionSessions: totalFound
    },
    message: actionableDelta === 0 ? "ACTIONABLE_DELTA = 0" : `Found ${actionableDelta} missing rows after promotion.`
  };

  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE15_IDEMPOTENCY_TEST.json'), JSON.stringify(report, null, 2));

  if (actionableDelta === 0) {
    reportProgress('Phase 15 Complete: ACTIONABLE_DELTA = 0.', 100);
    if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 15', result: 'PASS' });
  } else {
    reportProgress('Phase 15 Complete: Idempotency FAILED.', 100);
    if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 15', result: 'FAILED' });
  }
}

run();
