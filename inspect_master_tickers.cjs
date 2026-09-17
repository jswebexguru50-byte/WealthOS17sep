const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  const mt = await db.execute("SELECT * FROM MasterTickers WHERE symbol IN ('GROWW', 'BGVL', 'ETERNAL', 'HIRECT', 'BAJFINANCE', 'LT', 'FRATELLI', 'BLUEJET', 'SBIFUN')");
  console.log('=== MasterTickers ===');
  mt.rows.forEach(r => console.log(JSON.stringify(r)));

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
