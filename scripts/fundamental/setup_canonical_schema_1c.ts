import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') || path.join(process.cwd(), 'portfolio.db');

async function run(db: sqlite3.Database, sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
}

async function main() {
  const db = new sqlite3.Database(dbPath);

  console.log("Updating schemas for Phase 1C in: " + dbPath);

  // Add availabilityStatus to company_facts
  try {
    await run(db, `ALTER TABLE company_facts ADD COLUMN availabilityStatus TEXT NOT NULL DEFAULT 'AVAILABLE';`);
    console.log("Added availabilityStatus column.");
  } catch(e) {
    console.log("Column availabilityStatus might already exist.");
  }

  db.close();
}

main().catch(console.error);
