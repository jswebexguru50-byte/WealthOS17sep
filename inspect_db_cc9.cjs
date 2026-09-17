const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./portfolio.db');

db.all("SELECT type, count(*) as count, sum(net_amount) as total_amt FROM Transactions WHERE LOWER(TRIM(portfolio)) = 'cc9' GROUP BY type", [], (err, rows) => {
  console.log("DB CC9 summary by type:");
  console.table(rows);

  db.all("SELECT DISTINCT symbol FROM Transactions WHERE LOWER(TRIM(portfolio)) = 'cc9'", [], (sErr, symbols) => {
    console.log(`Total unique symbols in DB for CC9: ${symbols.length}`);
    console.log(symbols.map(s => s.symbol).join(', '));
    process.exit(0);
  });
});
