const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  const ca = await db.execute("SELECT * FROM CorporateActions WHERE symbol IN ('JTLIND', 'TIMETECHNO', 'ITCHOTELS', 'ITC', 'BAJFINANCE', 'HIRECT', 'TATAMOTORS')");
  console.log('=== CORPORATE ACTIONS FOR SYMBOLS ===');
  ca.rows.forEach(r => console.log(JSON.stringify(r)));

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
