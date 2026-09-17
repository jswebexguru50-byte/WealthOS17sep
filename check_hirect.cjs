const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function checkHirect() {
  const tx = await db.execute("SELECT id, date, type, symbol, isin, quantity, price, net_amount, notes, source FROM Transactions WHERE portfolio='cc9' AND (symbol LIKE '%HIRECT%' OR notes LIKE '%HIRECT%' OR isin='INE447A01017') ORDER BY date ASC");
  console.log(`HIRECT transactions for cc9 (${tx.rows.length}):`);
  tx.rows.forEach(r => console.log(JSON.stringify(r)));
}
checkHirect();
