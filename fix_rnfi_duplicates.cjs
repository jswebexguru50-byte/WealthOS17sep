const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  console.log("=== REMOVING DUPLICATE AGGREGATE SUMMARY TRANSACTIONS 49978 AND 49979 ===");
  
  const del = await db.execute("DELETE FROM Transactions WHERE id IN (49978, 49979) AND symbol='RNFI' AND portfolio='Maa'");
  console.log(`Deleted rows: ${del.rowsAffected}`);

  // Recalculate FIFO / Holdings for RNFI
  // Delete old RNFI holding if net is 0
  const tx = await db.execute("SELECT sum(case when type LIKE '%BUY%' then quantity else -quantity end) as net_qty FROM Transactions WHERE portfolio='Maa' AND symbol='RNFI'");
  const netQty = tx.rows[0].net_qty;
  console.log(`New Net Computed Quantity for RNFI in Maa: ${netQty}`);

  if (netQty === 0) {
    await db.execute("DELETE FROM Holdings WHERE portfolio='Maa' AND symbol='RNFI'");
    console.log("Successfully removed RNFI from Holdings (Quantity is 0).");
  } else {
    await db.execute({
      sql: "UPDATE Holdings SET quantity = ? WHERE portfolio='Maa' AND symbol='RNFI'",
      args: [netQty]
    });
  }

  process.exit(0);
}

main().catch(console.error);
