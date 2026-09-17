const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT type, net_amount, quantity, price, notes FROM Transactions WHERE portfolio = 'IIFL360'", [], (err, cashTxns) => {
  let pmsCashInHand = 0;
  let unhandled = [];
  for (const tx of cashTxns) {
    const type = String(tx.type).toUpperCase();
    const amount = Math.abs(tx.net_amount || (tx.quantity * tx.price) || 0);
    const before = pmsCashInHand;

    if (type === 'DEPOSIT' || type === 'TRANSFER IN' || type === 'SECURITY IN') pmsCashInHand += amount;
    else if (type === 'WITHDRAWAL' || type === 'TRANSFER OUT' || type === 'SECURITY OUT') pmsCashInHand -= amount;
    else if (type === 'BUY' || type.includes('PURCHASE')) pmsCashInHand -= amount;
    else if (type === 'SELL' || type.includes('SALE') || type === 'BUYBACK') pmsCashInHand += amount;
    else if (type === 'EXPENSE' || type === 'TAX' || type.includes('FEE') || type === 'TDS' || type.includes('CUSTODY') || type.includes('AUDIT') || type.includes('LOAD') || type.includes('CHARGE') || type.includes('EXPENSE')) pmsCashInHand -= amount;
    else if (type === 'CASH_INCOME' || type === 'DIVIDEND' || type === 'INTEREST') pmsCashInHand += amount;
    else {
      unhandled.push({ type, amount, notes: tx.notes });
    }
  }

  console.log('EXACT_SCRIPT_RESULT:', pmsCashInHand);
  console.log('UNHANDLED:', unhandled);
});
