const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT type, date, symbol, net_amount, quantity, price FROM Transactions WHERE portfolio = 'IIFL360' ORDER BY date ASC", [], (err, rows) => {
  if (err) return console.error(err);
  console.log('TOTAL_ROWS:', rows.length);
  
  let deposits = 0, withdrawals = 0, buys = 0, sells = 0, divs = 0, expenses = 0;
  for (const r of rows) {
    const amt = Math.abs(r.net_amount || (r.quantity * r.price) || 0);
    const t = String(r.type).toUpperCase();
    if (t === 'DEPOSIT') deposits += amt;
    else if (t === 'WITHDRAWAL' || t === 'TRANSFER OUT' || t === 'SECURITY OUT') withdrawals += amt;
    else if (t === 'BUY' || t.includes('PURCHASE')) buys += amt;
    else if (t === 'SELL' || t.includes('SALE') || t === 'BUYBACK') sells += amt;
    else if (t === 'DIVIDEND' || t === 'CASH_INCOME' || t === 'INTEREST') divs += amt;
    else if (t === 'EXPENSE' || t === 'TAX' || t === 'MANAGEMENT_FEE' || t === 'TDS') expenses += amt;
  }
  console.log('BREAKDOWN:', { deposits, withdrawals, buys, sells, divs, expenses });
  console.log('NET_CASH_FORMULA = deposits + sells + divs - buys - withdrawals - expenses =', (deposits + sells + divs - buys - withdrawals - expenses));
  console.log('FIRST 5 ROWS:', rows.slice(0, 5));
  console.log('LAST 5 ROWS:', rows.slice(-5));
});
