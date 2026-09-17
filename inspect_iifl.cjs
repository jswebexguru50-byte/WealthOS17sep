const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT DISTINCT portfolio FROM Holdings", [], (err, rows) => {
  if (err) console.error('HOLDINGS_ERR:', err);
  else console.log('ALL_PORTFOLIOS_IN_HOLDINGS:', rows);
});

db.all("SELECT DISTINCT portfolio FROM Transactions", [], (err, rows) => {
  if (err) console.error('TXS_ERR:', err);
  else console.log('ALL_PORTFOLIOS_IN_TXS:', rows);
});

db.all("SELECT DISTINCT portfolio FROM BankBook", [], (err, rows) => {
  if (err) console.error('BB_ERR:', err);
  else console.log('ALL_PORTFOLIOS_IN_BANKBOOK:', rows);
});
