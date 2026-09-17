import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('portfolio.db');

db.all(`SELECT portfolio, isin, symbol, quantity, total_cost FROM ReconciledHoldings WHERE portfolio = 'cc9'`, (err, rows) => {
  console.log('--- CC9 in ReconciledHoldings ---');
  console.table(rows);
  console.log('Count:', rows.length);
});
