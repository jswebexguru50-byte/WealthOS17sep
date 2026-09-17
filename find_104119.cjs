const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT id, date, portfolio, type, isin, symbol, net_amount, gross_amount, notes FROM Transactions WHERE CAST(net_amount AS TEXT) LIKE '%104119%' OR CAST(gross_amount AS TEXT) LIKE '%104119%'", [], (err, rows) => {
  console.log('MATCHING_TXNS:', rows);
});

// Let's check ledger API output for IIFL360
fetch('http://127.0.0.1:3000/api/ledger?portfolio=IIFL360')
  .then(r => r.json())
  .then(d => {
    console.log('LEDGER_API_IIFL360_SUMMARY:', {
      portfolio: d.portfolio,
      cashInHand: d.cashInHand,
      pmsCashInHand: d.pmsCashInHand,
      totalNetWorth: d.totalNetWorth,
      summary: d.summary
    });
  })
  .catch(e => console.error('LEDGER_ERR:', e.message));

// Let's check dashboard API output for IIFL360
fetch('http://127.0.0.1:3000/api/dashboard?portfolios=IIFL360')
  .then(r => r.json())
  .then(d => {
    console.log('DASHBOARD_API_IIFL360_METRICS:', d.metrics);
  })
  .catch(e => console.error('DASHBOARD_ERR:', e.message));
