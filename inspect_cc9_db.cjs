const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function run() {
  const tableInfo = await db.execute("PRAGMA table_info(Holdings)");
  console.log("Holdings columns:", tableInfo.rows.map(r => r.name));

  const h = await db.execute("SELECT * FROM Holdings WHERE portfolio='cc9'");
  console.log(`Total Holdings in DB for cc9: ${h.rows.length}`);
  
  const txSummary = await db.execute("SELECT type, count(*) as count, sum(net_amount) as total_net FROM Transactions WHERE portfolio='cc9' GROUP BY type ORDER BY type ASC");
  console.log('\n--- Transactions Summary for cc9 ---');
  txSummary.rows.forEach(r => console.log(`${String(r.type).padEnd(20)} Count: ${String(r.count).padStart(5)} | Total Net: ${String(r.total_net).padStart(15)}`));
  
  const meta = await db.execute("SELECT DISTINCT source, count(*) as count FROM Transactions WHERE portfolio='cc9' GROUP BY source");
  console.log('\n--- Sources for cc9 Transactions ---', meta.rows);

  const dates = await db.execute("SELECT min(date) as min_date, max(date) as max_date FROM Transactions WHERE portfolio='cc9'");
  console.log('\n--- Transaction Date Range for cc9 ---', dates.rows[0]);
}

run().catch(console.error);
