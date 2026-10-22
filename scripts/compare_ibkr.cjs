const xlsx = require('xlsx');
const sqlite3 = require('sqlite3');
const path = require('path');

const db = new sqlite3.Database('portfolio.db');
const file = path.join('C:\\Users\\gopal\\Downloads', 'IBKR - US ETF txn.xlsx');
const wb = xlsx.readFile(file);
const excelRows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

console.log('=== EXCEL TRANSACTIONS in "IBKR - US ETF txn.xlsx" ===');
console.table(excelRows);

db.all("SELECT id, date, type, symbol, isin, quantity, price, net_amount, notes FROM Transactions WHERE portfolio = 'US - IBKR' ORDER BY date ASC", (err, dbRows) => {
  console.log('\n=== DB TRANSACTIONS for "US - IBKR" ===');
  console.table(dbRows.filter(r => r.type === 'BUY' || r.type === 'SELL' || r.type === 'SPLIT'));
});
