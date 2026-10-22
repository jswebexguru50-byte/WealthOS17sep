import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

console.log('=== ALL TABLES IN PORTFOLIO.DB ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
for (const t of tables) {
  try {
    const count = (db.prepare(`SELECT count(*) as c FROM "${t.name}"`).get() as any)?.c;
    console.log(`${t.name.padEnd(45)}: ${count} rows`);
  } catch (err: any) {
    console.log(`${t.name.padEnd(45)}: ERROR (${err.message})`);
  }
}
