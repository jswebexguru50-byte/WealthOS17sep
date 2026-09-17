const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const r = await db.execute("SELECT id, date, type, symbol, isin, quantity, price, net_amount, notes FROM Transactions WHERE portfolio='cc9' AND symbol='HIRECT' ORDER BY date, id");
  console.log('=== HIRECT TRANSACTIONS ===');
  r.rows.forEach(row => console.log(JSON.stringify(row)));
  process.exit(0);
}

main().catch(console.error);
