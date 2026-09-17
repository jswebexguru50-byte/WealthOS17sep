const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:./portfolio.db' });

async function run() {
  const mfHoldings = await db.execute("SELECT portfolio, symbol, isin, quantity, total_cost, current_value FROM Holdings WHERE portfolio LIKE '%MF%' OR portfolio LIKE '%Mutual%' OR portfolio = 'Unlisted'");
  console.log('Mutual Funds and Unlisted Holdings in DB:');
  mfHoldings.rows.forEach(r => console.log(' ', r.portfolio, ':', r.symbol, '| val:', r.current_value));
}
run();
