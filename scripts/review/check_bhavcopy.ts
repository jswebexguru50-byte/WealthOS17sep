import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const bhavSample = db.prepare("SELECT symbol, AVG(volume) as avg_vol, COUNT(*) as days FROM NseBhavcopy WHERE series = 'EQ' GROUP BY symbol HAVING avg_vol < 10000 AND avg_vol > 0 ORDER BY avg_vol ASC LIMIT 25").all();
console.log('NseBhavcopy low volume symbols (<10k):', bhavSample);

const shortBhav = db.prepare("SELECT symbol, COUNT(DISTINCT trade_date) as days, MIN(trade_date) as min_date, MAX(trade_date) as max_date FROM NseBhavcopy GROUP BY symbol HAVING days < 5 ORDER BY days ASC LIMIT 25").all();
console.log('NseBhavcopy short history (<5 days):', shortBhav);
