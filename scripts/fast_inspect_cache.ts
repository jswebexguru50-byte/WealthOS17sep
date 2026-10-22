import sqlite3 from 'sqlite3';

async function main() {
  const db = new sqlite3.Database('portfolio.db', sqlite3.OPEN_READONLY);

  const getSql = (q: string, params: any[] = []): Promise<any> => new Promise((res, rej) => db.get(q, params, (e, r) => e ? rej(e) : res(r)));
  const allSql = (q: string, params: any[] = []): Promise<any[]> => new Promise((res, rej) => db.all(q, params, (e, r) => e ? rej(e) : res(r)));

  const cols = await allSql('PRAGMA table_info(strategy_scan_metadata)');
  console.log('Columns in strategy_scan_metadata:', cols.map(c => c.name));

  const countMeta = await getSql('SELECT count(*) as cnt FROM strategy_scan_metadata');
  console.log('Total strategy_scan_metadata rows:', countMeta.cnt);

  const recentMeta = await allSql('SELECT * FROM strategy_scan_metadata ORDER BY id DESC LIMIT 10');
  console.table(recentMeta);

  // Check what other cache tables exist in portfolio.db
  console.log('\nChecking all tables with cache or log in name:');
  const cacheTables = await allSql(`SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%cache%' OR name LIKE '%temp%' OR name LIKE '%log%')`);
  for (const t of cacheTables) {
    const r = await getSql(`SELECT COUNT(*) as count FROM "${t.name}"`);
    console.log(`- ${t.name}: ${r.count} rows`);
  }

  db.close();
}

main().catch(console.error);
