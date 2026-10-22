import sqlite3 from 'sqlite3';

async function main() {
  const db = new sqlite3.Database('portfolio.db', sqlite3.OPEN_READONLY);
  const getSql = (q: string): Promise<any> => new Promise((res, rej) => db.get(q, (e, r) => e ? rej(e) : res(r)));
  const allSql = (q: string): Promise<any[]> => new Promise((res, rej) => db.all(q, (e, r) => e ? rej(e) : res(r)));

  const latestScans = await allSql("SELECT id, scan_id, created_at, stocks_qualified_total FROM strategy_scan_metadata WHERE status = 'COMPLETE' ORDER BY id DESC LIMIT 3");
  console.log('Top 3 latest complete scans:');
  console.table(latestScans);

  const scanIds = latestScans.map(s => `'${s.scan_id}'`).join(',');
  const rowCount = await getSql(`SELECT count(*) as cnt FROM strategy_scan_cache WHERE scan_id IN (${scanIds})`);
  console.log(`Rows in strategy_scan_cache for the top 3 latest scans: ${rowCount.cnt}`);

  const totalRows = await getSql(`SELECT count(*) as cnt FROM strategy_scan_cache`);
  console.log(`Total rows currently in strategy_scan_cache: ${totalRows.cnt}`);
  console.log(`Rows to be purged: ${(totalRows.cnt - rowCount.cnt).toLocaleString()}`);

  db.close();
}

main().catch(console.error);
