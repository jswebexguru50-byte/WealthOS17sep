import sqlite3 from 'sqlite3';
import fs from 'node:fs';

const dbs = ['portfolio.db', 'data/portfolio_v6.3_pilot_research.db', 'data/portfolio_v6.3_research_subset.db'];

async function inspectDb(dbPath: string) {
  if (!fs.existsSync(dbPath)) return;
  console.log(`\n=======================================================`);
  console.log(`Database: ${dbPath}`);
  console.log(`=======================================================`);

  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

  const tables: any[] = await new Promise((resolve, reject) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

  const cacheTables = tables.filter(t => 
    t.name.toLowerCase().includes('cache') ||
    t.name.toLowerCase().includes('temp') ||
    t.name.toLowerCase().includes('log') ||
    t.name.toLowerCase().includes('stale') ||
    t.name.toLowerCase().includes('scrape') ||
    t.name.toLowerCase().includes('raw')
  );

  console.log(`Total Tables: ${tables.length}, Cache/Temp/Log Tables: ${cacheTables.length}`);

  for (const t of cacheTables) {
    try {
      const countRes: any = await new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as cnt FROM "${t.name}"`, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      console.log(`  - ${t.name}: ${countRes ? countRes.cnt : 0} rows`);
    } catch (e: any) {
      console.log(`  - ${t.name}: error reading (${e.message})`);
    }
  }

  // Also check top 10 largest tables in the database
  console.log(`\nChecking all tables with high row counts:`);
  for (const t of tables) {
    try {
      const countRes: any = await new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as cnt FROM "${t.name}"`, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      if (countRes && countRes.cnt > 5000) {
        console.log(`  * ${t.name}: ${countRes.cnt.toLocaleString()} rows`);
      }
    } catch(e) {}
  }

  db.close();
}

async function main() {
  for (const p of dbs) {
    await inspectDb(p);
  }
}

main().catch(console.error);
