const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  const r = await db.execute(`
    SELECT type, count(1) as cnt, sum(net_amount) as total_net, min(date) as min_date, max(date) as max_date
    FROM Transactions
    WHERE batch_id='PMS-1787815999863'
    GROUP BY type
  `);
  console.log('PMS-1787815999863 breakdown:');
  r.rows.forEach(row => console.log(JSON.stringify(row)));

  const nonSec = await db.execute(`
    SELECT * FROM Transactions WHERE batch_id='PMS-1787815999863' AND UPPER(type) NOT IN ('SECURITY IN', 'SECURITY OUT')
  `);
  console.log('\nNon SECURITY IN/OUT transactions in PMS-1787815999863:');
  nonSec.rows.forEach(row => console.log(JSON.stringify(row)));
}

main().catch(console.error);
