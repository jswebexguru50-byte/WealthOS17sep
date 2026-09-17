const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const ca = await db.execute("SELECT * FROM CorporateActions WHERE symbol IN ('SCHG', 'VGT', 'VOO', 'QQQ')");
  console.log("CorporateActions for US tickers:", ca.rows);
  process.exit(0);
}

main().catch(console.error);
