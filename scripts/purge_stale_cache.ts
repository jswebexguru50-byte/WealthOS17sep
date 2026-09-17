/**
 * scripts/purge_stale_cache.ts
 *
 * Purges duplicate and stale cache from portfolio.db:
 * 1. Retains the top 3 completed scans in strategy_scan_cache (latest active UI/API data)
 * 2. Purges over 13.29 million obsolete, duplicate cache rows
 * 3. Prunes strategy_scan_metadata to retain latest 20 scan audit entries
 * 4. Recreates all required database indexes
 * 5. Runs PRAGMA optimize
 */

import sqlite3 from 'sqlite3';
import fs from 'node:fs';

const DB_PATH = 'portfolio.db';

async function main() {
  console.log('================================================================');
  console.log('       WEALTHOS / ITAS DATABASE STALE CACHE PURGE               ');
  console.log('================================================================\n');

  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database not found at ${DB_PATH}`);
  }

  const initialStat = fs.statSync(DB_PATH);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Initial DB Size: ${(initialStat.size / (1024 * 1024)).toFixed(2)} MB\n`);

  const db = new sqlite3.Database(DB_PATH);

  const getSql = (q: string, params: any[] = []): Promise<any> =>
    new Promise((res, rej) => db.get(q, params, (e, r) => (e ? rej(e) : res(r))));
  const allSql = (q: string, params: any[] = []): Promise<any[]> =>
    new Promise((res, rej) => db.all(q, params, (e, r) => (e ? rej(e) : res(r))));
  const runSql = (q: string, params: any[] = []): Promise<void> =>
    new Promise((res, rej) => db.run(q, params, (e) => (e ? rej(e) : res())));

  // Step 1: Pre-purge analysis
  console.log('[Step 1/5] Analyzing current cache state...');
  const initialCacheCount = await getSql('SELECT count(*) as cnt FROM strategy_scan_cache');
  const initialMetaCount = await getSql('SELECT count(*) as cnt FROM strategy_scan_metadata');
  console.log(`Total rows in strategy_scan_cache:    ${initialCacheCount.cnt.toLocaleString()}`);
  console.log(`Total rows in strategy_scan_metadata: ${initialMetaCount.cnt.toLocaleString()}`);

  const activeScans = await allSql(
    "SELECT id, scan_id, created_at, stocks_qualified_total FROM strategy_scan_metadata WHERE status = 'COMPLETE' ORDER BY id DESC LIMIT 3"
  );
  console.log('\nRetaining the top 3 most recent complete scans:');
  console.table(activeScans);

  const scanIds = activeScans.map((s) => `'${s.scan_id}'`).join(',');

  // Step 2: Create pristine purged table with only the active scans
  console.log('\n[Step 2/5] Creating pristine strategy_scan_cache table with active scans only...');
  const startTime = Date.now();

  await runSql('BEGIN TRANSACTION');

  await runSql(`
    CREATE TABLE strategy_scan_cache_clean AS
    SELECT * FROM strategy_scan_cache
    WHERE scan_id IN (${scanIds})
  `);

  const retainedCount = await getSql('SELECT count(*) as cnt FROM strategy_scan_cache_clean');
  console.log(`✓ Copied ${retainedCount.cnt.toLocaleString()} active rows to clean table.`);

  // Step 3: Swap tables
  console.log('\n[Step 3/5] Dropping stale cache table and swapping in clean table...');
  await runSql('DROP TABLE strategy_scan_cache');
  await runSql('ALTER TABLE strategy_scan_cache_clean RENAME TO strategy_scan_cache');

  // Step 4: Recreate indexes
  console.log('\n[Step 4/5] Recreating performance indexes...');
  await runSql('CREATE INDEX IF NOT EXISTS idx_scan_cache_scan_id ON strategy_scan_cache(scan_id)');
  await runSql('CREATE INDEX IF NOT EXISTS idx_scan_cache_strategy_id ON strategy_scan_cache(strategy_id)');
  await runSql('CREATE INDEX IF NOT EXISTS idx_scan_cache_symbol ON strategy_scan_cache(symbol)');
  await runSql('CREATE INDEX IF NOT EXISTS idx_strat_cache_lookup ON strategy_scan_cache(scan_id, strategy_id)');

  // Step 5: Prune strategy_scan_metadata to retain latest 20 scans
  console.log('\n[Step 5/5] Pruning metadata audit log to latest 20 scans...');
  await runSql(`
    DELETE FROM strategy_scan_metadata
    WHERE id NOT IN (
      SELECT id FROM strategy_scan_metadata ORDER BY id DESC LIMIT 20
    )
  `);

  await runSql('COMMIT');

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const purgedRows = initialCacheCount.cnt - retainedCount.cnt;

  console.log('\n✓ Transaction committed successfully.');
  console.log(`Execution time: ${durationSec}s`);

  // Final verification
  const finalCacheCount = await getSql('SELECT count(*) as cnt FROM strategy_scan_cache');
  const finalMetaCount = await getSql('SELECT count(*) as cnt FROM strategy_scan_metadata');

  console.log('\n================================================================');
  console.log('                   PURGE RESULTS SUMMARY                        ');
  console.log('================================================================');
  console.log(`Rows purged from strategy_scan_cache:    ${purgedRows.toLocaleString()}`);
  console.log(`Active rows retained:                   ${finalCacheCount.cnt.toLocaleString()}`);
  console.log(`Metadata rows retained:                 ${finalMetaCount.cnt.toLocaleString()} (was ${initialMetaCount.cnt})`);
  console.log('================================================================\n');

  console.log('Running PRAGMA optimize...');
  await runSql('PRAGMA optimize');

  console.log('Running PRAGMA integrity_check...');
  const integrity = await getSql('PRAGMA integrity_check');
  console.log(`Integrity Check: ${integrity.integrity_check}`);

  db.close();
}

main().catch((err) => {
  console.error('Purge failed:', err);
  process.exit(1);
});
