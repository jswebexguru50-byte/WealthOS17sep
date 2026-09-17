const { createClient } = require('@libsql/client');

async function run() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const txs = await db.execute("SELECT id, date, type, quantity, price, net_amount FROM Transactions WHERE portfolio='cc9' AND symbol='JTLIND' ORDER BY date ASC, id ASC");
  let q = 0;
  txs.rows.forEach(r => {
    if (['BUY','PURCHASE','TRANSFER IN','SECURITY IN','SPLIT','BONUS'].includes(r.type)) q += r.quantity;
    else if (['SELL','SALE','TRANSFER OUT','SECURITY OUT'].includes(r.type)) q -= r.quantity;
    console.log(r.id, r.date, r.type.padEnd(10), String(r.quantity).padStart(6), 'Running:', q);
  });
  process.exit(0);
}
run();
