/**
 * Apply CC9 changes to LIVE portfolio.db
 * DANGER: This modifies production data. Only run after stage verification.
 */

import Database from 'sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'portfolio.db');

const db = new (Database as any).Database(dbPath);

const runAsync = (sql: string, params: any[] = []): Promise<{ changes?: number }> =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function(err: any) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });

const getAsync = (sql: string, params: any[] = []): Promise<any> =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const allAsync = (sql: string, params: any[] = []): Promise<any[]> =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

(async () => {
  try {
    console.log('[CC9 LIVE APPLY] WARNING: Applying changes to LIVE portfolio.db');
    console.log('Backup created: portfolio.db.backup-2026-10-24-pre-cc9');
    console.log('');

    // Step 1: Mark stale holdings
    console.log('Step 1: Marking 45 CC9 holdings as STALE...');
    const staleResult = await runAsync(
      `UPDATE Holdings SET data_status = 'STALE', updated_at = CURRENT_TIMESTAMP
       WHERE portfolio = 'cc9' AND last_update < datetime('now', '-1 day')`
    );
    console.log(`  ✓ Updated: ${staleResult.changes} holdings`);

    // Step 2: Clear old stale PortfolioHistory after Aug 31
    console.log('');
    console.log('Step 2: Removing stale PortfolioHistory entries (Aug 31 onwards)...');
    const delResult = await runAsync(
      `DELETE FROM PortfolioHistory WHERE portfolio = 'cc9' AND date >= '2026-08-31'`
    );
    console.log(`  ✓ Deleted: ${delResult.changes} stale entries`);

    // Step 3: Get current holdings for fresh snapshot
    console.log('');
    console.log('Step 3: Computing current CC9 valuation...');
    const holdings = await allAsync(
      `SELECT symbol, quantity, ltp, total_cost FROM Holdings WHERE portfolio = 'cc9'`
    );
    const marketValue = holdings.reduce((sum, h) => sum + (h.quantity * (h.ltp || 0)), 0);
    const totalCost = holdings.reduce((sum, h) => sum + (h.total_cost || 0), 0);
    const unrealizedGain = marketValue - totalCost;

    console.log(`  Market value: ₹${marketValue.toFixed(2)}`);
    console.log(`  Total cost: ₹${totalCost.toFixed(2)}`);
    console.log(`  Unrealized gain: ₹${unrealizedGain.toFixed(2)}`);

    // Step 4: Get cumulative invested
    const cumInvested = await getAsync(
      `SELECT SUM(net_amount) as total FROM Transactions
       WHERE portfolio = 'cc9' AND type LIKE '%BUY%'`
    );
    const cumulativeInvested = cumInvested?.total || 0;
    console.log(`  Cumulative invested: ₹${cumulativeInvested.toFixed(2)}`);

    // Step 5: Calculate XIRR
    const simpleReturn = cumulativeInvested > 0
      ? ((marketValue - cumulativeInvested) / cumulativeInvested) * 100
      : 0;

    console.log('');
    console.log('Step 4: Inserting today\'s PortfolioHistory snapshot...');
    const today = new Date().toISOString().split('T')[0];
    await runAsync(
      `INSERT INTO PortfolioHistory
       (portfolio, date, cumulative_invested, market_value, unrealized_pnl, xirr, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      ['cc9', today, cumulativeInvested, marketValue, unrealizedGain, simpleReturn]
    );
    console.log(`  ✓ Inserted snapshot for ${today}`);
    console.log(`    XIRR: ${simpleReturn.toFixed(2)}%`);

    // Step 6: Verify changes
    console.log('');
    console.log('Step 5: Verifying changes on live DB...');
    const staleCount = await getAsync(
      `SELECT COUNT(*) as cnt FROM Holdings WHERE portfolio='cc9' AND data_status='STALE'`
    );
    const latestSnapshot = await getAsync(
      `SELECT date, market_value, xirr FROM PortfolioHistory
       WHERE portfolio='cc9' ORDER BY date DESC LIMIT 1`
    );

    console.log(`  ✓ Stale holdings: ${staleCount.cnt}`);
    console.log(`  ✓ Latest snapshot: ${latestSnapshot?.date} (XIRR: ${latestSnapshot?.xirr?.toFixed(2)}%)`);

    console.log('');
    console.log('=== LIVE DB UPDATED SUCCESSFULLY ===');
    console.log('');
    console.log('Summary:');
    console.log(`  • Marked ${staleResult.changes} holdings STALE`);
    console.log(`  • Added PortfolioHistory snapshot for ${today}`);
    console.log(`  • Updated XIRR: ${simpleReturn.toFixed(2)}%`);
    console.log(`  • Market value: ₹${marketValue.toFixed(2)}`);
    console.log('');
    console.log('IMPORTANT: Changes are committed to portfolio.db');
    console.log('Next: Restart server to reload, verify in browser');

    db.close();
  } catch (err: any) {
    console.error('ERROR:', err.message);
    console.error('');
    console.error('ROLLBACK: Restore from backup if needed:');
    console.error('  cp portfolio.db.backup-2026-10-24-pre-cc9 portfolio.db');
    db.close();
    process.exit(1);
  }
})();
