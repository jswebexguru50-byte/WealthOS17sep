const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  
  // Check INVICTA in Transactions for Maa
  const inv = await db.execute("SELECT * FROM Transactions WHERE portfolio='Maa' AND (symbol LIKE '%INVICTA%' OR isin LIKE '%INVICTA%')");
  console.log('INVICTA transactions in Maa:', inv.rows);

  // Check SBIFUN in Transactions for cc9
  const sbi = await db.execute("SELECT * FROM Transactions WHERE portfolio='cc9' AND (symbol LIKE '%SBIFUN%' OR isin LIKE '%SBIFUN%')");
  console.log('SBIFUN transactions in cc9:', sbi.rows);

  process.exit(0);
}

main().catch(console.error);
