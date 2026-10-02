import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const hpLowVol = db.prepare(`
  SELECT symbol, AVG(volume) as avg_vol, COUNT(*) as days, MIN(date) as min_date, MAX(date) as max_date
  FROM HistoricalPrices 
  GROUP BY symbol 
  HAVING avg_vol > 0 AND avg_vol < 5000 AND days >= 30
  ORDER BY avg_vol ASC 
  LIMIT 25
`).all();
console.log('HistoricalPrices lowest volume (avg_vol < 5000):', hpLowVol);

const hpShortDays = db.prepare(`
  SELECT symbol, COUNT(*) as days, MIN(date) as min_date, MAX(date) as max_date
  FROM HistoricalPrices 
  GROUP BY symbol 
  HAVING days < 150 AND days > 5
  ORDER BY days ASC 
  LIMIT 25
`).all();
console.log('HistoricalPrices short history (< 150 days):', hpShortDays);
