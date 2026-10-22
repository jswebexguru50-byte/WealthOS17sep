import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('portfolio.db');

db.all(`SELECT portfolio, isin, symbol, quantity, avg_buy_price, total_cost, current_value FROM Holdings WHERE portfolio = 'cc9' ORDER BY symbol ASC`, (err, rows) => {
  console.log('--- All CC9 Holdings Rows in DB ---');
  console.table(rows);
  console.log('Total CC9 rows:', rows.length);
  const totalVal = rows.reduce((s, r) => s + r.current_value, 0);
  console.log('Total CC9 Value: ₹', (totalVal / 10000000).toFixed(4), 'Cr');
});
