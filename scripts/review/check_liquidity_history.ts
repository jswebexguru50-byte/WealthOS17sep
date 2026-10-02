import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

console.log('Checking HistoricalPrices symbols count:');
const hpSyms = db.prepare('SELECT count(DISTINCT symbol) as c FROM HistoricalPrices').get();
console.log(hpSyms);

console.log('Checking MarketSnapshots symbols count:');
const msSyms = db.prepare('SELECT count(DISTINCT symbol) as c FROM MarketSnapshots').get();
console.log(msSyms);

const msLowVol = db.prepare(`
  SELECT symbol, AVG(volume) as avg_vol, COUNT(*) as days 
  FROM MarketSnapshots 
  GROUP BY symbol 
  ORDER BY avg_vol ASC 
  LIMIT 25
`).all();
console.log('MarketSnapshots lowest volume:', msLowVol);

const msShortDays = db.prepare(`
  SELECT symbol, COUNT(*) as days 
  FROM MarketSnapshots 
  GROUP BY symbol 
  ORDER BY days ASC 
  LIMIT 25
`).all();
console.log('MarketSnapshots fewest days:', msShortDays);

console.log('MasterTickers listing_date sample non-null:');
const mtListings = db.prepare(`
  SELECT symbol, listing_date 
  FROM MasterTickers 
  WHERE listing_date IS NOT NULL AND listing_date != '' 
  LIMIT 25
`).all();
console.log(mtListings);
