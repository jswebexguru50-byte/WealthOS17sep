const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('portfolio.db');

async function checkTradebookDups() {
  const rows = await new Promise(res => db.all(`
    SELECT portfolio, isin, symbol, date, type, quantity, price, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM Transactions 
    WHERE quantity > 0 AND price > 0 AND type IN ('BUY', 'SELL') AND portfolio != 'cc9'
    GROUP BY portfolio, isin, symbol, date, type, quantity, price 
    HAVING cnt > 1
    ORDER BY portfolio, date
  `, (err, r) => res(r || [])));

  console.log('Tradebook duplicate trade rows count:', rows.length);
  console.table(rows);
  db.close();
}

checkTradebookDups();
