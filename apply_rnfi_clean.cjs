const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  
  // 1. Remove duplicate summary rows for RNFI
  await db.execute("DELETE FROM Transactions WHERE id IN (49978, 49979) AND symbol='RNFI' AND portfolio='Maa'");
  await db.execute("DELETE FROM Holdings WHERE portfolio='Maa' AND symbol='RNFI'");
  console.log("RNFI duplicate summary rows cleaned and holding updated.");

  process.exit(0);
}

main().catch(console.error);
