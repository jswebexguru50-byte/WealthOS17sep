const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function main() {
  // 1. Check all BANKBOOK-sourced transactions for cc9
  console.log('=== ALL BANKBOOK TRANSACTIONS FOR cc9 ===');
  const bankbook = await db.execute(
    "SELECT date, type, net_amount, notes, symbol FROM Transactions WHERE portfolio='cc9' AND source='BANKBOOK' ORDER BY date ASC"
  );
  console.log(`Total bankbook rows: ${bankbook.rows.length}`);
  bankbook.rows.forEach(r => console.log(JSON.stringify(r)));

  // 2. Specifically look for any WITHDRAWAL in bankbook
  console.log('\n=== BANKBOOK WITHDRAWAL / TRANSFER OUT / SECURITY OUT ===');
  const withdrawals = await db.execute(
    "SELECT date, type, net_amount, notes, symbol, source FROM Transactions WHERE portfolio='cc9' AND UPPER(type) IN ('WITHDRAWAL','TRANSFER OUT','SECURITY OUT','SECURITY_OUT','TRANSFER_OUT') ORDER BY date ASC"
  );
  console.log(`Count: ${withdrawals.rows.length}`);
  withdrawals.rows.forEach(r => console.log(JSON.stringify(r)));

  // 3. Show all TRANSFER IN / TRANSFER OUT in the DB for cc9 with their source
  console.log('\n=== ALL TRANSFER IN / TRANSFER OUT (any source) for cc9 ===');
  const transfers = await db.execute(
    "SELECT date, type, net_amount, quantity, price, notes, source, batch_id FROM Transactions WHERE portfolio='cc9' AND UPPER(type) IN ('TRANSFER IN','TRANSFER OUT','SECURITY IN','SECURITY OUT') ORDER BY date ASC"
  );
  console.log(`Count: ${transfers.rows.length}`);
  transfers.rows.forEach(r => console.log(JSON.stringify(r)));

  // 4. Bank book summary by type
  console.log('\n=== BANKBOOK SUMMARY BY TYPE ===');
  const summary = await db.execute(
    "SELECT type, COUNT(*) as cnt, SUM(net_amount) as total FROM Transactions WHERE portfolio='cc9' AND source='BANKBOOK' GROUP BY type ORDER BY type"
  );
  summary.rows.forEach(r => console.log(JSON.stringify(r)));

  // 5. PMS source summary 
  console.log('\n=== PMS SOURCE SUMMARY BY TYPE ===');
  const pmsSummary = await db.execute(
    "SELECT type, COUNT(*) as cnt, SUM(net_amount) as total FROM Transactions WHERE portfolio='cc9' AND source='PMS' GROUP BY type ORDER BY type"
  );
  pmsSummary.rows.forEach(r => console.log(JSON.stringify(r)));
}

main().catch(console.error).finally(() => process.exit(0));
