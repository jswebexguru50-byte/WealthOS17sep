const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function checkHirectAll() {
  const buys = await db.execute("SELECT sum(quantity) as buy_qty, sum(net_amount) as buy_amt FROM Transactions WHERE portfolio='cc9' AND symbol='HIRECT' AND type IN ('BUY', 'TRANSFER IN', 'SECURITY IN')");
  const sells = await db.execute("SELECT sum(quantity) as sell_qty, sum(net_amount) as sell_amt FROM Transactions WHERE portfolio='cc9' AND symbol='HIRECT' AND type IN ('SELL', 'TRANSFER OUT', 'SECURITY OUT')");
  console.log("HIRECT Buys:", buys.rows[0]);
  console.log("HIRECT Sells:", sells.rows[0]);
  console.log("Net Qty in DB:", (buys.rows[0].buy_qty || 0) - (sells.rows[0].sell_qty || 0));

  const allTx = await db.execute("SELECT id, date, type, quantity, price, net_amount, source FROM Transactions WHERE portfolio='cc9' AND symbol='HIRECT' ORDER BY date ASC");
  console.log("\nAll HIRECT transactions:");
  allTx.rows.forEach(r => console.log(`${r.date} | ${r.type.padEnd(12)} | Qty: ${String(r.quantity).padStart(6)} | Price: ${String(r.price).padStart(8)} | Net: ${String(r.net_amount).padStart(10)} | Source: ${r.source}`));
}
checkHirectAll();
