const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  const batches = await db.execute(`
    SELECT batch_id, source, type, count(1) as cnt, sum(net_amount) as total_net, min(date) as min_date, max(date) as max_date
    FROM Transactions 
    WHERE portfolio='cc9'
    GROUP BY batch_id, source, type
    ORDER BY batch_id, type
  `);
  console.log('=== ALL BATCHES FOR cc9 ===');
  batches.rows.forEach(r => console.log(JSON.stringify(r)));

  // Check ActionHistory for cc9
  const actions = await db.execute(`
    SELECT * FROM ActionHistory WHERE description LIKE '%cc9%' OR batch_id LIKE '%cc9%' OR batch_id LIKE '%1786807141134%' OR batch_id LIKE '%1787815999863%'
    ORDER BY timestamp DESC
  `);
  console.log('\n=== ACTION HISTORY ===');
  actions.rows.forEach(r => console.log(JSON.stringify(r)));
}

main().catch(console.error);
