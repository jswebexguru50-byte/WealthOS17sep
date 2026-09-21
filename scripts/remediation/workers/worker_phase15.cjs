const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../../');
const DB_PATH = path.join(ROOT, 'portfolio.db');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');

const NSE_CALENDAR_MAP = {
  '2024-01-22': true, '2024-01-26': true, '2024-03-08': true, '2024-03-25': true,
  '2024-03-29': true, '2024-04-11': true, '2024-04-17': true, '2024-05-01': true,
  '2024-05-20': true, '2024-06-17': true, '2024-07-17': true, '2024-08-15': true,
  '2024-10-02': true, '2024-11-15': true, '2024-11-20': true, '2024-12-25': true
};

function getTradingSessions(startStr, endStr) {
  const dates = [];
  const start = new Date(startStr); const end = new Date(endStr);
  while (start <= end) {
    const dStr = start.toISOString().split('T')[0];
    if (start.getUTCDay() >= 1 && start.getUTCDay() <= 5 && !NSE_CALENDAR_MAP[dStr]) {
      dates.push(dStr);
    }
    start.setDate(start.getDate() + 1);
  }
  return dates;
}

function run() {
  const db = new Database(DB_PATH, { readonly: true });
  const symbols = db.prepare("SELECT symbol FROM MasterTickers WHERE status = 'ACTIVE'").all().map(r => r.symbol);
  
  let actionableDelta = 0;
  const startTarget = '2024-01-01';
  const endTarget = '2024-08-31';
  const targetSessions = getTradingSessions(startTarget, endTarget);
  
  for (const sym of symbols) {
    const m = db.prepare('SELECT upstox_key_nse, isin, exchange, listing_date FROM MasterTickers WHERE symbol = ?').get(sym);
    const existing = db.prepare('SELECT trade_date FROM DailyOHLCV WHERE symbol = ? AND trade_date >= ? AND trade_date <= ?').all(sym, startTarget, endTarget).map(r => r.trade_date);
    const existingSet = new Set(existing);
    
    let missing = [];
    for (const d of targetSessions) {
      if (m && m.listing_date && d < m.listing_date) continue; // skip pre-listing days
      if (!existingSet.has(d)) missing.push(d);
    }
    actionableDelta += missing.length;
  }

  const manifest = {
    population_count: symbols.length,
    population_hash: crypto.createHash('sha256').update(JSON.stringify(symbols)).digest('hex'),
    expected_sessions: targetSessions.length * symbols.length,
    actual_sessions: (targetSessions.length * symbols.length) - actionableDelta,
    actionable_delta: actionableDelta,
    calculation_version: "1.0.0",
    status: actionableDelta === 0 ? "PASS" : "FAIL"
  };

  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE15_FULL_UNIVERSE_IDEMPOTENCY.json'), JSON.stringify(manifest, null, 2));
  db.close();
}

run();
