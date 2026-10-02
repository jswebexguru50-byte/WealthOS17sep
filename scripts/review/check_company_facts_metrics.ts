import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

console.log('company_facts distinct metricName:');
const metrics = db.prepare('SELECT metricName, count(*) as cnt FROM company_facts GROUP BY metricName ORDER BY cnt DESC LIMIT 40').all();
console.log(metrics);

console.log('HistoricalPrices row count by symbol (checking history length):');
const histRows = db.prepare('SELECT symbol, count(*) as days, min(date) as min_date, max(date) as max_date FROM HistoricalPrices GROUP BY symbol HAVING days < 100 LIMIT 20').all();
console.log('Short history symbols in HistoricalPrices (<100 days):', histRows.length, histRows.slice(0, 10));

const longHistRows = db.prepare('SELECT symbol, count(*) as days, min(date) as min_date, max(date) as max_date FROM HistoricalPrices GROUP BY symbol HAVING days > 1000 LIMIT 5').all();
console.log('Long history symbols:', longHistRows);
