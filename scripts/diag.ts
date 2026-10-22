import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT portfolio, type, isin, symbol, SUM(quantity) as tot_qty, COUNT(*) as cnt FROM Transactions WHERE UPPER(symbol) LIKE '%GSM%' GROUP BY portfolio, type, isin, symbol", (err, rows) => {
  console.log('--- GSM Grouped Transactions ---');
  console.table(rows);
});
