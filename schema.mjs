import Database from 'better-sqlite3';
const db = new Database('portfolio.db');
const cols = db.prepare('PRAGMA table_info(company_facts)').all();
console.log(cols);
