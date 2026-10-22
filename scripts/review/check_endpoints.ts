import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

console.log('--- fundamental_endpoint_snapshots endpoints ---');
const endpoints = db.prepare('SELECT endpoint, provider, count(DISTINCT symbol) as sym_count, count(*) as row_count FROM fundamental_endpoint_snapshots GROUP BY endpoint, provider').all();
console.log(endpoints);

console.log('--- fundamental_source_snapshots providers ---');
const srcSnap = db.prepare('SELECT provider, count(DISTINCT symbol) as sym_count, count(*) as row_count FROM fundamental_source_snapshots GROUP BY provider').all();
console.log(srcSnap);

console.log('--- trendlyne_raw_response count ---');
const trRaw = db.prepare('SELECT count(DISTINCT symbol) as sym_count, count(*) as row_count FROM trendlyne_raw_response').all();
console.log(trRaw);
