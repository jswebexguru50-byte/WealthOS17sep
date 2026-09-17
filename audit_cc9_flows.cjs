const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  console.log('=== 1. CHECK ALL WITHDRAWAL / OUT / NEGATIVE CASHFLOW IN CC9 ===');
  const allOut = await db.execute(`
    SELECT id, date, type, symbol, quantity, price, gross_amount, net_amount, notes, source, batch_id, is_ca, is_cash_flow
    FROM Transactions
    WHERE portfolio='cc9'
      AND (
        UPPER(type) LIKE '%WITHDRAW%' 
        OR UPPER(type) LIKE '%OUT%' 
        OR UPPER(notes) LIKE '%WITHDRAW%'
        OR UPPER(notes) LIKE '%CASH OUT%'
        OR UPPER(notes) LIKE '%RETURN%'
        OR UPPER(notes) LIKE '%PAYOUT%'
      )
    ORDER BY date ASC
  `);
  console.log(`Found ${allOut.rows.length} rows:`);
  allOut.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== 2. CHECK ALL TRANSACTIONS WITH is_cash_flow = 1 IN CC9 ===');
  const cashFlows = await db.execute(`
    SELECT id, date, type, symbol, quantity, price, net_amount, notes, source, batch_id, is_ca
    FROM Transactions
    WHERE portfolio='cc9' AND is_cash_flow = 1
    ORDER BY date ASC
  `);
  console.log(`Total is_cash_flow=1 rows: ${cashFlows.rows.length}`);
  const cfByType = {};
  cashFlows.rows.forEach(r => {
    cfByType[r.type] = (cfByType[r.type] || 0) + 1;
  });
  console.log('Counts by type with is_cash_flow=1:', cfByType);

  console.log('\n=== 3. CHECK ALL DEPOSITS IN CC9 ===');
  const dep = await db.execute("SELECT id, date, type, net_amount, notes, source, batch_id FROM Transactions WHERE portfolio='cc9' AND UPPER(type)='DEPOSIT' ORDER BY date ASC");
  dep.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== 4. CHECK DUPLICATE BATCHES (PMS-1787815999863 vs PMS-RECON-1786807141134) ===');
  // Check if there are overlapping transactions in cc9
  const t1 = await db.execute("SELECT id, date, type, symbol, quantity, price, net_amount, source, batch_id FROM Transactions WHERE portfolio='cc9' AND batch_id='PMS-1787815999863' LIMIT 10");
  console.log('Sample from PMS-1787815999863:');
  t1.rows.forEach(r => console.log(JSON.stringify(r)));

  const t2 = await db.execute("SELECT id, date, type, symbol, quantity, price, net_amount, source, batch_id FROM Transactions WHERE portfolio='cc9' AND batch_id='PMS-RECON-1786807141134' AND symbol='TATAMOTORS' LIMIT 10");
  console.log('Sample TATAMOTORS from PMS-RECON-1786807141134:');
  t2.rows.forEach(r => console.log(JSON.stringify(r)));
}

main().catch(console.error);
