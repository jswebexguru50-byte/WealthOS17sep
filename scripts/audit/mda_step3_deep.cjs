const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const ROOT = 'c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release';
const db = new Database(path.join(ROOT, 'portfolio.db'), { readonly: true, timeout: 15000 });

const result = {};

// DailyOHLCV date range and symbol count
result.DailyOHLCV = db.prepare('SELECT MIN(trade_date) as minD, MAX(trade_date) as maxD, COUNT(DISTINCT symbol) as syms, COUNT(*) as rows FROM DailyOHLCV').get();
result.DailyOHLCV_sample_symbols = db.prepare('SELECT DISTINCT symbol FROM DailyOHLCV ORDER BY symbol LIMIT 50').all().map(r=>r.symbol);

// MasterTickers breakdown
const mtCols = db.prepare('PRAGMA table_info(MasterTickers)').all().map(c=>c.name);
result.MasterTickers_cols = mtCols;
result.MasterTickers_total = db.prepare('SELECT COUNT(*) as c FROM MasterTickers').get().c;
result.MasterTickers_sample = db.prepare('SELECT * FROM MasterTickers LIMIT 5').all();

// Exchange/segment breakdown
if (mtCols.includes('exchange')) result.MT_by_exchange = db.prepare('SELECT exchange, COUNT(*) as c FROM MasterTickers GROUP BY exchange').all();
if (mtCols.includes('segment')) result.MT_by_segment = db.prepare('SELECT segment, COUNT(*) as c FROM MasterTickers GROUP BY segment').all();

// IndexConstituents - 0 rows but check schema
result.IndexConstituents_cols = db.prepare('PRAGMA table_info(IndexConstituents)').all().map(c=>c.name);
result.IndexConstituents_count = 0;

// IndexOHLCV - 0 rows but check schema
result.IndexOHLCV_cols = db.prepare('PRAGMA table_info(IndexOHLCV)').all().map(c=>c.name);

// trading_calendar - only 42 rows! 
result.trading_calendar_count = 42;
result.trading_calendar_cols = db.prepare('PRAGMA table_info(trading_calendar)').all().map(c=>c.name);
result.trading_calendar_sample = db.prepare('SELECT * FROM trading_calendar LIMIT 10').all();
result.trading_calendar_range = db.prepare('SELECT MIN(date) as minD, MAX(date) as maxD FROM trading_calendar').get();

// FullUniverseComprehensiveOpportunityScan - 331 rows
result.FUCOS_cols = db.prepare('PRAGMA table_info(FullUniverseComprehensiveOpportunityScan)').all().map(c=>c.name);
result.FUCOS_sample = db.prepare('SELECT * FROM FullUniverseComprehensiveOpportunityScan LIMIT 5').all();

// MarketSnapshots - 32984 rows
result.MarketSnapshots_cols = db.prepare('PRAGMA table_info(MarketSnapshots)').all().map(c=>c.name);
result.MarketSnapshots_range = db.prepare('SELECT MIN(snapshot_date) as minD, MAX(snapshot_date) as maxD, COUNT(DISTINCT symbol) as syms FROM MarketSnapshots').get().symbol ? 
  db.prepare('SELECT MIN(snapshot_date) as minD, MAX(snapshot_date) as maxD, COUNT(DISTINCT symbol) as syms FROM MarketSnapshots').get() : 
  db.prepare('SELECT * FROM MarketSnapshots LIMIT 2').all();

// HistoricalPrices - 1346469 rows
result.HistoricalPrices_cols = db.prepare('PRAGMA table_info(HistoricalPrices)').all().map(c=>c.name);
result.HistoricalPrices_summary = db.prepare('SELECT MIN(date) as minD, MAX(date) as maxD, COUNT(DISTINCT symbol) as syms, COUNT(*) as rows FROM HistoricalPrices').get();

// NseBhavcopy - 18523 rows
result.NseBhavcopy_cols = db.prepare('PRAGMA table_info(NseBhavcopy)').all().map(c=>c.name);
result.NseBhavcopy_summary = db.prepare('SELECT MIN(trade_date) as minD, MAX(trade_date) as maxD, COUNT(DISTINCT symbol) as syms, COUNT(*) as rows FROM NseBhavcopy').get();

// sunrise_industrial_universe - 15 rows
result.sunrise_universe_sample = db.prepare('SELECT * FROM sunrise_industrial_universe').all();

// tier_membership_history - 10375 rows - index/tier info
result.tier_membership_cols = db.prepare('PRAGMA table_info(tier_membership_history)').all().map(c=>c.name);
result.tier_membership_sample = db.prepare('SELECT * FROM tier_membership_history LIMIT 5').all();

// BenchmarkCashFlowCache - 4928 rows - benchmark data
result.BenchmarkCashFlow_cols = db.prepare('PRAGMA table_info(BenchmarkCashFlowCache)').all().map(c=>c.name);
result.BenchmarkCashFlow_sample = db.prepare('SELECT * FROM BenchmarkCashFlowCache LIMIT 5').all();

// strategy_scan_cache - 4176 rows - what symbols?
result.strategy_scan_cols = db.prepare('PRAGMA table_info(strategy_scan_cache)').all().map(c=>c.name);
result.strategy_scan_sample = db.prepare('SELECT * FROM strategy_scan_cache LIMIT 3').all();

// stk.json size
const stkPath = path.join(ROOT, 'stk.json');
if (fs.existsSync(stkPath)) {
  const stk = JSON.parse(fs.readFileSync(stkPath, 'utf8'));
  const keys = Object.keys(stk);
  result.stk_json = {
    totalSymbols: keys.length,
    sampleSymbols: keys.slice(0, 30),
    sampleEntry: stk[keys[0]],
    fields: stk[keys[0]] ? Object.keys(stk[keys[0]]) : []
  };
}

db.close();
console.log(JSON.stringify(result, null, 2));
