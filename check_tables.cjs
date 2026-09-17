const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function checkTables() {
  const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
  console.log("Tables in DB:", tables.rows.map(r => r.name));
}
checkTables();
