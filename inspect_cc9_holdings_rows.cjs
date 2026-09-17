const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const h = await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, ltp, current_value FROM Holdings WHERE portfolio='cc9' ORDER BY symbol, isin");
  console.log(`Total Holdings rows for cc9: ${h.rows.length}`);
  h.rows.forEach(r => console.log(JSON.stringify(r)));
  process.exit(0);
}

main().catch(console.error);
