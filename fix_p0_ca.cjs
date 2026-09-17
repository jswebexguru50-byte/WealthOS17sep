/**
 * P0 Fix Script — HIRECT & BAJFINANCE
 * 
 * HIRECT: Holdings qty is stale (1950 from split processor); recompute from tx ledger → 2400
 * BAJFINANCE: Investigate cost basis discrepancy; compare against cc9 statement CSV
 */
const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function computeHoldingFromTxns(portfolio, symbol) {
  const txs = await db.execute({
    sql: "SELECT date, type, quantity, price, net_amount, is_ca FROM Transactions WHERE portfolio=? AND symbol=? ORDER BY date ASC",
    args: [portfolio, symbol]
  });

  let netQty = 0;
  let totalCost = 0;
  
  txs.rows.forEach(r => {
    const t = (r.type || '').toUpperCase().trim();
    const qty = Number(r.quantity || 0);
    const cost = Number(r.net_amount || 0);
    
    if (['BUY', 'TRANSFER IN', 'IPO / RIGHTS', 'SECURITY IN'].includes(t)) {
      netQty += qty;
      totalCost += cost;
    } else if (t === 'BONUS') {
      netQty += qty;
      // Bonus does NOT add to cost
    } else if (t === 'SPLIT') {
      netQty += qty;
      // Split does NOT add to cost
    } else if (['SELL', 'TRANSFER OUT', 'SECURITY OUT', 'WRITE OFF', 'BUYBACK', 'SELL OFF-MARKET'].includes(t)) {
      // Remove from qty; FIFO-avg: remove proportional cost
      const avgCostBeforeSell = netQty > 0 ? totalCost / netQty : 0;
      const costReduction = avgCostBeforeSell * qty;
      netQty -= qty;
      totalCost -= costReduction;
    }
  });

  const avgCost = netQty > 0 ? totalCost / netQty : 0;
  return { netQty, totalCost, avgCost, txCount: txs.rows.length };
}

