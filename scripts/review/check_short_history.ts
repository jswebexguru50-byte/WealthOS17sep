import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

// Check MarketSnapshots day counts
const msDays = db.prepare('SELECT symbol, count(*) as cnt FROM MarketSnapshots GROUP BY symbol HAVING cnt <= 10 ORDER BY cnt ASC LIMIT 30').all();
console.log('MarketSnapshots <= 10 days:', msDays);

// Check HistoricalPrices day counts
const hpDays = db.prepare('SELECT symbol, count(*) as cnt FROM HistoricalPrices GROUP BY symbol HAVING cnt <= 50 ORDER BY cnt ASC LIMIT 30').all();
console.log('HistoricalPrices <= 50 days:', hpDays);

// Check MasterTickers listing_date
const mtDates = db.prepare("SELECT symbol, listing_date FROM MasterTickers WHERE listing_date IS NOT NULL AND listing_date != ''").all();
console.log('MasterTickers non-null listing_date:', mtDates);
