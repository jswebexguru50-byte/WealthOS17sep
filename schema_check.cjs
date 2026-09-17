const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});
async function run() {
  const cols = await db.execute('PRAGMA table_info(Holdings)');
  console.log('Holdings columns:', cols.rows.map(r => r.name).join(', '));
  
  const txCols = await db.execute('PRAGMA table_info(Transactions)');
  console.log('Transactions columns:', txCols.rows.map(r => r.name).join(', '));
  
  const pmsCapital = await db.execute("SELECT symbol, sum(quantity) as qty, sum(net_amount) as mkt_cost FROM Transactions WHERE portfolio='cc9' AND UPPER(TRIM(type))='TRANSFER IN' AND source='PMS' GROUP BY symbol ORDER BY mkt_cost DESC");
  console.log('\ncc9 TRANSFER IN by symbol (mkt-rate PMS capital):');
  pmsCapital.rows.slice(0,15).forEach(r => console.log(`  ${r.symbol}: qty=${r.qty}, mkt_cost=₹${Math.round(r.mkt_cost).toLocaleString('en-IN')}`));
  
  const totalPMS = await db.execute("SELECT sum(net_amount) as total FROM Transactions WHERE portfolio='cc9' AND UPPER(TRIM(type))='TRANSFER IN' AND source='PMS'");
  const totalCash = await db.execute("SELECT sum(net_amount) as total FROM Transactions WHERE portfolio='cc9' AND UPPER(TRIM(type))='DEPOSIT'");
  console.log('\ncc9 Total PMS capital at market-rate transfer:', Math.round(totalPMS.rows[0].total).toLocaleString('en-IN'));
  console.log('cc9 Cash deposits:', Math.round(totalCash.rows[0].total).toLocaleString('en-IN'));
}
run().catch(console.error);
