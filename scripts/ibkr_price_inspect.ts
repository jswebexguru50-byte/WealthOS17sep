import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT symbol, isin, quantity, native_ltp, native_current_value, ltp, current_value, data_source, last_update FROM Holdings WHERE portfolio = 'US - IBKR'", (err, rows) => {
  console.log('--- Current US - IBKR Holdings in DB ---');
  console.table(rows);
  const totalUsd = rows.reduce((s, r) => s + (r.native_current_value || (r.current_value / 94.94)), 0);
  console.log(`Total USD: $${totalUsd.toFixed(2)} USD`);
  console.log(`Target:    $389,000.00 USD`);
  console.log(`Diff:      $${(totalUsd - 389000).toFixed(2)} USD`);
});
