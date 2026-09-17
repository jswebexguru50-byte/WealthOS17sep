const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const holdings = await db.execute("SELECT * FROM Holdings WHERE portfolio = 'US - IBKR'");
  console.log("=== US - IBKR HOLDINGS IN DB ===");
  for (const h of holdings.rows) {
    console.log(h);
  }

  const mt = await db.execute("SELECT * FROM MasterTickers WHERE symbol IN ('QQQ', 'SCHG', 'VGT', 'VOO')");
  console.log("\n=== US - IBKR MASTERTICKERS ===");
  for (const m of mt.rows) {
    console.log(m);
  }

  process.exit(0);
}

main().catch(console.error);
