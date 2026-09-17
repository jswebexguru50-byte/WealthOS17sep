const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const r = await db.execute("SELECT symbol, quantity, avg_buy_price, total_cost, tax_avg_price, tax_cost_basis FROM Holdings WHERE portfolio='cc9' ORDER BY symbol");
  console.log('=== CC9 HOLDINGS: PMS COST (TRANSFER PRICE) VS TAX COST BASIS (ORIGINAL PURCHASE PRICE) ===');
  r.rows.forEach(row => {
    console.log(`${row.symbol.padEnd(12)} | Qty: ${String(row.quantity).padStart(5)} | PMS Avg Price: ${String(row.avg_buy_price).padStart(8)} | Tax Avg Price: ${String(row.tax_avg_price || 'N/A').padStart(8)} | Tax Cost Basis: ₹${Number(row.tax_cost_basis || 0).toLocaleString('en-IN')}`);
  });
  process.exit(0);
}

main().catch(console.error);
