import { getDB, dbAll, dbRun, dbGet, createPersistentBackup } from '../src/server/database.js';
import { runFIFO } from '../src/server/fifoEngine.js';

async function addBrotherSmartHorizonAIF() {
  const db = getDB();
  console.log('========================================================================');
  console.log('>>> ADDING SMART HORIZON AIF TO BROTHER EQUITY PORTFOLIO');
  console.log('========================================================================');

  const isin = 'INF162422150';
  const symbol = 'SMARTHORIZON';
  const name = 'Smart Horizon Opportunity Fund - S1 Class A1';
  const sector = 'Alternative Investment Funds (AIF)';
  const units = 999950.002;
  const initialContribution = 10000000.00; // 1 Cr
  const navPrice = initialContribution / units; // ~10.000499975
  const latestNav = 12.79;
  const currentValuation = units * latestNav; // 12,789,360.53

  // 1. Ensure MasterTickers record
  console.log('\n[1/5] Populating MasterTickers...');
  await dbRun(db, `
    INSERT OR REPLACE INTO MasterTickers (
      isin, symbol, name, sector, currency, last_price, previous_close, last_updated, updated_at
    ) VALUES (
      ?, ?, ?, ?, 'INR', ?, ?, '2026-07-31', CURRENT_TIMESTAMP
    )
  `, [isin, symbol, name, sector, latestNav, latestNav]);

  // 2. Add / Update HistoricalPrices
  console.log('\n[2/5] Updating HistoricalPrices with NAV 12.79 as of 31 July 2026...');
  await dbRun(db, `
    INSERT OR REPLACE INTO HistoricalPrices (symbol, date, close_price, data_source)
    VALUES (?, '2026-07-31', ?, 'Smart Horizon AIF Official Statement')
  `, [symbol, latestNav]);
  await dbRun(db, `
    INSERT OR REPLACE INTO HistoricalPrices (symbol, date, close_price, data_source)
    VALUES (?, date('now'), ?, 'Smart Horizon AIF Official Statement')
  `, [symbol, latestNav]);

  // 3. Insert Transaction into Transactions table
  console.log('\n[3/5] Inserting Initial Contribution Transaction into Transactions table...');
  await dbRun(db, "DELETE FROM Transactions WHERE portfolio = 'Brother - Equity' AND (isin = ? OR symbol = ?)", [isin, symbol]);

  await dbRun(db, `
    INSERT INTO Transactions (
      date, portfolio, type, symbol, isin, quantity, price, gross_amount, net_amount,
      source, notes, is_cash_flow, member_id
    ) VALUES (
      '2025-02-15', 'Brother - Equity', 'BUY', ?, ?, ?, ?, ?, ?,
      'AIF Initial Contribution', 'Initial Contribution: ₹1,00,00,000.00 on 15 Feb 2025 - S1 Class A1 - Units: 9,99,950.002 @ NAV 10.00', 1, 2
    )
  `, [symbol, isin, units, navPrice, initialContribution, initialContribution]);

  // 4. Update ZerodhaHoldings Ground Truth
  console.log('\n[4/5] Updating ZerodhaHoldings...');
  await dbRun(db, "DELETE FROM ZerodhaHoldings WHERE portfolio = 'Brother - Equity' AND (isin = ? OR symbol = ?)", [isin, symbol]);
  await dbRun(db, `
    INSERT INTO ZerodhaHoldings (portfolio, isin, symbol, name, quantity, avg_price, upload_date, member_id)
    VALUES ('Brother - Equity', ?, ?, ?, ?, ?, datetime('now'), 2)
  `, [isin, symbol, name, units, navPrice]);

  // 5. Run FIFO Engine
  console.log('\n[5/5] Recomputing FIFO Holdings and Metrics...');
  await runFIFO(db);

  // Set explicit valuation on Holdings for Brother - Equity
  await dbRun(db, `
    UPDATE Holdings
    SET ltp = ?, native_ltp = ?,
        current_value = ?, native_current_value = ?,
        unrealized_pnl = ? - total_cost, native_unrealized_pnl = ? - native_total_cost,
        prev_close = ?, data_source = 'AIF Statement 31-Jul-2026', data_status = 'LIVE',
        last_update = datetime('now')
    WHERE portfolio = 'Brother - Equity' AND (isin = ? OR symbol = ?)
  `, [latestNav, latestNav, currentValuation, currentValuation, currentValuation, currentValuation, latestNav, isin, symbol]);

  // Purge DashboardDiskCache
  await dbRun(db, 'DELETE FROM DashboardDiskCache');

  // Verification Audit
  console.log('\n================================================================================================');
  console.log('RECONCILED BROTHER EQUITY HOLDINGS (WITH SMART HORIZON AIF):');
  console.log('================================================================================================');
  const holdings = await dbAll(db, "SELECT * FROM Holdings WHERE portfolio = 'Brother - Equity' ORDER BY current_value DESC");
  let totalCost = 0;
  let totalVal = 0;
  let totalPnl = 0;

  for (const h of holdings) {
    totalCost += h.total_cost || 0;
    totalVal += h.current_value || 0;
    totalPnl += h.unrealized_pnl || 0;
    console.log(`  ${h.symbol.padEnd(14)} | ISIN: ${h.isin.padEnd(12)} | Qty: ${String(h.quantity).padStart(12)} | Avg Cost: ₹${(h.avg_buy_price || 0).toFixed(4).padStart(10)} | LTP: ₹${(h.ltp || 0).toFixed(2).padStart(7)} | Value: ₹${(h.current_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15)} | PnL: ₹${(h.unrealized_pnl || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15)}`);
  }
  console.log('------------------------------------------------------------------------------------------------');
  console.log(`TOTAL COST:      ₹${totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`TOTAL VALUATION: ₹${totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`UNREALIZED P&L:  ₹${totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log('================================================================================================');

  createPersistentBackup();
  console.log('\n>>> Smart Horizon AIF added and reconciled successfully!');
}

addBrotherSmartHorizonAIF().catch(err => {
  console.error('Error adding Smart Horizon AIF:', err);
  process.exit(1);
});
