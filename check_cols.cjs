const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function check() {
  const mt = await db.execute("PRAGMA table_info(MasterTickers)");
  console.log("MasterTickers columns:", mt.rows.map(r => r.name));
  const sm = await db.execute("PRAGMA table_info(ScripMappings)");
  console.log("ScripMappings columns:", sm.rows.map(r => r.name));
}
check();
