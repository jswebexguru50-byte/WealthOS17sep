const xlsx = require('xlsx');
const path = require('path');

const file = path.join('C:\\Users\\gopal\\Downloads', 'IBKR - US ETF txn.xlsx');
const wb = xlsx.readFile(file);
console.log('Sheets:', wb.SheetNames);
wb.SheetNames.forEach(s => {
  console.log(`\n--- Sheet: ${s} ---`);
  const data = xlsx.utils.sheet_to_json(wb.Sheets[s]);
  console.table(data);
});
