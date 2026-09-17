const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  
  console.log("=== CHECKING ALL TABLES FOR RNFI / INE0SA001017 / INE08GI01012 / INE08KJ01020 ===");
  
  // 1. Check all holdings in DB
  const allH = await db.execute("SELECT portfolio, symbol, isin, quantity, avg_buy_price, current_value FROM Holdings WHERE symbol LIKE '%RNFI%' OR isin IN ('INE0SA001017', 'INE08GI01012', 'INE08KJ01020')");
  console.log("Holdings across all portfolios:", allH.rows);

  // 2. Check all transactions across all portfolios
  const allTx = await db.execute("SELECT portfolio, count(*) as count, sum(case when type LIKE '%BUY%' then quantity else -quantity end) as net_qty FROM Transactions WHERE symbol LIKE '%RNFI%' OR isin IN ('INE0SA001017', 'INE08GI01012', 'INE08KJ01020') GROUP BY portfolio");
  console.log("Transactions across all portfolios:", allTx.rows);

  // 3. Check if any other portfolio in ZerodhaHoldings
  const allZh = await db.execute("SELECT portfolio, symbol, isin, quantity FROM ZerodhaHoldings WHERE symbol LIKE '%RNFI%' OR isin IN ('INE0SA001017', 'INE08GI01012', 'INE08KJ01020')");
  console.log("ZerodhaHoldings across all portfolios:", allZh.rows);

  // 4. Check what INE08GI01012 is
  const unl = await db.execute("SELECT * FROM MasterTickers WHERE isin = 'INE08GI01012'");
  console.log("MasterTicker for INE08GI01012:", unl.rows);

  process.exit(0);
}

main().catch(console.error);
