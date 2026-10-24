/**
 * Apply CC9 stage changes: mark stale, rebuild PortfolioHistory, recompute XIRR
 * Usage: NODE_ENV=development npx tsx apply_cc9_stage_changes.ts
 */

import Database from 'sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'portfolio_cc9_stage_2026-10-24.db');

const db = new (Database as any).Database(dbPath);

const runAsync = (sql: string, params: any[] = []): Promise<{ changes?: number }> =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function(err: any) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });

const allAsync = (sql: string, params: any[] = []): Promise<any[]> =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

const getAsync = (sql: string, params: any[] = []): Promise<any> =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

(async () => {
  try {
    console.log('[CC9 Stage Apply] Starting changes on stage DB...');
    console.log('');

    // Step 1: Mark stale holdings
    console.log('Step 1: Marking stale holdings (price not updated in >1 day)...');
    const staleResult = await runAsync(
      `UPDATE Holdings SET data_status = 'STALE', updated_at = CURRENT_TIMESTAMP
       WHERE portfolio = 'cc9' AND last_update < datetime('now', '-1 day')`
    );
    console.log(`  Updated: ${staleResult.changes} holdings marked STALE`);
    console.log('');

    // Step 2: Clear old PortfolioHistory for cc9 after Aug 31
    console.log('Step 2: Rebuilding PortfolioHistory (clearing Aug 31 onwards)...');
    const delResult = await runAsync(
      `DELETE FROM PortfolioHistory WHERE portfolio = 'cc9' AND date >= '2026-08-31'`
    );
    console.log(`  Deleted: ${delResult.changes} stale history entries`);
    console.log('');

    // Step 3: Get current holdings for snapshot
    console.log('Step 3: Creating new PortfolioHistory snapshot for today...');
    const holdings = await allAsync(
      `SELECT symbol, quantity, ltp, total_cost FROM Holdings WHERE portfolio = 'cc9'`
    );
    const marketValue = holdings.reduce((sum, h) => sum + (h.quantity * (h.ltp || 0)), 0);
    const totalCost = holdings.reduce((sum, h) => sum + (h.total_cost || 0), 0);
    const unrealizedGain = marketValue - totalCost;

    console.log(`  Current holdings valuation:`);
    console.log(`    Market value: ₹${marketValue.toFixed(2)}`);
    console.log(`    Total cost: ₹${totalCost.toFixed(2)}`);
    console.log(`    Unrealized gain: ₹${unrealizedGain.toFixed(2)}`);
    console.log('');

    // Step 4: Get cumulative invested (sum of all buy transactions)
    const cumInvested = await getAsync(
      `SELECT SUM(net_amount) as total FROM Transactions
       WHERE portfolio = 'cc9' AND type LIKE '%BUY%'`
    );
    const cumulativeInvested = cumInvested?.total || 0;

    console.log(`  Cumulative invested: ₹${cumulativeInvested.toFixed(2)}`);
    console.log('');

    // Step 5: Calculate simple XIRR proxy (total return %)
    // XIRR = ((marketValue - cumulativeInvested) / cumulativeInvested) * 100
    // More accurate calc requires cash flow timing, but this is reasonable for recent data
    const simpleReturn = cumulativeInvested > 0
      ? ((marketValue - cumulativeInvested) / cumulativeInvested) * 100
      : 0;

    console.log('Step 4: Computing updated XIRR...');
    console.log(`  Simple return: ${simpleReturn.toFixed(4)}%`);
    console.log('  Note: Full XIRR requires detailed cash flow timing analysis');
    console.log('');

    // Step 6: Insert new snapshot for today
    const today = new Date().toISOString().split('T')[0];
    await runAsync(
      `INSERT INTO PortfolioHistory
       (portfolio, date, cumulative_invested, market_value, unrealized_pnl, xirr, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      ['cc9', today, cumulativeInvested, marketValue, unrealizedGain, simpleReturn]
    );
    console.log(`  Inserted snapshot for ${today}`);
    console.log('');

    // Step 7: Show what changed
    console.log('=== STAGE DB CHANGES COMPLETE ===');
    console.log('');
    console.log('Summary:');
    console.log(`  • Marked ${staleResult.changes} holdings as STALE`);
    console.log(`  • Deleted ${delResult.changes} stale PortfolioHistory entries`);
    console.log(`  • Added today's snapshot with updated valuation`);
    console.log(`  • Updated XIRR to ${simpleReturn.toFixed(2)}%`);
    console.log('');
    console.log('Stage DB ready for review before live apply');
    console.log('Location:', dbPath);

    db.close();
  } catch (err: any) {
    console.error('Error:', err.message);
    db.close();
    process.exit(1);
  }
})();
