const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  const batches = await db.execute(`
    SELECT batch_id, source, count(1) as cnt, sum(net_amount) as total_net, min(date) as min_date, max(date) as max_date
    FROM Transactions 
    WHERE portfolio='cc9'
    GROUP BY batch_id, source
    ORDER BY count(1) DESC
  `);
  console.log('=== ALL BATCHES SUMMARY FOR cc9 ===');
  batches.rows.forEach(r => console.log(JSON.stringify(r)));
}

main().catch(console.error);
