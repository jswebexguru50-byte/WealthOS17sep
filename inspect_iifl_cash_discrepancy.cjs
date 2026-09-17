const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT DISTINCT portfolio FROM Transactions WHERE UPPER(portfolio) LIKE '%IIFL%'", [], (err, ports) => {
  console.log('DISTINCT_IIFL_PORTFOLIOS_IN_TXNS:', ports);

  db.all("SELECT * FROM Portfolios WHERE UPPER(name) LIKE '%IIFL%'", [], (err2, pRows) => {
    console.log('PORTFOLIOS_TABLE_IIFL:', pRows);

    // Check transactions for each variant
    for (const p of ports) {
      db.all("SELECT type, COUNT(*) as cnt, SUM(net_amount) as sum_net, SUM(gross_amount) as sum_gross FROM Transactions WHERE portfolio = ? GROUP BY type", [p.portfolio], (err3, txGroup) => {
        console.log(`\nTX_BREAKDOWN for [${p.portfolio}]:`, txGroup);
      });
    }
  });
});
