import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const tcs = db.prepare("SELECT endpoint, provider FROM fundamental_endpoint_snapshots WHERE UPPER(symbol) = 'TCS'").all();
console.log('TCS snapshots:', tcs);

const tcsFacts = db.prepare("SELECT count(*) as c FROM company_facts WHERE UPPER(symbol) = 'TCS'").get();
console.log('TCS facts:', tcsFacts);
