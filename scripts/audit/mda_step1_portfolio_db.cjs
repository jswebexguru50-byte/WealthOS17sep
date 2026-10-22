const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const ROOT = 'c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release';

const results = {};

// ── 1. portfolio.db (primary, 13.5 GB) ──────────────────────────────────────
const dbPath = path.join(ROOT, 'portfolio.db');
console.log('Auditing portfolio.db...');
const db = new Database(dbPath, { readonly: true, timeout: 15000 });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
results.portfolio_db_tables = tables;
results.portfolio_db_table_count = tables.length;

// Row counts for all tables
results.portfolio_db_row_counts = {};
for (const t of tables) {
  try {
    results.portfolio_db_row_counts[t] = db.prepare('SELECT COUNT(*) as c FROM "' + t + '"').get().c;
  } catch(e) {
    results.portfolio_db_row_counts[t] = 'ERR:' + e.message;
  }
}

// DailyOHLCV deep dive
if (tables.includes('DailyOHLCV')) {
  try {
    const cols = db.prepare('PRAGMA table_info(DailyOHLCV)').all().map(c => c.name);
    results.DailyOHLCV_cols = cols;
    results.DailyOHLCV_summary = db.prepare(
      'SELECT MIN(date) as minDate, MAX(date) as maxDate, COUNT(DISTINCT symbol) as symbols, COUNT(*) as rows FROM DailyOHLCV'
    ).get();
    results.DailyOHLCV_sample_symbols = db.prepare('SELECT DISTINCT symbol FROM DailyOHLCV LIMIT 30').all().map(r => r.symbol);
  } catch(e) { results.DailyOHLCV_error = e.message; }
}

// MasterTickers deep dive
if (tables.includes('MasterTickers')) {
  try {
    const cols = db.prepare('PRAGMA table_info(MasterTickers)').all().map(c => c.name);
    results.MasterTickers_cols = cols;
    results.MasterTickers_count = db.prepare('SELECT COUNT(*) as c FROM MasterTickers').get().c;
    results.MasterTickers_sample = db.prepare('SELECT * FROM MasterTickers LIMIT 10').all();
    // Check if any exchange/index/segment info
    if (cols.includes('exchange') || cols.includes('segment')) {
      const colName = cols.includes('exchange') ? 'exchange' : 'segment';
      results.MasterTickers_exchanges = db.prepare('SELECT ' + colName + ', COUNT(*) as c FROM MasterTickers GROUP BY ' + colName).all();
    }
    if (cols.includes('index_name') || cols.includes('index') || cols.includes('indices')) {
      const colName = cols.find(c => ['index_name','index','indices','nifty_index'].includes(c));
      if (colName) results.MasterTickers_indices = db.prepare('SELECT ' + colName + ', COUNT(*) as c FROM MasterTickers GROUP BY ' + colName + ' LIMIT 30').all();
    }
  } catch(e) { results.MasterTickers_error = e.message; }
}

// historical_investable_universe
if (tables.includes('historical_investable_universe')) {
  try {
    const cols = db.prepare('PRAGMA table_info(historical_investable_universe)').all().map(c => c.name);
    results.universe_cols = cols;
    results.universe_count = db.prepare('SELECT COUNT(*) as c FROM historical_investable_universe').get().c;
    results.universe_sample = db.prepare('SELECT * FROM historical_investable_universe LIMIT 10').all();
  } catch(e) { results.universe_error = e.message; }
}

// Index/benchmark related tables
const indexTables = tables.filter(t => /nifty|index|benchmark|calendar|sme|universe|scrip|market/i.test(t));
results.index_related_tables = indexTables;
for (const t of indexTables) {
  try {
    const cols = db.prepare('PRAGMA table_info("' + t + '")').all().map(c => c.name);
    const cnt = db.prepare('SELECT COUNT(*) as c FROM "' + t + '"').get().c;
    const sample = db.prepare('SELECT * FROM "' + t + '" LIMIT 3').all();
    results['table_detail_' + t] = { cols, count: cnt, sample };
  } catch(e) { results['table_detail_' + t] = { error: e.message }; }
}

db.close();
console.log(JSON.stringify(results, null, 2));
