import { getDB, dbAll } from '../src/server/database.js';

async function checkIbkrVal() {
  const db = getDB();
  const rows = await dbAll(db, "SELECT symbol, quantity, ltp, native_ltp, current_value, native_current_value FROM Holdings WHERE portfolio = 'US - IBKR'");
  console.table(rows);
  const sumInr = rows.reduce((s, r) => s + r.current_value, 0);
  const sumNative = rows.reduce((s, r) => s + r.native_current_value, 0);
  console.log('Total INR in Holdings for US - IBKR: ₹', (sumInr/10000000).toFixed(4), 'Cr');
  console.log('Total USD in Holdings for US - IBKR: $', sumNative.toFixed(2), 'USD');
  console.log('Total USD * 94.94:                   ₹', (sumNative * 94.94 / 10000000).toFixed(4), 'Cr');
  console.log('Diff:                                ₹', (sumInr - (sumNative * 94.94)).toFixed(2));
}

checkIbkrVal();