async function fix() {
  console.log("=== P0 FIX SCRIPT ===\n");

  // ─────────────────────────────────────────────────────────────
  // PART 1: HIRECT — recompute from transaction ledger
  // ─────────────────────────────────────────────────────────────
  console.log("HIRECT — Computing from transaction ledger...");
  const hirect = await computeHoldingFromTxns('cc9', 'HIRECT');
  console.log(`  Computed Qty: ${Math.round(hirect.netQty)}`);
  console.log(`  Computed Total Cost: ₹${Math.round(hirect.totalCost).toLocaleString('en-IN')}`);
  console.log(`  Computed Avg Cost: ₹${hirect.avgCost.toFixed(4)}`);
  
  const hirectDb = await db.execute("SELECT quantity, avg_buy_price, total_cost FROM Holdings WHERE portfolio='cc9' AND symbol='HIRECT'");
  console.log(`  DB Current Qty: ${hirectDb.rows[0]?.quantity} | Avg: ₹${hirectDb.rows[0]?.avg_buy_price}`);
  console.log(`  Statement Qty:  2400`);

  if (Math.abs(hirect.netQty - 2400) < 5) {
    console.log("\n  ✅ Transaction ledger = Statement qty (2400). Fixing Holdings...");
    await db.execute({
      sql: "UPDATE Holdings SET quantity=?, avg_buy_price=?, total_cost=?, updated_at=CURRENT_TIMESTAMP WHERE portfolio='cc9' AND symbol='HIRECT'",
      args: [Math.round(hirect.netQty), hirect.avgCost, hirect.totalCost]
    });
    const verify = await db.execute("SELECT quantity, avg_buy_price, total_cost FROM Holdings WHERE portfolio='cc9' AND symbol='HIRECT'");
    console.log(`  ✅ HIRECT Updated → Qty: ${verify.rows[0].quantity} | Avg: ₹${Number(verify.rows[0].avg_buy_price).toFixed(2)} | TotalCost: ₹${Math.round(Number(verify.rows[0].total_cost)).toLocaleString('en-IN')}`);
  } else {
    console.log(`  ⚠️ Computed qty ${hirect.netQty} ≠ statement 2400. Manual review needed.`);
  }

  // ─────────────────────────────────────────────────────────────
  // PART 2: BAJFINANCE — deep investigation
  // ─────────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────────────────────────");
  console.log("BAJFINANCE — Deep Investigation");
  console.log("─────────────────────────────────────────────────────────────");

  const baj = await computeHoldingFromTxns('cc9', 'BAJFINANCE');
  console.log(`  Computed from TX ledger → Qty: ${Math.round(baj.netQty)} | Avg: ₹${baj.avgCost.toFixed(2)} | TotalCost: ₹${Math.round(baj.totalCost).toLocaleString('en-IN')}`);
  
  const bajDb = await db.execute("SELECT quantity, avg_buy_price, total_cost FROM Holdings WHERE portfolio='cc9' AND symbol='BAJFINANCE'");
  console.log(`  DB Holdings          → Qty: ${bajDb.rows[0]?.quantity} | Avg: ₹${Number(bajDb.rows[0]?.avg_buy_price).toFixed(2)} | TotalCost: ₹${Math.round(Number(bajDb.rows[0]?.total_cost)).toLocaleString('en-IN')}`);
  console.log(`  cc9 STATEMENT        → Qty: 1150 | Avg: ₹527.19 | TotalCost: ₹${(1150*527.19).toLocaleString('en-IN')}`);

  // Show the key buys that built up to 125 shares before bonus
  console.log("\n  All BAJFINANCE BUY transactions in cc9:");
  const bajBuys = await db.execute("SELECT date, type, quantity, price, net_amount FROM Transactions WHERE portfolio='cc9' AND symbol='BAJFINANCE' AND UPPER(TRIM(type)) IN ('BUY','TRANSFER IN') ORDER BY date ASC");
  let cumQty = 0, cumCost = 0;
  bajBuys.rows.forEach(r => {
    cumQty += Number(r.quantity);
    cumCost += Number(r.net_amount);
    const runAvg = cumQty > 0 ? cumCost / cumQty : 0;
    console.log(`    ${r.date} | ${r.type.padEnd(12)} | qty: ${String(r.quantity).padStart(4)} | price: ₹${String(Number(r.price).toFixed(2)).padStart(9)} | net: ₹${String(Math.round(r.net_amount)).padStart(9)} | runAvg: ₹${runAvg.toFixed(2)}`);
  });

  // Check if June 2025 CA was recorded for cc9 
  console.log("\n  June 2025 split+bonus CA recorded for cc9 BAJFINANCE?");
  const bajCA2025 = await db.execute("SELECT * FROM CorporateActions WHERE (symbol='BAJFINANCE') AND ex_date >= '2025-01-01' ORDER BY ex_date ASC");
  bajCA2025.rows.forEach(r => console.log("   ", JSON.stringify(r)));

  // Show all BAJFINANCE CA audit for cc9 specifically
  console.log("\n  CorporateActionAudit for BAJFINANCE in cc9:");
  const bajAuditCC9 = await db.execute("SELECT * FROM CorporateActionAudit WHERE symbol='BAJFINANCE' AND portfolio='cc9' ORDER BY rowid ASC");
  bajAuditCC9.rows.forEach(r => console.log("   ", JSON.stringify(r)));

  // Key question: does cc9 BAJFINANCE need June 2025 8x CA applied?
  // Maa HDFC Sky got SPLIT(2x) + BONUS(4x) = 8x in June 2025 on ISIN INE296A01032
  // cc9 holds ISIN INE296A01024 (old ISIN)
  // If ISINs are the same stock with different face values, cc9 SHOULD have gotten it too
  console.log("\n  ISIN mapping check:");
  const isinCheck = await db.execute("SELECT DISTINCT portfolio, isin, symbol, count(*) as cnt FROM Transactions WHERE symbol='BAJFINANCE' GROUP BY portfolio, isin ORDER BY portfolio");
  isinCheck.rows.forEach(r => console.log(`   portfolio: ${r.portfolio} | isin: ${r.isin} | txns: ${r.cnt}`));

  // Check what price BAJFINANCE trades at now (new ISIN, post all splits)
  // Current price ~₹1,077 (from MasterTickers)
  // cc9 DB avg ₹808.36 suggests pre-June-2025-split price basis (when stock was ~₹8,000 → 10:1 bonus in Oct 2024 → ₹800)
  // Statement avg ₹527.19 suggests a DIFFERENT cost basis - possibly from a DIFFERENT calc
  
  // Try applying June 2025 8x (SPLIT 2x * BONUS 4x) retroactively to cc9
  console.log("\n  Simulation: If June 2025 8x applied to cc9 BAJFINANCE:");
  console.log(`    Current: 1250 shares (before Jul sell) at avg ₹808.36 = ₹10,10,450 total`);
  console.log(`    After 8x: 10,000 shares at avg ₹101.05 = ₹10,10,450 total (same cost)`);
  console.log(`    After Jul sell 100: 9,900 shares at ₹101.05`);
  console.log(`    => Does NOT match statement (1150 shares). Statement uses OLD (pre-June-2025) qty.`);
  console.log(`    => CONCLUSION: cc9 still holds old ISIN INE296A01024 and was NOT split-adjusted.`);
  console.log(`    => Statement ₹527 likely uses a different cost methodology (PMS uses inception WAC)`);
  
  // Try to reconcile ₹527.19 with 125 pre-bonus shares
  console.log("\n  Reconcile statement avg ₹527.19:");
  const stmtTotalCost = 1150 * 527.19;
  const preBonus125cost = stmtTotalCost * (125/1250); // backtrack from 1150→1250 before sell, then 1250→125 before bonus
  // But 1150 shares post Jul2026 sell. Before sell: 1250. Before bonus: 125. So:
  // If statement tracks from 1250 post-bonus at ₹527.19 avg = ₹658,987
  const preBonus1250cost = 1250 * 527.19;
  console.log(`    Statement total cost (1150 × ₹527.19) = ₹${Math.round(stmtTotalCost).toLocaleString('en-IN')}`);
  console.log(`    If applying to 1250 post-bonus: ₹${Math.round(preBonus1250cost).toLocaleString('en-IN')} = ₹${(preBonus1250cost/1250).toFixed(2)}/share`);
  console.log(`    Implied cost for original 125 shares: ₹${Math.round(preBonus125cost * 10).toLocaleString('en-IN')} = ₹${(preBonus125cost * 10 / 125).toFixed(2)}/share`);
  console.log(`    DB original cost from CA audit: ₹10,10,450 = ₹${(1010450/125).toFixed(2)}/share`);
  console.log(`\n  POSSIBLE EXPLANATION: cc9 PMS manager may use a different cost method`);
  console.log(`  (e.g., market value at time of TRANSFER IN vs actual purchase price)`);
  console.log(`  OR the original transactions have different net_amount values than what`);
  console.log(`  the PMS statement uses. This needs the original purchase slips to reconcile.`);
}

fix().catch(console.error);
