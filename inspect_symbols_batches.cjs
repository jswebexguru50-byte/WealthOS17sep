const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  // Let's inspect AARTIIND transactions in all batches for cc9
  const aarti = await db.execute("SELECT id, date, type, symbol, quantity, price, net_amount, source, batch_id FROM Transactions WHERE portfolio='cc9' AND symbol='AARTIIND' ORDER BY date, id");
  console.log('=== AARTIIND TRANSACTIONS ===');
  aarti.rows.forEach(r => console.log(JSON.stringify(r)));

  // Let's inspect AAVAS transactions
  const aavas = await db.execute("SELECT id, date, type, symbol, quantity, price, net_amount, source, batch_id FROM Transactions WHERE portfolio='cc9' AND symbol='AAVAS' ORDER BY date, id");
  console.log('\n=== AAVAS TRANSACTIONS ===');
  aavas.rows.forEach(r => console.log(JSON.stringify(r)));

  // Let's inspect TATAMTRDVR transactions
  const dvr = await db.execute("SELECT id, date, type, symbol, quantity, price, net_amount, source, batch_id FROM Transactions WHERE portfolio='cc9' AND symbol LIKE '%DVR%' ORDER BY date, id");
  console.log('\n=== TATAMTRDVR TRANSACTIONS ===');
  dvr.rows.forEach(r => console.log(JSON.stringify(r)));

  // Let's inspect TATAMOTORS transactions
  const tm = await db.execute("SELECT id, date, type, symbol, quantity, price, net_amount, source, batch_id FROM Transactions WHERE portfolio='cc9' AND symbol='TATAMOTORS' ORDER BY date, id");
  console.log('\n=== TATAMOTORS TRANSACTIONS ===');
  tm.rows.forEach(r => console.log(JSON.stringify(r)));
}

main().catch(console.error);
