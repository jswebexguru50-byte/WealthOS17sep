const sqlite3 = require('./node_modules/sqlite3').verbose();
const db = new sqlite3.Database('./portfolio.db');
db.serialize(() => {
  db.all("PRAGMA table_info(HistoricalPrices)", (e, r) => console.log('HistoricalPrices columns:', JSON.stringify(r.map(c => c.name + ':' + c.type))));
  db.all("PRAGMA table_info(DailyOHLCV)", (e, r) => console.log('DailyOHLCV columns:', JSON.stringify(r.map(c => c.name + ':' + c.type))));
  db.get("SELECT COUNT(DISTINCT symbol) as cnt FROM HistoricalPrices", (e, r) => console.log('HistoricalPrices unique symbols:', r && r.cnt));
  db.get("SELECT MAX(date) as latest, MIN(date) as oldest FROM HistoricalPrices", (e, r) => console.log('HistoricalPrices date range:', r && r.oldest, 'to', r && r.latest));
  db.get("SELECT * FROM HistoricalPrices LIMIT 1", (e, r) => console.log('HistoricalPrices sample row:', JSON.stringify(r)));
});
db.close(() => console.log('done'));
