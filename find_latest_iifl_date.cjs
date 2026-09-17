const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT * FROM Transactions WHERE portfolio = 'IIFL360' AND type = 'SELL' ORDER BY date DESC LIMIT 5", [], (err, sells) => {
  if (err) return console.error(err);
  console.log('LATEST_SELLS:', sells);

  db.all("SELECT * FROM Transactions WHERE portfolio = 'IIFL360' ORDER BY date DESC LIMIT 5", [], (err2, latest) => {
    if (err2) return console.error(err2);
    console.log('LATEST_ANY_TXN:', latest);
  });
});
