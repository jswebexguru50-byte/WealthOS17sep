const sqlite3 = require('./node_modules/sqlite3').verbose();
const db = new sqlite3.Database('./portfolio.db');
db.serialize(() => {
  db.all("SELECT symbol FROM HistoricalPrices GROUP BY symbol LIMIT 30", (e, r) => console.log('HP sample symbols:', r.map(x=>x.symbol)));
  db.all("SELECT symbol FROM MasterTickers WHERE exchange='NSE' AND segment='EQ' ORDER BY market_cap_cr DESC NULLS LAST LIMIT 20", (e, r) => console.log('MasterTickers NSE top20:', r.map(x=>x.symbol)));
  // Check overlap
  db.get("SELECT COUNT(*) as cnt FROM HistoricalPrices H JOIN MasterTickers M ON H.symbol = M.symbol WHERE M.exchange='NSE'", (e, r) => console.log('HP-MT symbol match count:', r && r.cnt));
  db.get("SELECT COUNT(*) as cnt FROM HistoricalPrices H JOIN MasterTickers M ON H.symbol = M.isin", (e, r) => console.log('HP-MT isin match count:', r && r.cnt));
  // Check what kind of symbols are in HistoricalPrices
  db.all("SELECT symbol, COUNT(*) as rows FROM HistoricalPrices WHERE symbol GLOB '[A-Z]*' GROUP BY symbol LIMIT 10", (e,r) => console.log('HP ticker-style samples:', r && r.map(x => x.symbol + ':' + x.rows)));
});
db.close(() => console.log('done'));
