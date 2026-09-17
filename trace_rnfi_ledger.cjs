const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  
  // 1. Fetch all transactions for RNFI in Maa
  const tx = await db.execute("SELECT id, date, type, symbol, isin, quantity, price FROM Transactions WHERE portfolio='Maa' AND symbol='RNFI' ORDER BY date ASC, id ASC");
  console.log(`Total RNFI transactions in Maa: ${tx.rows.length}`);
  
  let buys = 0;
  let sells = 0;
  tx.rows.forEach(t => {
    const q = Number(t.quantity || 0);
    const type = String(t.type || '').toUpperCase();
    if (type.includes('BUY')) buys += q;
    if (type.includes('SELL')) sells += q;
    console.log(`  ${t.date} | ${t.type.padEnd(5)} | Qty: ${String(t.quantity).padStart(6)} | CumBuys: ${String(buys).padStart(6)} | CumSells: ${String(sells).padStart(6)} | Net: ${buys - sells}`);
  });

  console.log(`\nFinal Net Quantity from Transactions: ${buys - sells}`);
  
  const h = await db.execute("SELECT * FROM Holdings WHERE symbol='RNFI'");
  console.log('\nHoldings row:', h.rows);

  process.exit(0);
}

main().catch(console.error);
