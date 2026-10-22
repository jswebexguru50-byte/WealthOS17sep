import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

console.log('--- FundamentalSnapshots sample ---');
console.log(db.prepare('SELECT * FROM FundamentalSnapshots LIMIT 1').get());

console.log('--- FEREEnrichedLedger sample ---');
console.log(db.prepare('SELECT * FROM FEREEnrichedLedger LIMIT 1').get());

console.log('--- MarketSnapshots columns ---');
console.log(db.prepare('PRAGMA table_info(MarketSnapshots)').all().map((c: any) => c.name));

console.log('--- FullUniverseComprehensiveOpportunityScan sample ---');
console.log(db.prepare('SELECT * FROM FullUniverseComprehensiveOpportunityScan LIMIT 1').get());

console.log('--- Holdings symbols count ---');
const holdings = db.prepare('SELECT DISTINCT symbol FROM Holdings').all();
console.log('Holdings symbols:', holdings.length, holdings.slice(0, 10));

console.log('--- Strategy candidates check ---');
const scanCount = db.prepare('SELECT count(DISTINCT symbol) as c FROM FullUniverseComprehensiveOpportunityScan').get();
console.log('Distinct symbols in FullUniverseComprehensiveOpportunityScan:', scanCount);

console.log('--- company_facts distinct fact_type ---');
const factTypes = db.prepare('SELECT DISTINCT factType, count(*) as cnt FROM company_facts GROUP BY factType ORDER BY cnt DESC LIMIT 20').all();
console.log('Fact types:', factTypes);
