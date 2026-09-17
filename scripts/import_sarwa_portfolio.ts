import { getDB, dbRun, dbAll, createPersistentBackup } from '../src/server/database.js';
import { runFIFO } from '../src/server/fifoEngine.js';

export async function importSarwaPortfolio(db: any) {
  console.log('========================================================================');
  console.log('>>> IMPORTING SARWA ROBO-ADVISORY PORTFOLIO IN USD CURRENCY');
  console.log('========================================================================');

  // 1. Create or register Sarwa in Portfolios table
  const existingPort = await dbAll(db, "SELECT * FROM Portfolios WHERE name = 'Sarwa'");
  if (existingPort.length === 0) {
    await dbRun(db, `
      INSERT INTO Portfolios (name, type, status, base_currency, family_group, benchmark_symbol, created_at, updated_at)
      VALUES ('Sarwa', 'ROBO_ADVISORY', 'ACTIVE', 'USD', 'Foreign Portfolios', '^GSPC', datetime('now'), datetime('now'))
    `);
  } else {
    await dbRun(db, `
      UPDATE Portfolios SET base_currency = 'USD', type = 'ROBO_ADVISORY', status = 'ACTIVE', benchmark_symbol = '^GSPC' WHERE name = 'Sarwa'
    `);
  }

  // 2. Register MasterTickers for Sarwa US ETFs, Cash & Fees
  const sarwaTickers = [
    { isin: 'US46432F8427', symbol: 'IEFA', name: 'iShares Core MSCI EAFE ETF', ltp: 100.26, segment: 'ETF' },
    { isin: 'US9229087690', symbol: 'VTI', name: 'Vanguard Morningstar Total Stock Market ETF', ltp: 378.15, segment: 'ETF' },
    { isin: 'US9220428588', symbol: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF', ltp: 60.52, segment: 'ETF' },
    { isin: 'US9229085538', symbol: 'VNQ', name: 'Vanguard Real Estate ETF', ltp: 96.44, segment: 'ETF' },
    { isin: 'US9219378356', symbol: 'BND', name: 'Vanguard Total Bond Market ETF', ltp: 72.24, segment: 'ETF' },
    { isin: 'US92203J4076', symbol: 'BNDX', name: 'Vanguard Total International Bond ETF', ltp: 47.55, segment: 'ETF' },
    { isin: 'CASH_USD', symbol: 'USD_CASH', name: 'US Dollar Cash', ltp: 1.0, segment: 'CASH' },
    { isin: 'FEE_USD', symbol: 'MANAGEMENT_FEE', name: 'Sarwa Advisory Fee', ltp: 1.0, segment: 'FEE' }
  ];

  for (const t of sarwaTickers) {
    await dbRun(db, `
      INSERT INTO MasterTickers (isin, symbol, name, exchange, segment, currency, manual_ltp, manual_ltp_date, status)
      VALUES (?, ?, ?, 'US', ?, 'USD', ?, '2026-09-01', 'ACTIVE')
      ON CONFLICT(isin) DO UPDATE SET
        symbol = excluded.symbol,
        name = excluded.name,
        currency = 'USD',
        segment = excluded.segment,
        manual_ltp = excluded.manual_ltp,
        manual_ltp_date = '2026-09-01'
    `, [t.isin, t.symbol, t.name, t.segment, t.ltp]);
  }

  // 3. Clear existing Sarwa Transactions
  await dbRun(db, "DELETE FROM Transactions WHERE portfolio = 'Sarwa'");

  // 4. Ingest Initial Capital Deposit (2021)
  await dbRun(db, `
    INSERT INTO Transactions (date, portfolio, type, symbol, isin, quantity, price, gross_amount, net_amount, source, notes, is_cash_flow)
    VALUES ('2021-06-15', 'Sarwa', 'DEPOSIT', 'USD_CASH', 'CASH_USD', 5047.28, 1.0, 5047.28, 5047.28, 'Sarwa Bank Inflow', 'Initial Capital Deposit from Bank', 1)
  `);

  // 5. Ingest Buy Trades for the 6 ETFs
  const buyTrades = [
    { isin: 'US46432F8427', symbol: 'IEFA', qty: 27.4921, price: 76.08328, cost: 2091.6897 },
    { isin: 'US9229087690', symbol: 'VTI', qty: 7.6706, price: 220.16950, cost: 1688.8322 },
    { isin: 'US9220428588', symbol: 'VWO', qty: 14.6564, price: 51.89046, cost: 760.5373 },
    { isin: 'US9229085538', symbol: 'VNQ', qty: 2.9367, price: 102.24429, cost: 300.2608 },
    { isin: 'US9219378356', symbol: 'BND', qty: 2.2870, price: 82.55426, cost: 188.8016 },
    { isin: 'US92203J4076', symbol: 'BNDX', qty: 3.3290, price: 55.46797, cost: 184.6529 }
  ];

  for (const trade of buyTrades) {
    await dbRun(db, `
      INSERT INTO Transactions (date, portfolio, type, symbol, isin, quantity, price, gross_amount, net_amount, source, notes, is_cash_flow)
      VALUES ('2021-06-16', 'Sarwa', 'BUY', ?, ?, ?, ?, ?, ?, 'Sarwa Invest Statement', 'Robo-Advisory Target Portfolio Allocation', 1)
    `, [trade.symbol, trade.isin, trade.qty, trade.price, trade.cost, trade.cost]);
  }

  // 6. Ingest Year-by-Year Management Fees
  const fees = [
    { date: '2021-12-31', amount: 24.20, note: 'Sarwa Management Fee 2021' },
    { date: '2022-12-31', amount: 37.77, note: 'Sarwa Management Fee 2022' },
    { date: '2023-12-31', amount: 38.75, note: 'Sarwa Management Fee 2023' },
    { date: '2024-12-31', amount: 45.21, note: 'Sarwa Management Fee 2024' },
    { date: '2025-12-31', amount: 50.92, note: 'Sarwa Management Fee 2025' },
    { date: '2026-08-31', amount: 39.15, note: 'Sarwa Management Fee 2026 (YTD)' }
  ];

  for (const fee of fees) {
    await dbRun(db, `
      INSERT INTO Transactions (date, portfolio, type, symbol, isin, quantity, price, gross_amount, net_amount, source, notes, is_cash_flow)
      VALUES (?, 'Sarwa', 'MANAGEMENT_FEE', 'MANAGEMENT_FEE', 'FEE_USD', 1, ?, ?, ?, 'Sarwa Advisory Fee', ?, 1)
    `, [fee.date, fee.amount, fee.amount, fee.amount, fee.note]);
  }

  console.log('>>> Recomputing FIFO Engine...');
  await runFIFO(db);

  createPersistentBackup();
  console.log('>>> Sarwa Portfolio successfully imported, calculated, and saved!');
}

async function main() {
  const db = getDB();
  await importSarwaPortfolio(db);

  // Query Sarwa Holdings
  const holdings = await dbAll(db, "SELECT portfolio, symbol, isin, quantity, native_avg_buy_price, native_ltp, native_total_cost, native_current_value, native_unrealized_pnl, unrealized_pct FROM Holdings WHERE portfolio = 'Sarwa'");
  console.log('\n--- SARWA HOLDINGS (USD) ---');
  console.table(holdings);

  const totalUsdVal = holdings.reduce((s, h) => s + (h.native_current_value || 0), 0);
  const totalUsdCost = holdings.reduce((s, h) => s + (h.native_total_cost || 0), 0);
  console.log(`\nTotal Sarwa Native USD Valuation: $${totalUsdVal.toFixed(2)} USD`);
  console.log(`Total Sarwa Native USD Invested:  $${totalUsdCost.toFixed(2)} USD`);
  console.log(`Total Sarwa Native USD Unrealized Gain: +$${(totalUsdVal - totalUsdCost).toFixed(2)} USD (+${((totalUsdVal - totalUsdCost)/totalUsdCost*100).toFixed(2)}%)`);
}

if (process.argv[1]?.endsWith('import_sarwa_portfolio.ts')) {
  main().catch(console.error);
}
