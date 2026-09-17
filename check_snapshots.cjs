const sqlite3 = require('./node_modules/sqlite3').verbose();
const db = new sqlite3.Database('./portfolio.db');
db.serialize(() => {
  db.all("PRAGMA table_info(MarketSnapshots)", (e, r) => console.log('MarketSnapshots cols:', r && r.map(c => c.name + ':' + c.type).join(', ')));
  db.get("SELECT MIN(snapshot_date) as oldest, MAX(snapshot_date) as latest, COUNT(*) as cnt FROM MarketSnapshots", (e, r) => console.log('MarketSnapshots range:', JSON.stringify(r)));
  db.all("SELECT * FROM MarketSnapshots LIMIT 1", (e, r) => console.log('MarketSnapshots sample:', JSON.stringify(r)));
  db.all("PRAGMA table_info(HistoricalPrices)", (e, r) => console.log('HistoricalPrices cols:', r && r.map(c => c.name).join(', ')));
  db.get("SELECT MIN(date) as oldest, MAX(date) as latest FROM HistoricalPrices", (e, r) => console.log('HistoricalPrices range:', JSON.stringify(r)));
});
db.close(() => console.log('done'));
