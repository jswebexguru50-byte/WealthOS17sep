const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT id, date, type, symbol, isin, quantity, price, net_amount FROM Transactions WHERE portfolio = 'IIFL360' AND (symbol LIKE '%APOLLO%' OR symbol LIKE '%INDUSTOWER%') ORDER BY date ASC", [], (err, rows) => {
  console.log('APOLLO_AND_INDUSTOWER_TXNS:', rows);
});
