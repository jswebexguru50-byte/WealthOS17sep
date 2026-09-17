const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT type, COUNT(*) as cnt, SUM(net_amount) as total_amt FROM Transactions WHERE portfolio = 'IIFL360' GROUP BY type", [], (err, rows) => {
  console.log('IIFL360_TXNS_BY_TYPE:', rows);
});
