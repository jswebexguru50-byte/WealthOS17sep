const sqlite3 = require('./node_modules/sqlite3').verbose();
const db = new sqlite3.Database('./portfolio.db');
db.serialize(() => {
  // Check MasterTickers segment values
  db.all("SELECT segment, exchange, COUNT(*) as cnt FROM MasterTickers GROUP BY segment, exchange ORDER BY cnt DESC LIMIT 20", (e, r) => {
    console.log('MasterTickers segments/exchanges:', JSON.stringify(r));
  });
  // Check for NSE EQ specifically
  db.get("SELECT COUNT(*) as cnt FROM MasterTickers WHERE exchange='NSE' AND segment='EQ'", (e, r) => {
    console.log('NSE EQ exact:', r && r.cnt);
  });
  // Check what segment values exist
  db.all("SELECT DISTINCT segment FROM MasterTickers LIMIT 20", (e, r) => {
    console.log('All segment values:', r && r.map(x => JSON.stringify(x.segment)));
  });
  // Check UniverseManagerService table if exists
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%Universe%' OR name LIKE '%universe%'", (e, r) => {
    console.log('Universe table:', r && r.name);
  });
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%Universe%' OR name LIKE '%universe%')", (e, r) => {
    console.log('All universe tables:', JSON.stringify(r));
  });
});
db.close(() => console.log('done'));
