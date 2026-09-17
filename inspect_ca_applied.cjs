const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  const caTxs = await db.execute("SELECT * FROM Transactions WHERE portfolio='cc9' AND (is_ca=1 OR source LIKE '%CA%')");
  console.log('=== SYSTEM CA TRANSACTIONS IN CC9 ===');
  caTxs.rows.forEach(r => console.log(JSON.stringify(r)));

  // Check JTLIND in CorporateActions table
  const jtlCa = await db.execute("SELECT * FROM CorporateActions WHERE symbol='JTLIND'");
  console.log('\n=== JTLIND CORPORATE ACTIONS ===');
  jtlCa.rows.forEach(r => console.log(JSON.stringify(r)));

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
