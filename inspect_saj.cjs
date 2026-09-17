const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('portfolio.db');

async function checkSaj() {
  const rows = await new Promise(res => db.all(
    "SELECT id, portfolio, isin, symbol, date, type, quantity, price, source, batch_id FROM Transactions WHERE portfolio = 'Brother - Equity' AND symbol = 'SAJHOTELS' ORDER BY date, id",
    (err, r) => res(r || [])
  ));
  console.table(rows);

  // Check current holdings for SAJHOTELS
  const h = await new Promise(res => db.all("SELECT * FROM Holdings WHERE symbol = 'SAJHOTELS'", (err, r) => res(r || [])));
  console.log('Holdings for SAJHOTELS:');
  console.table(h);

  db.close();
}

checkSaj();
