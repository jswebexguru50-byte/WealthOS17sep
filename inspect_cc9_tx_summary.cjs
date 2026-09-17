const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  console.log('=== PORTFOLIO ROW ===');
  const p = await db.execute("SELECT * FROM Portfolios WHERE name='cc9'");
  console.log(p.rows);

  console.log('\n=== TRANSACTION TYPE GROUPING ===');
  const txs = await db.execute(`
    SELECT type, source, is_ca, is_cash_flow, count(1) as cnt, sum(net_amount) as total_net
    FROM Transactions WHERE portfolio='cc9'
    GROUP BY type, source, is_ca, is_cash_flow
  `);
  txs.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== DEPOSITS ===');
  const dep = await db.execute("SELECT id, date, type, net_amount, notes, source, batch_id FROM Transactions WHERE portfolio='cc9' AND UPPER(type)='DEPOSIT'");
  dep.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== WITHDRAWALS / TRANSFERS OUT ===');
  const out = await db.execute("SELECT id, date, type, symbol, quantity, price, net_amount, notes, source, batch_id, is_ca, is_cash_flow FROM Transactions WHERE portfolio='cc9' AND (UPPER(type) LIKE '%WITHDRAW%' OR UPPER(type) LIKE '%OUT%')");
  out.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== SECURITY IN / TRANSFER IN (Grouped by batch_id and source) ===');
  const secIn = await db.execute(`
    SELECT source, batch_id, type, is_ca, is_cash_flow, count(1) as cnt, sum(net_amount) as total_net, min(date) as min_date, max(date) as max_date
    FROM Transactions WHERE portfolio='cc9' AND (UPPER(type) LIKE '%SECURITY IN%' OR UPPER(type) LIKE '%TRANSFER IN%')
    GROUP BY source, batch_id, type, is_ca, is_cash_flow
  `);
  secIn.rows.forEach(r => console.log(JSON.stringify(r)));
}

main().catch(console.error);
