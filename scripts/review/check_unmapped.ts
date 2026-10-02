import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const rows = db.prepare('SELECT sector, industry, count(*) as cnt FROM MasterTickers GROUP BY sector, industry ORDER BY cnt DESC LIMIT 50').all();
console.log(rows);
