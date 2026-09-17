const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});
async function run() {
  // HIRECT CorporateActions
  const ca = await db.execute("SELECT id, ex_date, action_type, numerator, denominator, old_face_value, new_face_value, applied, notes FROM CorporateActions WHERE symbol='HIRECT' ORDER BY ex_date ASC");
  console.log('\n=== HIRECT CorporateActions ===');
  ca.rows.forEach(r => console.log(JSON.stringify(r)));

  // HIRECT CorporateActionAudit
  const audit = await db.execute("SELECT * FROM CorporateActionAudit WHERE symbol='HIRECT' ORDER BY rowid ASC");
  console.log('\n=== HIRECT CorporateActionAudit ===');
  audit.rows.forEach(r => console.log(JSON.stringify(r)));

  // HIRECT all transactions
  console.log('\n=== HIRECT Transactions (cc9) ===');
  const txs = await db.execute("SELECT date, type, quantity, price, net_amount, is_ca, notes FROM Transactions WHERE portfolio='cc9' AND symbol='HIRECT' ORDER BY date ASC");
  let qty = 0;
  txs.rows.forEach(r => {
    const t = (r.type || '').toUpperCase().trim();
    if (['BUY','TRANSFER IN','BONUS','SPLIT'].includes(t)) qty += Number(r.quantity);
    else if (['SELL'].includes(t)) qty -= Number(r.quantity);
    console.log(`${r.date} | ${(r.type||'').padEnd(10)} | qty: ${String(r.quantity).padStart(8)} | price: ${String(r.price||0).padStart(10)} | is_ca: ${r.is_ca} | running: ${Math.round(qty*100)/100} | notes: ${r.notes||''}`);
  });
  console.log('\nDB Holdings qty:', (await db.execute("SELECT quantity, avg_buy_price FROM Holdings WHERE portfolio='cc9' AND symbol='HIRECT'")).rows[0]);
}
run().catch(console.error);
