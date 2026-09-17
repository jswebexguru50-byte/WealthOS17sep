const XLSX = require('xlsx');
const path = require('path');
const os = require('os');
const dl = path.join(os.homedir(), 'Downloads');

const wb = XLSX.readFile(path.join(dl, 'tradebook-JDB184-EQ.xlsx'));
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
const hIdx = data.findIndex(r => r && r.some && r.some(c => String(c).toLowerCase().includes('symbol')));
const rows = XLSX.utils.sheet_to_json(ws, { range: hIdx, defval: '' });

const saj = rows.filter(r => String(r['symbol'] || r['Symbol'] || '').includes('SAJHOTELS'));
console.log('Tradebook JDB184 rows for SAJHOTELS:');
console.table(saj.map(r => ({
  date: r['trade_date'] || r['Trade Date'],
  type: r['trade_type'] || r['Trade Type'],
  qty: r['quantity'] || r['Quantity'],
  price: r['price'] || r['Price'],
  tradeId: r['trade_id'] || r['Trade ID'] || r['order_id']
})));
