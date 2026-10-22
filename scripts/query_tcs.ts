import Database from 'better-sqlite3';
const db = new Database('portfolio.db', { readonly: true });

console.log('Metrics in company_facts:', db.prepare("SELECT metric, periodType, count(*) as cnt FROM company_facts WHERE symbol='TCS' GROUP BY metric, periodType").all());
db.close();
