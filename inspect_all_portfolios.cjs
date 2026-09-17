const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const p = await db.execute("SELECT DISTINCT name, type FROM Portfolios ORDER BY name");
  console.log('=== PORTFOLIOS TABLE ===');
  p.rows.forEach(r => console.log(r));

  const h = await db.execute("SELECT portfolio, count(*) as count, sum(current_value) as val FROM Holdings GROUP BY portfolio ORDER BY portfolio");
  console.log('\n=== HOLDINGS PER PORTFOLIO ===');
  h.rows.forEach(r => console.log(r));

  const t = await db.execute("SELECT portfolio, count(*) as count, min(date) as min_date, max(date) as max_date FROM Transactions GROUP BY portfolio ORDER BY portfolio");
  console.log('\n=== TRANSACTIONS PER PORTFOLIO ===');
  t.rows.forEach(r => console.log(r));

  process.exit(0);
}

main().catch(console.error);
