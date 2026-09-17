const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT type, COUNT(*) as cnt, SUM(net_amount) as total_amt FROM Transactions WHERE portfolio = 'IIFL360' GROUP BY type", [], (err, rows) => {
  console.log('CURRENT_IIFL360_TXNS:', rows);

  let cash = 0;
  for (const r of rows) {
    const type = r.type;
    const amt = Math.abs(r.total_amt);
    if (type === 'DEPOSIT' || type === 'TRANSFER IN' || type === 'SECURITY IN') cash += amt;
    else if (type === 'WITHDRAWAL' || type === 'TRANSFER OUT' || type === 'SECURITY OUT') cash -= amt;
    else if (type === 'BUY') cash -= amt;
    else if (type === 'SELL' || type === 'BUYBACK') cash += amt;
    else if (type === 'EXPENSE' || type === 'MANAGEMENT_FEE' || type === 'ENTRY_LOAD' || type === 'CUSTODY_CHARGES' || type === 'AUDIT_CHARGES' || type === 'DP_CHARGES' || type === 'TDS') cash -= amt;
    else if (type === 'DIVIDEND' || type === 'CASH_INCOME') cash += amt;
  }
  console.log('RECONCILED_CASH:', cash);
});
