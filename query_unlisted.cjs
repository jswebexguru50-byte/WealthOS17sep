const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:./portfolio.db' });

async function run() {
  const unlisted = await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, current_value FROM Holdings WHERE portfolio='Unlisted'");
  console.log('Unlisted / AIF rows in DB:');
  unlisted.rows.forEach(r => console.log(' ', r.symbol, '| Qty:', r.quantity, '| Cost:', r.total_cost, '| Val:', r.current_value));
}
run();
