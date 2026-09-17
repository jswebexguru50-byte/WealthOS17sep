const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT DISTINCT portfolio FROM Portfolios", [], (err, ports) => {
  console.log('PORTFOLIOS_TABLE:', ports);
});

db.all("SELECT portfolio, COUNT(*) as cnt, SUM(quantity) as tot_qty, SUM(current_value) as cur_val FROM Holdings WHERE portfolio LIKE '%IIFL%' GROUP BY portfolio", [], (err, h) => {
  console.log('IIFL_HOLDINGS:', h);
});

db.all("SELECT * FROM BankAccounts WHERE portfolio LIKE '%IIFL%'", [], (err, bAcc) => {
  console.log('IIFL_BANK_ACCOUNTS:', bAcc);
});

db.all("SELECT portfolio, COUNT(*) as cnt, SUM(amount) as net_amt, SUM(CASE WHEN type='CREDIT' THEN amount ELSE -amount END) as signed_amt FROM BankBook WHERE portfolio LIKE '%IIFL%' GROUP BY portfolio", [], (err, bb) => {
  console.log('IIFL_BANK_BOOK_SUMMARY:', bb);
});

db.all("SELECT id, date, type, amount, description, portfolio, balance_after FROM BankBook WHERE portfolio LIKE '%IIFL%' ORDER BY date DESC LIMIT 5", [], (err, bbRows) => {
  console.log('IIFL_BANK_BOOK_ROWS:', bbRows);
});

db.all("SELECT type, COUNT(*) as cnt, SUM(amount) as tot_amt FROM Transactions WHERE portfolio LIKE '%IIFL%' GROUP BY type", [], (err, txs) => {
  console.log('IIFL_TRANSACTIONS_BY_TYPE:', txs);
});

db.all("SELECT * FROM CashBalances WHERE portfolio LIKE '%IIFL%'", [], (err, cb) => {
  console.log('IIFL_CASH_BALANCES:', cb);
});
