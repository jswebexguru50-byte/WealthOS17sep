const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function investigateCorporateActions() {
  console.log("=== CORPORATE ACTION INVESTIGATION: HIRECT & BAJFINANCE ===\n");

  // ─── 1. Check CorporateActions table structure
  const cols = await db.execute("PRAGMA table_info(CorporateActions)");
  console.log("CorporateActions columns:", cols.rows.map(r => r.name).join(', '));

  // ─── 2. All corporate actions for HIRECT
  console.log("\n─────────────────────────────────────────────────────────────");
  console.log("HIRECT (INE447A01017) — CORPORATE ACTIONS");
  console.log("─────────────────────────────────────────────────────────────");
  const hirectCA = await db.execute(
    "SELECT * FROM CorporateActions WHERE symbol='HIRECT' OR isin='INE447A01017' ORDER BY ex_date ASC"
  );
  console.log(`Found ${hirectCA.rows.length} corporate actions`);
  hirectCA.rows.forEach(r => console.log(JSON.stringify(r)));

  // ─── 3. All HIRECT transactions incl SPLIT/BONUS
  console.log("\nAll HIRECT transactions (cc9):");
  const hirectTx = await db.execute(
    "SELECT id, date, type, symbol, quantity, price, net_amount, notes, source FROM Transactions WHERE portfolio='cc9' AND (symbol='HIRECT' OR isin='INE447A01017') ORDER BY date ASC"
  );
  let netQty = 0;
  hirectTx.rows.forEach(r => {
    const t = r.type.toUpperCase().trim();
    if (['BUY','TRANSFER IN','SECURITY IN','BONUS','SPLIT'].includes(t)) netQty += r.quantity;
    else if (['SELL','TRANSFER OUT','SECURITY OUT'].includes(t)) netQty -= r.quantity;
    console.log(`  ${r.date} | ${r.type.padEnd(14)} | Qty: ${String(r.quantity).padStart(7)} | Price: ${String(r.price).padStart(8)} | runQty: ${netQty} | notes: ${r.notes || ''}`);
  });
  console.log(`\n  => DB HOLDINGS QTY: 1949.9999 | Calculated net: ${netQty}`);
  console.log(`  => STATEMENT QTY: 2400`);
  console.log(`  => DISCREPANCY: ${2400 - netQty} shares`);

  // ─── 4. Check CorporateActionAudit for HIRECT
  console.log("\nCorporateActionAudit for HIRECT:");
  const hirectAudit = await db.execute(
    "SELECT * FROM CorporateActionAudit WHERE symbol='HIRECT' OR isin='INE447A01017' ORDER BY rowid ASC LIMIT 20"
  );
  hirectAudit.rows.forEach(r => console.log(JSON.stringify(r)));

  // ─── 5. BAJFINANCE — all corporate actions
  console.log("\n─────────────────────────────────────────────────────────────");
  console.log("BAJFINANCE (INE296A01024) — CORPORATE ACTIONS");
  console.log("─────────────────────────────────────────────────────────────");
  const bajCA = await db.execute(
    "SELECT * FROM CorporateActions WHERE symbol='BAJFINANCE' OR isin='INE296A01024' ORDER BY ex_date ASC"
  );
  console.log(`Found ${bajCA.rows.length} corporate actions`);
  bajCA.rows.forEach(r => console.log(JSON.stringify(r)));

  // ─── 6. All BAJFINANCE transactions in cc9 - full FIFO trace
  console.log("\nBAJFINANCE All Transactions (cc9):");
  const bajTx = await db.execute(
    "SELECT id, date, type, quantity, price, net_amount, notes, source, is_ca FROM Transactions WHERE portfolio='cc9' AND symbol='BAJFINANCE' ORDER BY date ASC"
  );
  let bajNetQty = 0;
  let bajTotalCost = 0;
  bajTx.rows.forEach(r => {
    const t = r.type.toUpperCase().trim();
    if (['BUY','TRANSFER IN','SECURITY IN'].includes(t)) {
      bajNetQty += r.quantity;
      bajTotalCost += (r.net_amount || 0);
    } else if (['BONUS'].includes(t)) {
      bajNetQty += r.quantity;
      // Bonus doesn't add cost
    } else if (['SPLIT'].includes(t)) {
      // Split adjusts qty without cost
      bajNetQty += r.quantity;
    } else if (['SELL','TRANSFER OUT','SECURITY OUT'].includes(t)) {
      bajNetQty -= r.quantity;
    }
    console.log(`  ${r.date} | ${r.type.padEnd(14)} | Qty: ${String(r.quantity).padStart(8)} | Price: ${String(r.price || 0).padStart(10)} | Net: ${String(r.net_amount || 0).padStart(12)} | is_ca: ${r.is_ca} | notes: ${r.notes || ''} | runQty: ${Math.round(bajNetQty)}`);
  });

  const computedAvg = bajNetQty > 0 ? bajTotalCost / bajNetQty : 0;
  console.log(`\n  => Calculated Net Qty: ${bajNetQty}`);
  console.log(`  => Calculated Total Cost: ₹${Math.round(bajTotalCost).toLocaleString('en-IN')}`);
  console.log(`  => Calculated Avg Cost: ₹${computedAvg.toFixed(2)}`);
  
  const bajDb = await db.execute("SELECT quantity, avg_buy_price, total_cost FROM Holdings WHERE portfolio='cc9' AND symbol='BAJFINANCE'");
  console.log(`  => DB Holdings Qty: ${bajDb.rows[0]?.quantity}`);
  console.log(`  => DB Avg Buy Price: ₹${bajDb.rows[0]?.avg_buy_price}`);
  console.log(`  => DB Total Cost: ₹${Math.round(bajDb.rows[0]?.total_cost).toLocaleString('en-IN')}`);
  console.log(`  => Statement Avg Cost: ₹527.19 (Unit Cost from cc9 statement)`);
  console.log(`  => Statement Total Cost: ₹606,270 (from cc9 statement)`);

  // ─── 7. CorporateActionAudit for BAJFINANCE
  console.log("\nCorporateActionAudit for BAJFINANCE:");
  const bajAudit = await db.execute(
    "SELECT * FROM CorporateActionAudit WHERE symbol='BAJFINANCE' OR isin='INE296A01024' ORDER BY rowid ASC LIMIT 20"
  );
  bajAudit.rows.forEach(r => console.log(JSON.stringify(r)));

  // ─── 8. Look for any bonus/split events in MasterTickers or historical data
  console.log("\nMasterTickers entry for BAJFINANCE:");
  const bajMT = await db.execute("SELECT * FROM MasterTickers WHERE symbol='BAJFINANCE'");
  bajMT.rows.forEach(r => console.log(JSON.stringify(r)));
  
  console.log("\nMasterTickers entry for HIRECT:");
  const hirectMT = await db.execute("SELECT * FROM MasterTickers WHERE symbol='HIRECT'");
  hirectMT.rows.forEach(r => console.log(JSON.stringify(r)));
}

investigateCorporateActions().catch(console.error);
