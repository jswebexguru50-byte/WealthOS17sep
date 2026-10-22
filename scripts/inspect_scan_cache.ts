import sqlite3 from 'sqlite3';

async function main() {
  const db = new sqlite3.Database('portfolio.db', sqlite3.OPEN_READONLY);

  const getSql = (q: string, params: any[] = []): Promise<any> => new Promise((res, rej) => db.get(q, params, (e, r) => e ? rej(e) : res(r)));
  const allSql = (q: string, params: any[] = []): Promise<any[]> => new Promise((res, rej) => db.all(q, params, (e, r) => e ? rej(e) : res(r)));

  console.log('Inspecting strategy_scan_cache:');
  const summary = await getSql(`SELECT COUNT(*) as total, COUNT(DISTINCT scan_id) as distinct_scans, COUNT(DISTINCT scan_date) as distinct_dates, MIN(scan_date) as min_date, MAX(scan_date) as max_date FROM strategy_scan_cache`);
  console.log(summary);

  console.log('\nTop 10 scan dates:');
  const scansByDate = await allSql(`SELECT scan_date, count(*) as cnt FROM strategy_scan_cache GROUP BY scan_date ORDER BY cnt DESC LIMIT 10`);
  console.log(scansByDate);

  console.log('\nScan metadata table:');
  try {
    const meta = await allSql(`SELECT * FROM strategy_scan_metadata ORDER BY scan_date DESC LIMIT 5`);
    console.log(meta);
  } catch(e: any) {
    console.log('No strategy_scan_metadata table or error:', e.message);
  }

  db.close();
}

main().catch(console.error);
