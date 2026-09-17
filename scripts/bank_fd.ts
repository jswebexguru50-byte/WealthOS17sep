import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('portfolio.db');

db.all(`SELECT * FROM BankAccountsAndFDs`, (err, rows) => {
  console.log('--- Bank Accounts & FDs ---');
  console.table(rows);
  const total = rows.reduce((s, r) => s + (r.inr_value || r.balance_amount || 0), 0);
  console.log('Total Bank & FD Value: ₹', (total / 10000000).toFixed(4), 'Cr');
});
