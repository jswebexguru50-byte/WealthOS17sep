import sqlite3 from 'sqlite3';

async function main() {
  const db = new sqlite3.Database('portfolio.db', sqlite3.OPEN_READONLY);
  const getSql = (q: string): Promise<any> => new Promise((res, rej) => db.get(q, (e, r) => e ? rej(e) : res(r)));
  const allSql = (q: string): Promise<any[]> => new Promise((res, rej) => db.all(q, (e, r) => e ? rej(e) : res(r)));

  // Check BacktestResultsCache
  const btc = await getSql('SELECT count(*) as total FROM BacktestResultsCache');
  console.log('BacktestResultsCache count:', btc);

  // Check FnoDataCache
  const fno = await getSql('SELECT count(*) as total FROM FnoDataCache');
  console.log('FnoDataCache count:', fno);

  // Check strategy_scan_metadata dates
  const metaDates = await allSql('SELECT DISTINCT substr(created_at, 1, 10) as dt, count(*) as scans FROM strategy_scan_metadata GROUP BY dt ORDER BY dt DESC LIMIT 10');
  console.log('Recent scan days in metadata:', metaDates);

  // Check how many scans in strategy_scan_metadata are older than today
  const oldScans = await allSql("SELECT scan_id FROM strategy_scan_metadata WHERE scan_id != (SELECT scan_id FROM strategy_scan_metadata WHERE status = 'COMPLETE' ORDER BY id DESC LIMIT 1)");
  console.log(`Total obsolete scan IDs in metadata: ${oldScans.length}`);

  db.close();
}

main().catch(console.error);
