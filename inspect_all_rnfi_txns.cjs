const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  
  // List all RNFI transactions in Maa
  const allTx = await db.execute("SELECT id, date, type, symbol, quantity, price, gross_amount FROM Transactions WHERE portfolio='Maa' AND symbol='RNFI' ORDER BY date ASC, id ASC");
  console.log("=== ALL RNFI TRANSACTIONS IN MAA ===");
  allTx.rows.forEach(t => {
    console.log(`[ID ${String(t.id).padStart(6)}] ${t.date} | ${t.type.padEnd(4)} | Qty: ${String(t.quantity).padStart(6)} | Price: ${String(t.price).padStart(7)} | Amt: ${t.gross_amount}`);
  });

  process.exit(0);
}

main().catch(console.error);
