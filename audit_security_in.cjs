const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function check() {
  const r1 = await db.execute(`
    SELECT count(*) as total_rows,
           sum(net_amount) as sum_net,
           sum(quantity * price) as sum_calc,
           sum(gross_amount) as sum_gross
    FROM Transactions 
    WHERE portfolio='cc9' AND type IN ('TRANSFER IN', 'SECURITY IN') AND date IN ('2023-10-11', '2023-10-13')
  `);
  console.log("Inception Summary:", r1.rows[0]);

  // Let's also check all DEPOSITs in cc9
  const deposits = await db.execute(`
    SELECT id, date, type, symbol, net_amount, notes, source
    FROM Transactions
    WHERE portfolio='cc9' AND type='DEPOSIT'
    ORDER BY date ASC
  `);
  console.log("\nAll DEPOSITs:", JSON.stringify(deposits.rows, null, 2));
}

check();
