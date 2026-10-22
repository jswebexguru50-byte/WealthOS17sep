import sqlite3 from 'sqlite3';
import fs from 'node:fs';

async function checkDb(name: string) {
  if (!fs.existsSync(name)) return;
  const stat = fs.statSync(name);
  if (stat.size === 0) return;

  console.log(`\n======================================================`);
  console.log(`Inspecting: ${name} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`======================================================`);

  const db = new sqlite3.Database(name, sqlite3.OPEN_READONLY);
  const allSql = (q: string): Promise<any[]> => new Promise((res, rej) => db.all(q, (e, r) => e ? rej(e) : res(r)));
  const getSql = (q: string): Promise<any> => new Promise((res, rej) => db.get(q, (e, r) => e ? rej(e) : res(r)));

  const tables = await allSql("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  for (const t of tables) {
    if (t.name.toLowerCase().includes('cache') || t.name.toLowerCase().includes('temp') || t.name.toLowerCase().includes('stale') || t.name.toLowerCase().includes('scan')) {
      const r = await getSql(`SELECT COUNT(*) as count FROM "${t.name}"`);
      console.log(`  - Table: ${t.name} -> ${r.count.toLocaleString()} rows`);
    }
  }

  db.close();
}

async function main() {
  const dbs = [
    'portfolio.db',
    'database.db',
    'database.sqlite',
    'nri_wealth.db',
    'nri_wealthos.db',
    'data/portfolio_v6.3_pilot_research.db',
    'data/portfolio_v6.3_research_subset.db'
  ];

  for (const d of dbs) {
    await checkDb(d);
  }
}

main().catch(console.error);
