const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const r = await db.execute("SELECT type, is_cash_flow, is_ca, count(1) as cnt, sum(net_amount) as total FROM Transactions WHERE portfolio='cc9' GROUP BY type, is_cash_flow, is_ca");
  r.rows.forEach(row => console.log(JSON.stringify(row)));
  process.exit(0);
}

main().catch(console.error);
