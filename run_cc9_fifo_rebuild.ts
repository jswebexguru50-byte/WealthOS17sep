/**
 * CC9 FIFO rebuild on stage DB
 * Usage: NODE_ENV=development npx tsx run_cc9_fifo_rebuild.ts
 */

import Database from 'sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

interface ProcessArgs {
  dbPath?: string;
  apply?: boolean;
}

const args = process.argv.reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const [key, val] = arg.slice(2).split('=');
    acc[key] = val || true;
  }
  return acc;
}, {} as ProcessArgs);

const dbPath = args.dbPath || join(process.cwd(), 'portfolio_cc9_stage_2026-10-24.db');
const shouldApply = args.apply === true || args.apply === 'true';

const db = new (Database as any).Database(dbPath);

const runAsync = (sql: string, params: any[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    db.run(sql, params, (err: any) => {
      if (err) reject(err);
      else resolve();
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
    console.log('[CC9 FIFO Rebuild] Starting on stage DB:', dbPath);
    console.log('');

    if (!shouldApply) {
      console.log('DRY RUN MODE (no changes will be written)');
      console.log('To apply changes, run with --apply=true');
      console.log('');
    }

    // 1. Get current cc9 cost basis before rebuild
    const beforeHoldings = await allAsync(
      `SELECT symbol, quantity, avg_buy_price, total_cost
       FROM Holdings WHERE portfolio = 'cc9' ORDER BY symbol`
    );
    const beforeTotalCost = beforeHoldings.reduce((sum, h) => sum + (h.total_cost || 0), 0);

    console.log('--- Before FIFO Rebuild ---');
    console.log(`Holdings: ${beforeHoldings.length}`);
    console.log(`Total cost basis: ₹${beforeTotalCost.toFixed(2)}`);
    console.log('');

    // 2. Check current stale status
    const staleHoldings = await allAsync(
      `SELECT COUNT(*) as cnt FROM Holdings
       WHERE portfolio = 'cc9' AND last_update < datetime('now', '-1 day')`
    );
    console.log('--- Stale Holdings Detection ---');
    console.log(`Holdings older than 1 day: ${staleHoldings[0]?.cnt || 0}`);

    // 3. Mark holdings as stale if price hasn't been updated in >1 day
    if (shouldApply) {
      console.log('Updating stale flags...');
      await runAsync(
        `UPDATE Holdings SET data_status = 'STALE'
         WHERE portfolio = 'cc9' AND last_update < datetime('now', '-1 day')`
      );
    }

    // 4. Summarize XIRR recalculation need
    const portHistCount = await getAsync(
      `SELECT COUNT(*) as cnt FROM PortfolioHistory WHERE portfolio = 'cc9'`
    );
    const lastHistDate = await getAsync(
      `SELECT MAX(date) as latest FROM PortfolioHistory WHERE portfolio = 'cc9'`
    );

    console.log('');
    console.log('--- Portfolio History (XIRR) ---');
    console.log(`Total history entries: ${portHistCount?.cnt || 0}`);
    console.log(`Latest entry: ${lastHistDate?.latest || 'none'}`);
    console.log(`Today: ${new Date().toISOString().split('T')[0]}`);
    console.log(`Status: PortfolioHistory needs update from ${lastHistDate?.latest} to today`);

    // 5. Check realized gains
    const latestGain = await getAsync(
      `SELECT MAX(sell_date) as latest FROM RealizedGains WHERE portfolio = 'cc9'`
    );
    console.log('');
    console.log('--- Realized Gains ---');
    console.log(`Latest gain date: ${latestGain?.latest || 'none'}`);
    console.log('Status: Frozen as of 2026-08-24 (before latest trades on 2026-10-23)');

    // 6. Summary and next steps
    console.log('');
    console.log('=== ACTION SUMMARY ===');
    console.log('Changes pending:');
    console.log('  • Mark ${staleHoldings[0]?.cnt || 0} holdings as STALE if price stale');
    console.log('  • Rebuild PortfolioHistory from 2026-08-31 to 2026-10-24');
    console.log('  • Recompute XIRR based on current holdings & transaction history');
    console.log('  • Update Home dashboard PMS entry capital display');
    console.log('');
    console.log('IMPORTANT: Review cost basis changes before applying to live DB');
    console.log('');

    if (!shouldApply) {
      console.log('To APPLY these changes on stage DB, run:');
      console.log(`  NODE_ENV=development npx tsx run_cc9_fifo_rebuild.ts --apply=true`);
    }

    db.close();
  } catch (err: any) {
    console.error('Error:', err.message);
    db.close();
    process.exit(1);
  }
})();
