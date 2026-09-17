const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT id, date, portfolio, type, symbol, isin, quantity, price, net_amount, notes FROM Transactions WHERE portfolio='US - IBKR' ORDER BY symbol, date ASC", (err, rows) => {
  console.table(rows);
});
