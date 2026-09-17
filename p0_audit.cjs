/**
 * P0 Fix Script — Comprehensive Data Quality Fixes
 * Fixes:
 *   1. HIRECT qty in cc9 (short 450 shares vs statement)
 *   2. BAJFINANCE avg cost investigation (808 vs 527)
 *   3. Maa orphan holdings audit (SJLOGISTIC, TEMBO, MUFIN)
 *   4. Transaction type normalization check
 *   5. Capital Invested calculation diagnosis (TRANSFER IN issue)
 */
const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function run() {
  console.log("=== P0 Data Quality Audit ===\n");

  // ── 1. HIRECT: Current state
  const hirect = await db.execute("SELECT symbol, quantity, avg_buy_price, total_cost FROM Holdings WHERE portfolio='cc9' AND symbol='HIRECT'");
  console.log("1. HIRECT in DB:", hirect.rows[0]);
  // Statement says 2400, DB has 1950 => need +450
  const hirectSplit = await db.execute("SELECT * FROM Transactions WHERE portfolio='cc9' AND symbol='HIRECT' AND UPPER(type)='SPLIT'");
  console.log("   HIRECT SPLIT tx:", hirectSplit.rows);

  // ── 2. BAJFINANCE: All transactions to understand the cost basis discrepancy
  const bajfin = await db.execute("SELECT id, date, type, quantity, price, net_amount, source FROM Transactions WHERE portfolio='cc9' AND symbol='BAJFINANCE' ORDER BY date ASC");
  console.log("\n2. BAJFINANCE transactions (cc9):");
  let runQty = 0;
  let runCost = 0;
  bajfin.rows.forEach(r => {
    const type = r.type.toUpperCase().trim();
    if (['BUY', 'TRANSFER IN', 'SECURITY IN'].includes(type)) {
      runQty += r.quantity;
      runCost += r.net_amount;
    } else if (['SELL', 'TRANSFER OUT'].includes(type)) {
      runQty -= r.quantity;
    }
    console.log(`   ${r.date} | ${r.type.padEnd(12)} | Qty: ${String(r.quantity).padStart(6)} | Price: ${String(r.price).padStart(8)} | NetAmt: ${String(r.net_amount).padStart(10)} | Source: ${r.source}`);
  });
  console.log(`   => FIFO Net Qty: ${runQty}, Total Cost: ${runCost}, Computed Avg: ${(runCost / runQty).toFixed(2)}`);
  console.log(`   => DB Avg: ${hirect.rows[0] ? '' : ''}`);
  const bajDb = await db.execute("SELECT avg_buy_price, total_cost, quantity FROM Holdings WHERE portfolio='cc9' AND symbol='BAJFINANCE'");
  console.log("   => DB Holdings:", bajDb.rows[0]);

  // ── 3. Maa orphan holdings — full transaction history
  for (const sym of ['SJLOGISTIC', 'TEMBO', 'MUFIN']) {
    const h = await db.execute({sql: "SELECT symbol, isin, quantity, avg_buy_price, total_cost, current_value FROM Holdings WHERE portfolio='Maa' AND symbol=?", args: [sym]});
    const txs = await db.execute({sql: "SELECT date, type, quantity, price, net_amount, source FROM Transactions WHERE portfolio='Maa' AND symbol=? ORDER BY date ASC", args: [sym]});
    console.log(`\n3. MAA ORPHAN: ${sym}`);
    console.log("   Holdings:", h.rows[0]);
    console.log("   Transactions:", txs.rows.length);
    txs.rows.forEach(r => console.log(`     ${r.date} | ${r.type.padEnd(12)} | Qty: ${r.quantity} | Price: ${r.price} | Net: ${r.net_amount} | ${r.source}`));
  }

  // ── 4. Transaction type normalization scope
  const types = await db.execute("SELECT type, count(*) as cnt FROM Transactions GROUP BY type ORDER BY type");
  console.log("\n4. ALL TRANSACTION TYPES IN DB:");
  types.rows.forEach(r => console.log(`   '${r.type}' => ${r.cnt}`));

  // ── 5. Capital invested calc — what TRANSFER IN rows look like
  const tfrIn = await db.execute("SELECT DISTINCT source, notes, count(*) as cnt, sum(net_amount) as total FROM Transactions WHERE portfolio='cc9' AND UPPER(TRIM(type))='TRANSFER IN' GROUP BY source, notes ORDER BY total DESC LIMIT 10");
  console.log("\n5. cc9 TRANSFER IN by source/notes:");
  tfrIn.rows.forEach(r => console.log(`   source=${r.source} | notes=${r.notes} | count=${r.cnt} | total=₹${Math.round(r.total).toLocaleString('en-IN')}`));
  
  const deposits = await db.execute("SELECT DISTINCT type, source, count(*) as cnt, sum(net_amount) as total FROM Transactions WHERE portfolio='cc9' AND UPPER(TRIM(type))='DEPOSIT' GROUP BY type, source");
  console.log("   cc9 DEPOSIT rows:", deposits.rows);
}

run().catch(console.error);
