const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  const batches = [
    'PMS-1787815999863',
    'PMS-1787545402209',
    'PMS-1787816166077',
    'PMS-1787119545906',
    'PMS-1787079145979',
    'PMS-1787545370982'
  ];

  for (const b of batches) {
    console.log(`\n================ BATCH ${b} ================`);
    const r = await db.execute({
      sql: `SELECT type, symbol, count(1) as cnt, sum(quantity) as qty, sum(net_amount) as net, min(date) as min_d, max(date) as max_d 
            FROM Transactions WHERE portfolio='cc9' AND batch_id=? 
            GROUP BY type, symbol ORDER BY min(date)`,
      args: [b]
    });
    r.rows.forEach(row => console.log(JSON.stringify(row)));
  }
}

main().catch(console.error);
