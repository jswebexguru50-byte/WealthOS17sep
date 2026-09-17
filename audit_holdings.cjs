const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('portfolio.db');

db.serialize(() => {
  // Data source distribution
  db.all('SELECT data_source, COUNT(*) as cnt, ROUND(SUM(current_value)) as value FROM Holdings WHERE quantity > 0 GROUP BY data_source ORDER BY cnt DESC', (err, rows) => {
    console.log('=== Data Source Distribution ===');
    console.table(rows);
  });

  // CV mismatch: current_value != quantity * ltp
  db.all('SELECT portfolio, symbol, quantity, ltp, current_value, ROUND(quantity*ltp) as expected_cv FROM Holdings WHERE quantity > 0 AND ABS(quantity * ltp - current_value) > 1', (err, rows) => {
    console.log('\n=== CV Mismatch (current_value != qty * ltp): ' + (rows ? rows.length : 0) + ' issues ===');
    if (rows && rows.length > 0) console.table(rows.slice(0, 20));
  });

  // PNL mismatch: unrealized_pnl != current_value - total_cost
  db.all('SELECT portfolio, symbol, current_value, total_cost, unrealized_pnl, ROUND(current_value - total_cost) as expected_pnl FROM Holdings WHERE quantity > 0 AND ABS(current_value - total_cost - unrealized_pnl) > 5', (err, rows) => {
    console.log('\n=== PNL Mismatch (unrealized_pnl != cv - cost): ' + (rows ? rows.length : 0) + ' issues ===');
    if (rows && rows.length > 0) console.table(rows.slice(0, 20));
  });

  // Day change pct mismatch
  db.all('SELECT portfolio, symbol, ltp, prev_close, day_change_pct, ROUND((ltp - prev_close) / prev_close * 100, 4) as expected_pct FROM Holdings WHERE quantity > 0 AND prev_close > 0 AND ABS(((ltp - prev_close) / prev_close * 100) - day_change_pct) > 0.05', (err, rows) => {
    console.log('\n=== day_change_pct Mismatch: ' + (rows ? rows.length : 0) + ' issues ===');
    if (rows && rows.length > 0) console.table(rows.slice(0, 20));
  });

  // Unpriced holdings (fallback)
  db.all('SELECT portfolio, symbol, quantity, total_cost FROM Holdings WHERE quantity > 0 AND data_source = "Avg Buy Cost Fallback"', (err, rows) => {
    console.log('\n=== Unpriced Holdings (Avg Buy Cost Fallback): ' + (rows ? rows.length : 0) + ' ===');
    if (rows && rows.length > 0) console.table(rows);
  });

  // Holdings where prev_close = ltp => day change always zero
  db.all('SELECT portfolio, symbol, ltp, prev_close FROM Holdings WHERE quantity > 0 AND ABS(prev_close - ltp) < 0.001 AND ltp > 5 AND holding_type != "CASH"', (err, rows) => {
    console.log('\n=== prev_close = ltp (day change stuck at 0): ' + (rows ? rows.length : 0) + ' ===');
    if (rows && rows.length > 0) console.table(rows.slice(0, 10));
  });

  // unrealized_pct mismatch
  db.all('SELECT portfolio, symbol, unrealized_pnl, total_cost, unrealized_pct, ROUND(unrealized_pnl/total_cost*100, 2) as expected_pct FROM Holdings WHERE quantity > 0 AND total_cost > 0 AND ABS(unrealized_pnl/total_cost*100 - unrealized_pct) > 0.1', (err, rows) => {
    console.log('\n=== unrealized_pct Mismatch: ' + (rows ? rows.length : 0) + ' issues ===');
    if (rows && rows.length > 0) console.table(rows.slice(0, 20));
    db.close(() => {
      console.log('\nAudit complete.');
    });
  });
});
