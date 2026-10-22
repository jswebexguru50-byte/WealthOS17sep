import { getDB, dbAll, dbRun, dbGet, createPersistentBackup } from '../src/server/database.js';
import { runFIFO } from '../src/server/fifoEngine.js';

async function updateBrotherSonuinfraCost() {
  const db = getDB();
  console.log('========================================================================');
  console.log('>>> UPDATING BROTHER SONU INFRA COST & PAYMENT DATE');
  console.log('========================================================================');

  // 1. Update Transactions table for Brother - Equity SONUINFRA
  console.log('\n[1/4] Updating Transaction in DB for SONUINFRA (Brother - Equity)...');
  await dbRun(db, "DELETE FROM Transactions WHERE portfolio = 'Brother - Equity' AND (isin = 'INE0JZA01018' OR symbol = 'SONUINFRA')");

  await dbRun(db, `
    INSERT INTO Transactions (
      date, portfolio, type, symbol, isin, quantity, price, gross_amount, net_amount,
      source, notes, is_cash_flow, member_id
    ) VALUES (
      '2025-02-15', 'Brother - Equity', 'BUY', 'SONUINFRA', 'INE0JZA01018', 33000, 75.0, 2475000.0, 2475000.0,
      'Preferential Allotment', 'Payment on 15 Feb 2025 - 33,000 shares @ ₹75.00 per share (Total: ₹24,75,000.00)', 1, 2
    )
  `);
  console.log('  Done. Inserted 33,000 shares @ ₹75.00 on 2025-02-15 (Total: ₹24,75,000.00).');

  // 2. Update ZerodhaHoldings for Brother - Equity
  console.log('\n[2/4] Updating ZerodhaHoldings ground-truth avg_price to ₹75.00...');
  await dbRun(db, `
    UPDATE ZerodhaHoldings 
    SET avg_price = 75.0, upload_date = datetime('now')
    WHERE portfolio = 'Brother - Equity' AND isin = 'INE0JZA01018'
  `);

  // 3. Re-run FIFO Engine
  console.log('\n[3/4] Running FIFO Engine...');
  await runFIFO(db);

  // Re-align LTP for Brother holdings
  await dbRun(db, `
    UPDATE Holdings
    SET ltp = 38.45, native_ltp = 38.45,
        current_value = quantity * 38.45, native_current_value = quantity * 38.45,
        unrealized_pnl = (quantity * 38.45) - total_cost,
        native_unrealized_pnl = (quantity * 38.45) - native_total_cost,
        data_source = 'Zerodha Statement JDB184', data_status = 'LIVE',
        last_update = datetime('now')
    WHERE portfolio = 'Brother - Equity' AND isin = 'INE0JZA01018'
  `);

  // Purge DashboardDiskCache
  await dbRun(db, 'DELETE FROM DashboardDiskCache');

  // 4. Audit & Verification
  console.log('\n[4/4] Verification of Reconciled Brother Equity Holdings:');
  const holdings = await dbAll(db, "SELECT * FROM Holdings WHERE portfolio = 'Brother - Equity' ORDER BY current_value DESC");
  console.log('================================================================================================');
  let totalCost = 0;
  let totalVal = 0;
  let totalPnl = 0;

  for (const h of holdings) {
    totalCost += h.total_cost || 0;
    totalVal += h.current_value || 0;
    totalPnl += h.unrealized_pnl || 0;
    console.log(`  ${h.symbol.padEnd(14)} | ISIN: ${h.isin} | Qty: ${String(h.quantity).padStart(7)} | Avg Cost: ₹${(h.avg_buy_price || 0).toFixed(2).padStart(8)} | LTP: ₹${(h.ltp || 0).toFixed(2).padStart(7)} | Value: ₹${(h.current_value || 0).toLocaleString('en-IN').padStart(12)} | PnL: ₹${(h.unrealized_pnl || 0).toLocaleString('en-IN').padStart(12)}`);
  }
  console.log('------------------------------------------------------------------------------------------------');
  console.log(`TOTAL COST:      ₹${totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`TOTAL VALUATION: ₹${totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`UNREALIZED P&L:  ₹${totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log('================================================================================================');

  createPersistentBackup();
  console.log('\n>>> SONUINFRA update and FIFO rebuild complete!');
}

updateBrotherSonuinfraCost().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
