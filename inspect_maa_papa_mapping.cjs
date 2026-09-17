const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const z = await db.execute("SELECT portfolio, count(*) as count FROM ZerodhaHoldings GROUP BY portfolio");
  console.log('=== ZERODHA HOLDINGS TABLE ===');
  console.log(z.rows);

  const zh = await db.execute("SELECT portfolio, symbol, isin, quantity, avg_price FROM ZerodhaHoldings ORDER BY portfolio, symbol");
  console.log('=== ZERODHA HOLDINGS DETAIL ===');
  zh.rows.forEach(r => console.log(r));

  const h = await db.execute("SELECT portfolio, symbol, isin, quantity, avg_buy_price FROM Holdings WHERE portfolio IN ('Maa', 'Papa') ORDER BY portfolio, symbol");
  console.log('\n=== DB HOLDINGS TABLE (Maa & Papa) ===');
  h.rows.forEach(r => console.log(r));

  process.exit(0);
}

main().catch(console.error);
