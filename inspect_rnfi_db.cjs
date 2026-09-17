const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const h = await db.execute("SELECT portfolio, symbol, quantity, avg_buy_price, total_cost, current_value FROM Holdings WHERE symbol = 'RNFI'");
  console.log('Holdings for RNFI:', h.rows);

  const tx = await db.execute("SELECT date, type, quantity, price, source FROM Transactions WHERE symbol = 'RNFI' AND portfolio = 'Maa' ORDER BY date DESC, id DESC LIMIT 25");
  console.log('\nLatest RNFI transactions:', tx.rows);

  process.exit(0);
}

main().catch(console.error);
