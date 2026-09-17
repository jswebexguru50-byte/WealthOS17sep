const sqlite3 = require('./node_modules/sqlite3').verbose();
const db = new sqlite3.Database('./portfolio.db');
db.serialize(() => {
  db.all("PRAGMA table_info(MasterTickers)", (e, r) => {
    console.log('MasterTickers columns:', r && r.map(c => c.name).join(', '));
  });
  // Try the exact query the engine uses
  db.all(`
    SELECT DISTINCT symbol, COALESCE(company_name, name, symbol) as companyName
    FROM MasterTickers
    WHERE exchange = 'NSE' AND segment = 'EQ' AND symbol IS NOT NULL AND symbol != ''
    ORDER BY COALESCE(market_cap_cr, 0) DESC
    LIMIT 5
  `, (e, r) => {
    if (e) console.error('Engine query ERROR:', e.message);
    else console.log('Engine query OK, sample:', JSON.stringify(r));
  });
  // Also check UniverseManagerService table
  db.all("SELECT * FROM sunrise_industrial_universe LIMIT 5", (e, r) => {
    if (e) console.error('Universe table error:', e.message);
    else console.log('sunrise_industrial_universe sample:', JSON.stringify(r));
  });
  db.get("SELECT COUNT(*) as cnt FROM sunrise_industrial_universe", (e, r) => {
    console.log('sunrise_industrial_universe count:', r && r.cnt);
  });
});
db.close(() => console.log('done'));
