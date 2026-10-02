import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

console.log('--- RVTH MasterTicker ---');
console.log(db.prepare("SELECT * FROM MasterTickers WHERE UPPER(symbol) = 'RVTH'").get());

console.log('--- RVTH FundamentalSnapshots ---');
console.log(db.prepare("SELECT * FROM FundamentalSnapshots WHERE UPPER(symbol) = 'RVTH'").get());

console.log('--- RVTH fundamental_endpoint_snapshots ---');
const snaps = db.prepare("SELECT endpoint, provider, fetched_at FROM fundamental_endpoint_snapshots WHERE UPPER(symbol) = 'RVTH'").all();
console.log(snaps);

console.log('--- RVTH company_facts count ---');
const facts = db.prepare("SELECT count(*) as c FROM company_facts WHERE UPPER(symbol) = 'RVTH'").get();
console.log(facts);

console.log('--- RVTH Deals / Actions ---');
const deals = db.prepare("SELECT * FROM InstitutionalDeals WHERE UPPER(symbol) = 'RVTH'").all();
console.log('Deals:', deals.length);
const actions = db.prepare("SELECT * FROM CorporateActions WHERE UPPER(symbol) = 'RVTH'").all();
console.log('Corporate actions:', actions.length);

console.log('--- RVTH Bhavcopy / HistoricalPrices ---');
const bhav = db.prepare("SELECT count(*) as c, MIN(trade_date) as min_d, MAX(trade_date) as max_d FROM NseBhavcopy WHERE UPPER(symbol) = 'RVTH'").get();
console.log('Bhavcopy:', bhav);
const hist = db.prepare("SELECT count(*) as c, MIN(date) as min_d, MAX(date) as max_d FROM HistoricalPrices WHERE UPPER(symbol) LIKE 'RVTH%'").get();
console.log('HistoricalPrices:', hist);
