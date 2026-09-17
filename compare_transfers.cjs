const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  // Compare transactions between the two batches
  const b1 = await db.execute("SELECT symbol, date, type, quantity, price, net_amount FROM Transactions WHERE portfolio='cc9' AND batch_id='PMS-RECON-1786807141134' AND UPPER(type) IN ('TRANSFER IN', 'SECURITY IN') ORDER BY symbol, date, quantity");
  const b2 = await db.execute("SELECT symbol, date, type, quantity, price, net_amount FROM Transactions WHERE portfolio='cc9' AND batch_id='PMS-1787815999863' AND UPPER(type) IN ('TRANSFER IN', 'SECURITY IN') ORDER BY symbol, date, quantity");

  console.log(`b1 (PMS-RECON... TRANSFER IN) count: ${b1.rows.length}, sum: ${b1.rows.reduce((s, r) => s + r.net_amount, 0)}`);
  console.log(`b2 (PMS-17878... SECURITY IN) count: ${b2.rows.length}, sum: ${b2.rows.reduce((s, r) => s + r.net_amount, 0)}`);

  // Let's check sample symbols in b1 vs b2
  const b1Symbols = new Set(b1.rows.map(r => r.symbol));
  const b2Symbols = new Set(b2.rows.map(r => r.symbol));

  console.log('\nSample comparison of quantities for first 10 symbols:');
  const allSyms = Array.from(new Set([...b1Symbols, ...b2Symbols])).slice(0, 15);
  for (const sym of allSyms) {
    const q1 = b1.rows.filter(r => r.symbol === sym).reduce((s, r) => s + r.quantity, 0);
    const q2 = b2.rows.filter(r => r.symbol === sym).reduce((s, r) => s + r.quantity, 0);
    const dbH = (await db.execute({ sql: "SELECT quantity, total_cost, ltp, current_value FROM Holdings WHERE portfolio='cc9' AND symbol=?", args: [sym] })).rows[0];
    console.log(`${String(sym).padEnd(12)} | b1 Qty: ${String(q1).padStart(8)} | b2 Qty: ${String(q2).padStart(8)} | DB Holding Qty: ${dbH ? dbH.quantity : 'NONE'}`);
  }
}

main().catch(console.error);
