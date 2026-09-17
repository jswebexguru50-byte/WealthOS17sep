import { getDB, dbAll } from '../src/server/database.js';

async function main() {
  const db = getDB();
  const tables = await dbAll<any>(db, "SELECT name FROM sqlite_master WHERE type='table'");
  console.log('All tables count:', tables.length);

  const keywords = ['fii', 'dii', 'flow', 'sharehold', 'holding', 'deal', 'sector', 'institution', 'block', 'bulk', 'macro', 'buyer', 'sentiment', 'market', 'screener', 'evaluat', 'price', 'transaction'];
  const matched = tables.filter(t => keywords.some(k => t.name.toLowerCase().includes(k)));
  console.log('Matched tables:', matched.map(m => m.name));

  for (const t of matched) {
    try {
      const count = await dbAll<any>(db, `SELECT count(*) as c FROM ${t.name}`);
      const cols = await dbAll<any>(db, `PRAGMA table_info(${t.name})`);
      console.log(`\nTable ${t.name}: ${count[0]?.c} rows`);
      console.log(`  Columns: ${cols.map(c => c.name).slice(0, 10).join(', ')}${cols.length > 10 ? '...' : ''}`);
    } catch (e: any) {
      console.log(`Table ${t.name}: error reading (${e.message})`);
    }
  }
}

main().catch(console.error);
