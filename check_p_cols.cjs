const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:./portfolio.db' });
async function run() {
  const pCols = await db.execute("PRAGMA table_info(Portfolios)");
  console.log("Portfolios columns:", pCols.rows.map(r => r.name).join(', '));
}
run();
