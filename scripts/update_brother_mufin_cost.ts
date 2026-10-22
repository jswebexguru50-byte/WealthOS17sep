import { getDB, dbAll, dbRun, dbGet, createPersistentBackup } from '../src/server/database.js';
import { runFIFO } from '../src/server/fifoEngine.js';

async function updateBrotherMufinCost() {
  const db = getDB();
  console.log('========================================================================');
  console.log('>>> UPDATING BROTHER MUFIN GREEN FINANCE COST & PAYMENT DATE');
  console.log('========================================================================');

  // 1. Update Transactions table for Brother - Equity MUFIN
  console.log('\n[1/4] Updating Transaction in DB for MUFIN (Brother - Equity)...');
  await dbRun(db, "DELETE FROM Transactions WHERE portfolio = 'Brother - Equity' AND (isin = 'INE08KJ01020' OR symbol = 'MUFIN')");

  await dbRun(db, `
    INSERT INTO Transactions (
      date, portfolio, type, symbol, isin, quantity, price, gross_amount, net_amount,
      source, notes, is_cash_flow, member_id
    ) VALUES (
      '2026-02-27', 'Brother - Equity', 'BUY', 'MUFIN', 'INE08KJ01020', 25588, 98.0, 2507624.0, 2507624.0,
      'Preferential Allotment', 'Payment on 27 Feb 2026 - 25,588 shares @ ₹98.00 per share (Total: ₹25,07,624.00)', 1, 2
    )
  `);
  console.log('  Done. Inserted 25,588 shares @ ₹98.00 on 2026-02-27 (Total: ₹25,07,624.00).');

  // 2. Update ZerodhaHoldings for Brother - Equity
  console.log('\n[2/4] Updating ZerodhaHoldings ground-truth avg_price to ₹98.00...');
  await dbRun(db, `
    UPDATE ZerodhaHoldings 
    SET avg_price = 98.0, upload_date = datetime('now')
    WHERE portfolio = 'Brother - Equity' AND isin = 'INE08KJ01020'
  `);

  // 3. Re-run FIFO Engine
  console.log('\n[3/4] Running FIFO Engine...');
  await runFIFO(db);

  // Re-align LTP for Brother holdings
  await dbRun(db, `
    UPDATE Holdings
    SET ltp = 134.90, native_ltp = 134.90,
        current_value = quantity * 134.90, native_current_value = quantity * 134.90,
        unrealized_pnl = (quantity * 134.90) - total_cost,
        native_unrealized_pnl = (quantity * 134.90) - native_total_cost,
        data_source = 'Zerodha Statement JDB184', data_status = 'LIVE',
        last_update = datetime('now')
    WHERE portfolio = 'Brother - Equity' AND isin = 'INE08KJ01020'
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
  console.log('\n>>> MUFIN update and FIFO rebuild complete!');
}

updateBrotherMufinCost().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
