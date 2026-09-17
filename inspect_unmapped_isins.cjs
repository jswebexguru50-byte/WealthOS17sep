const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const isins = [
    'INE08GI01012',
    'INE0T0H01020',
    'INE103001017',
    'INE08KJ01020',
    'INF162422184',
    'INF162422218',
    'INE869Y01028',
    'INE0SA001017'
  ];

  console.log("=== CHECKING MASTER TICKERS & TRANSACTIONS FOR ISINS ===");
  for (const isin of isins) {
    const mt = await db.execute({ sql: "SELECT * FROM MasterTickers WHERE isin = ?", args: [isin] });
    const tx = await db.execute({ sql: "SELECT portfolio, type, symbol, quantity, price, date FROM Transactions WHERE isin = ? OR symbol = ? LIMIT 5", args: [isin, isin] });
    console.log(`\nISIN: ${isin}`);
    console.log('MasterTicker:', mt.rows);
    console.log('Transactions:', tx.rows);
  }

  // Check TEMBO transactions for Maa
  const temboTx = await db.execute("SELECT date, type, quantity, price, gross_amount FROM Transactions WHERE portfolio='Maa' AND (symbol LIKE '%TEMBO%' OR isin='INE869Y01028') ORDER BY date DESC LIMIT 10");
  console.log('\n=== TEMBO Transactions in Maa ===');
  console.log(temboTx.rows);

  // Check RNFI transactions for Maa
  const rnfiTx = await db.execute("SELECT date, type, symbol, isin, quantity, price, gross_amount FROM Transactions WHERE portfolio='Maa' AND (symbol LIKE '%RNFI%' OR isin LIKE '%RNFI%' OR isin='INE0SA001017' OR isin='INE08KJ01020' OR isin='INE08GI01012') ORDER BY date DESC LIMIT 10");
  console.log('\n=== RNFI Transactions in Maa ===');
  console.log(rnfiTx.rows);

  process.exit(0);
}

main().catch(console.error);
