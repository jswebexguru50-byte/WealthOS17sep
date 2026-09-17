const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT * FROM Transactions WHERE portfolio = 'IIFL360' AND (symbol LIKE '%INDUSTOWER%' OR isin = 'INE121J01017' OR symbol LIKE '%BHARTI INFRATEL%') ORDER BY date ASC", [], (err, txs) => {
  if (err) return console.error(err);
  console.log('INDUSTOWER_TXNS:', txs);

  let buyQty = 0, sellQty = 0, buyAmt = 0, sellAmt = 0;
  for (const t of txs) {
    if (t.type === 'BUY') {
      buyQty += t.quantity;
      buyAmt += t.net_amount || (t.quantity * t.price);
    } else if (t.type === 'SELL') {
      sellQty += t.quantity;
      sellAmt += t.net_amount || (t.quantity * t.price);
    } else if (t.type === 'MERGER' || t.type === 'CORPORATE_ACTION' || t.type === 'BONUS') {
      console.log('CA_TXN:', t);
    }
  }
  console.log('SUMMARY:', { buyQty, sellQty, diff: buyQty - sellQty, buyAmt, sellAmt });

  db.all("SELECT * FROM Holdings WHERE portfolio = 'IIFL360' AND (symbol LIKE '%INDUSTOWER%' OR isin = 'INE121J01017')", [], (err2, h) => {
    console.log('INDUSTOWER_IN_HOLDINGS:', h);
  });
});
