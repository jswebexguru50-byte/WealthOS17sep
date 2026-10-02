import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

console.log('--- company_facts columns ---');
console.log(db.prepare("PRAGMA table_info(company_facts)").all());

console.log('--- FundamentalSnapshots columns ---');
console.log(db.prepare("PRAGMA table_info(FundamentalSnapshots)").all());

console.log('--- MasterTickers columns ---');
console.log(db.prepare("PRAGMA table_info(MasterTickers)").all());
