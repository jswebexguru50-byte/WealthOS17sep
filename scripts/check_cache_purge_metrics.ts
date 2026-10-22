import sqlite3 from 'sqlite3';

async function main() {
  const db = new sqlite3.Database('portfolio.db', sqlite3.OPEN_READONLY);
  const getSql = (q: string): Promise<any> => new Promise((res, rej) => db.get(q, (e, r) => e ? rej(e) : res(r)));

  console.log('Checking strategy_scan_metadata count:');
  const metaCount = await getSql('SELECT count(*) as cnt FROM strategy_scan_metadata');
  console.log('Total scans in metadata:', metaCount.cnt);

  // Check latest scan ID
  const latestScan = await getSql("SELECT scan_id, created_at, stocks_qualified_total FROM strategy_scan_metadata WHERE status = 'COMPLETE' ORDER BY id DESC LIMIT 1");
  console.log('Latest scan:', latestScan);

  // Check how many rows in strategy_scan_cache belong to the latest scan
  if (latestScan) {
    const latestCount = await getSql(`SELECT count(*) as cnt FROM strategy_scan_cache WHERE scan_id = '${latestScan.scan_id}'`);
    console.log(`Rows in strategy_scan_cache for latest scan (${latestScan.scan_id}):`, latestCount.cnt);
    console.log(`Stale rows that can be purged from strategy_scan_cache:`, (13299122 - latestCount.cnt).toLocaleString());
  }

  db.close();
}

main().catch(console.error);
