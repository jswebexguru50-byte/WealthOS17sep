import Database from 'better-sqlite3';
const db = new Database('portfolio.db');
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
for (const t of tables) {
  if (t.sql && (t.sql.toLowerCase().includes('debt') || t.sql.toLowerCase().includes('borrow') || t.sql.toLowerCase().includes('cash') || t.sql.toLowerCase().includes('receivable'))) {
    console.log(t.name);
    console.log(t.sql);
  }
}
