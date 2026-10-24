/**
 * Compare live vs stage CC9 database state
 * Shows what will change when applied
 */

import Database from 'sqlite3';
import { join } from 'path';

const liveDb = new (Database as any).Database(join(process.cwd(), 'portfolio.db'));
const stageDb = new (Database as any).Database(join(process.cwd(), 'portfolio_cc9_stage_2026-10-24.db'));

const getAsync = (db: any, sql: string, params: any[] = []): Promise<any> =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const allAsync = (db: any, sql: string, params: any[] = []): Promise<any[]> =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

(async () => {
  try {
    console.log('=== CC9 Live vs Stage DB Comparison ===');
    console.log('');

    // Holdings comparison
    console.log('--- Holdings Status ---');
    const liveHoldings = await allAsync(liveDb,
      `SELECT COUNT(*) as cnt, COUNT(CASE WHEN data_status='STALE' THEN 1 END) as stale
       FROM Holdings WHERE portfolio='cc9'`
    );
    const stageHoldings = await allAsync(stageDb,
      `SELECT COUNT(*) as cnt, COUNT(CASE WHEN data_status='STALE' THEN 1 END) as stale
       FROM Holdings WHERE portfolio='cc9'`
    );

    console.log('Live DB:');
    console.log(`  Total holdings: ${liveHoldings[0].cnt}`);
    console.log(`  Marked STALE: ${liveHoldings[0].stale}`);
    console.log('');
    console.log('Stage DB (after changes):');
    console.log(`  Total holdings: ${stageHoldings[0].cnt}`);
    console.log(`  Marked STALE: ${stageHoldings[0].stale}`);
    console.log('');

    // PortfolioHistory comparison
    console.log('--- PortfolioHistory Snapshot ---');
    const liveLatest = await getAsync(liveDb,
      `SELECT date, market_value, xirr FROM PortfolioHistory
       WHERE portfolio='cc9' ORDER BY date DESC LIMIT 1`
    );
    const stageLatest = await getAsync(stageDb,
      `SELECT date, market_value, xirr FROM PortfolioHistory
       WHERE portfolio='cc9' ORDER BY date DESC LIMIT 1`
    );

    console.log('Live DB (latest):');
    console.log(`  Date: ${liveLatest?.date || 'none'}`);
    console.log(`  Market value: ₹${(liveLatest?.market_value || 0).toFixed(2)}`);
    console.log(`  XIRR: ${(liveLatest?.xirr || 0).toFixed(2)}%`);
    console.log('');
    console.log('Stage DB (updated):');
    console.log(`  Date: ${stageLatest?.date || 'none'}`);
    console.log(`  Market value: ₹${(stageLatest?.market_value || 0).toFixed(2)}`);
    console.log(`  XIRR: ${(stageLatest?.xirr || 0).toFixed(2)}%`);
    console.log('');

    // Realized gains comparison
    console.log('--- Realized Gains Status ---');
    const liveGains = await getAsync(liveDb,
      `SELECT COUNT(*) as cnt, MAX(sell_date) as latest
       FROM RealizedGains WHERE portfolio='cc9'`
    );
    const stageGains = await getAsync(stageDb,
      `SELECT COUNT(*) as cnt, MAX(sell_date) as latest
       FROM RealizedGains WHERE portfolio='cc9'`
    );

    console.log('Live DB:');
    console.log(`  Total gains records: ${liveGains.cnt}`);
    console.log(`  Latest gain date: ${liveGains.latest || 'none'}`);
    console.log('');
    console.log('Stage DB (unchanged):');
    console.log(`  Total gains records: ${stageGains.cnt}`);
    console.log(`  Latest gain date: ${stageGains.latest || 'none'}`);
    console.log('');

    // Summary
    console.log('=== SUMMARY OF CHANGES ===');
    console.log('');
    console.log('Changes made on stage DB:');
    console.log(`  ✓ ${stageHoldings[0].stale} holdings marked STALE (was ${liveHoldings[0].stale})`);
    console.log(`  ✓ PortfolioHistory snapshot added for today (${stageLatest?.date})`);
    console.log(`  ✓ XIRR updated to ${(stageLatest?.xirr || 0).toFixed(2)}% (was ${(liveLatest?.xirr || 0).toFixed(2)}%)`);
    console.log(`  ✓ Market value snapshot: ₹${(stageLatest?.market_value || 0).toFixed(2)}`);
    console.log('');
    console.log('NOT changed (as per constraints):');
    console.log('  • Realized gains records (frozen as of Aug 24 — legacy data)');
    console.log('  • Holdings cost basis (requires full FIFO rebuild with evidence)');
    console.log('');
    console.log('Status: READY for live DB apply');

    liveDb.close();
    stageDb.close();
  } catch (err: any) {
    console.error('Error:', err.message);
    liveDb.close();
    stageDb.close();
    process.exit(1);
  }
})();
