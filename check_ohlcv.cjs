const sqlite3 = require('./node_modules/sqlite3').verbose();
const db = new sqlite3.Database('./portfolio.db');
db.serialize(() => {
  db.get('SELECT COUNT(*) as cnt FROM DailyOHLCV', (e, r) => console.log('DailyOHLCV rows:', r && r.cnt));
  db.get('SELECT COUNT(DISTINCT symbol) as cnt FROM DailyOHLCV', (e, r) => console.log('DailyOHLCV unique symbols:', r && r.cnt));
  db.get("SELECT COUNT(*) as cnt FROM MasterTickers WHERE exchange='NSE' AND segment='EQ'", (e, r) => console.log('MasterTickers NSE EQ:', r && r.cnt));
  db.get('SELECT MAX(trade_date) as latest, MIN(trade_date) as oldest FROM DailyOHLCV', (e, r) => console.log('DailyOHLCV date range:', r && r.oldest, 'to', r && r.latest));
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%OHLCV%' OR name LIKE '%Daily%' OR name LIKE '%Historical%')", (e, r) => console.log('Relevant tables:', JSON.stringify(r)));
  db.get("SELECT COUNT(*) as cnt FROM HistoricalPrices", (e, r) => {
    if (!e) console.log('HistoricalPrices rows:', r && r.cnt);
    else console.log('HistoricalPrices: table error or missing');
  });
});
db.close(() => console.log('done'));
