const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT type, net_amount, quantity, price FROM Transactions WHERE portfolio = 'IIFL360'", [], (err, rows) => {
  let s1 = 0, s2 = 0;
  for (const tx of rows) {
    const type = String(tx.type).toUpperCase();
    const amount = Math.abs(tx.net_amount || (tx.quantity * tx.price) || 0);

    // Formula 1 (server.ts):
    if (type === 'DEPOSIT' || type === 'TRANSFER IN' || type === 'SECURITY IN') s1 += amount;
    else if (type === 'WITHDRAWAL' || type === 'TRANSFER OUT' || type === 'SECURITY OUT') s1 -= amount;
    else if (type === 'BUY' || type.includes('PURCHASE')) s1 -= amount;
    else if (type === 'SELL' || type.includes('SALE') || type === 'BUYBACK') s1 += amount;
    else if (type === 'EXPENSE' || type === 'TAX' || type.includes('FEE') || type === 'TDS' || type.includes('CUSTODY') || type.includes('AUDIT') || type.includes('LOAD') || type.includes('CHARGE') || type.includes('EXPENSE')) s1 -= amount;
    else if (type === 'CASH_INCOME' || type === 'DIVIDEND' || type === 'INTEREST') s1 += amount;

    // Formula 2:
    if (type === 'DEPOSIT') s2 += amount;
    else if (type === 'WITHDRAWAL') s2 -= amount;
    else if (type === 'BUY') s2 -= amount;
    else if (type === 'SELL' || type === 'BUYBACK') s2 += amount;
    else if (type === 'DIVIDEND') s2 += amount;
    else if (type === 'AUDIT_CHARGES' || type === 'CUSTODY_CHARGES' || type === 'DP_CHARGES' || type === 'ENTRY_LOAD' || type === 'MANAGEMENT_FEE' || type === 'TDS') s2 -= amount;
    else {
      console.log('UNHANDLED_IN_F2:', type, amount);
    }
  }

  console.log({ s1, s2, diff: s1 - s2 });
});
