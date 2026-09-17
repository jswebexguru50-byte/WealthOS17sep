const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  const sm = await db.execute("SELECT * FROM ScripMappings WHERE portfolio='cc9' OR portfolio IS NULL OR portfolio='ALL'");
  console.log('=== ScripMappings count: ' + sm.rows.length + ' ===');
  sm.rows.forEach(r => console.log(JSON.stringify(r)));

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
