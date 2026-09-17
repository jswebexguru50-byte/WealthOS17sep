const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  
  console.log("=== ALL TRANSACTIONS FOR US - IBKR ===");
  const tx = await db.execute("SELECT id, date, type, symbol, quantity, price, gross_amount, net_amount, notes FROM Transactions WHERE portfolio = 'US - IBKR' ORDER BY symbol, date ASC");
  
  const bySym = {};
  for (const t of tx.rows) {
    if (!bySym[t.symbol]) bySym[t.symbol] = [];
    bySym[t.symbol].push(t);
  }

  for (const [sym, rows] of Object.entries(bySym)) {
    console.log(`\n--- Symbol: ${sym} (${rows.length} transactions) ---`);
    rows.forEach(r => console.log(`ID ${r.id} | ${r.date} | ${r.type.padEnd(10)} | Qty: ${r.quantity} | Price: $${r.price} | Net: $${r.net_amount} | Notes: ${r.notes}`));
  }

  process.exit(0);
}

main().catch(console.error);
