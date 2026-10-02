import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
console.log('company_facts distinct metrics:');
const metrics = db.prepare('SELECT metric, count(*) as cnt FROM company_facts GROUP BY metric ORDER BY cnt DESC LIMIT 50').all();
console.log(metrics);
