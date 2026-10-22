import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
console.log('HistoricalPrices cols:', db.prepare('PRAGMA table_info(HistoricalPrices)').all().map((c: any) => c.name));
