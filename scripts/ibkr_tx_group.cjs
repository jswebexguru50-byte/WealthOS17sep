const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT symbol, SUM(CASE WHEN type='BUY' THEN quantity ELSE -quantity END) as net_qty, SUM(CASE WHEN type='BUY' THEN net_amount ELSE -net_amount END) as net_cost FROM Transactions WHERE portfolio='US - IBKR' GROUP BY symbol", (err, rows) => {
  console.log('--- Transactions Grouped by Symbol for US - IBKR ---');
  console.table(rows);
});
