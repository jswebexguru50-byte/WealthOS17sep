const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('portfolio.db');

async function checkDups() {
  const rows = await new Promise(res => db.all(`
    SELECT portfolio, isin, symbol, date, type, quantity, price, COUNT(*) as cnt, GROUP_CONCAT(id) as ids, GROUP_CONCAT(source) as sources, GROUP_CONCAT(notes) as notes_list
    FROM Transactions 
    GROUP BY portfolio, isin, symbol, date, type, quantity, price 
    HAVING cnt > 1
    ORDER BY portfolio, date
  `, (err, r) => res(r || [])));

  console.log('Total Duplicate Transaction Clusters across DB:', rows.length);
  console.table(rows.map(r => ({
    portfolio: r.portfolio,
    symbol: r.symbol,
    date: r.date,
    type: r.type,
    qty: r.quantity,
    price: r.price,
    cnt: r.cnt,
    ids: r.ids
  })));
  db.close();
}

checkDups();
