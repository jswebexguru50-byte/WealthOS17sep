const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function check() {
  const holdings = await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, ltp, current_value FROM Holdings WHERE portfolio='cc9' ORDER BY symbol ASC");
  console.log(`Holdings in DB for cc9 (${holdings.rows.length}):`);
  holdings.rows.forEach(h => {
    console.log(`${h.symbol.padEnd(20)} | ISIN: ${String(h.isin).padEnd(14)} | Qty: ${String(h.quantity).padStart(8)} | Avg Cost: ${String(h.avg_buy_price).padStart(10)} | Total Cost: ${String(h.total_cost).padStart(12)} | LTP: ${String(h.ltp).padStart(10)} | Val: ${String(h.current_value).padStart(12)}`);
  });
}
check();
