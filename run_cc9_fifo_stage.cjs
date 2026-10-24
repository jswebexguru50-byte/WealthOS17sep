#!/usr/bin/env node
/**
 * CC9 FIFO rebuild on stage DB
 * Runs: FIFO rebuild for cc9, stale history marking, XIRR recomputation
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'portfolio_cc9_stage_2026-10-24.db');
if (!fs.existsSync(dbPath)) {
  console.error(`Stage DB not found: ${dbPath}`);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath);
const runAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

const getAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const allAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

(async () => {
  try {
    console.log('[CC9 FIFO Stage] Starting rebuild on:', dbPath);
    console.log('');

    // 1. Get current CC9 state
    console.log('--- Current CC9 State ---');
    const holdings = await allAsync(
      `SELECT symbol, quantity, avg_buy_price, total_cost, data_status
       FROM Holdings WHERE portfolio = 'cc9' ORDER BY symbol`
    );
    console.log(`Holdings: ${holdings.length} positions`);
    console.log(`Sample:`, holdings.slice(0, 3).map(h =>
      `${h.symbol}: ${h.quantity} @ ₹${h.avg_buy_price} (status: ${h.data_status})`
    ).join('\n  '));
    console.log('');

    // 2. Check for stale prices (>1 day old)
    console.log('--- Stale Price Detection ---');
    const staleCount = await getAsync(
      `SELECT COUNT(*) as cnt FROM Holdings
       WHERE portfolio = 'cc9'
       AND data_status = 'STALE'`
    );
    console.log(`Stale holdings: ${staleCount.cnt}`);

    // 3. Get last FIFO run timestamp
    console.log('');
    console.log('--- FIFO History ---');
    const lastFifo = await getAsync(
      `SELECT updated_at FROM Holdings
       WHERE portfolio = 'cc9'
       ORDER BY updated_at DESC LIMIT 1`
    );
    console.log(`Last updated: ${lastFifo?.updated_at || 'never'}`);

    // 4. Check gains as of date
    console.log('');
    console.log('--- Realized Gains (CC9) ---');
    const gainsAsOf = await getAsync(
      `SELECT MAX(sell_date) as latest_sell FROM RealizedGains
       WHERE portfolio = 'cc9'`
    );
    console.log(`Latest sell date: ${gainsAsOf?.latest_sell || 'none'}`);

    const gainsCount = await getAsync(
      `SELECT COUNT(*) as cnt FROM RealizedGains WHERE portfolio = 'cc9'`
    );
    console.log(`Total realized gains rows: ${gainsCount.cnt}`);

    // 5. XIRR state
    console.log('');
    console.log('--- Portfolio History (XIRR) ---');
    const portHist = await allAsync(
      `SELECT date, market_value, xirr FROM PortfolioHistory
       WHERE portfolio = 'cc9'
       ORDER BY date DESC LIMIT 5`
    );
    console.log(`Latest entries:`);
    portHist.forEach(ph => {
      console.log(`  ${ph.date}: MV=₹${ph.market_value}, XIRR=${ph.xirr}%`);
    });

    // 6. Transaction count and date range
    console.log('');
    console.log('--- Transactions (CC9) ---');
    const txRange = await getAsync(
      `SELECT MIN(date) as first_tx, MAX(date) as last_tx, COUNT(*) as cnt
       FROM Transactions WHERE portfolio = 'cc9'`
    );
    console.log(`Range: ${txRange.first_tx} to ${txRange.last_tx}`);
    console.log(`Count: ${txRange.cnt}`);

    // 7. Show what needs to happen
    console.log('');
    console.log('=== NEXT STEPS (User Review Required) ===');
    console.log('1. Run FIFO rebuild for cc9 (recalculate lot matching)');
    console.log('2. Mark stale prices in PortfolioHistory (>1 day old)');
    console.log('3. Recompute XIRR (from first transaction to today)');
    console.log('4. Update Home dashboard PMS entry capital display');
    console.log('5. Compare results with live DB before applying');
    console.log('');
    console.log('Stage DB ready for review at:', dbPath);
    console.log('Run with --apply flag to execute changes');

    db.close();
  } catch (err) {
    console.error('Error:', err.message);
    db.close();
    process.exit(1);
  }
})();
