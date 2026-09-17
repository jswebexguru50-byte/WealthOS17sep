const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT * FROM Transactions WHERE type IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER IN', 'TRANSFER OUT') LIMIT 5", [], (err, rows) => {
  if (err) return console.error(err);
  console.log('EXISTING_CASH_TXNS:', rows);
});
