const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT type, COUNT(*) as cnt, SUM(net_amount) as amt FROM Transactions WHERE portfolio = 'DBFS' GROUP BY type", [], (err, rows) => {
  console.log('DBFS_SUMMARY:', rows);
});

db.all("SELECT * FROM Portfolios WHERE name IN ('DBFS', 'IIFL360')", [], (err, rows) => {
  console.log('PORTFOLIOS_META:', rows);
});
