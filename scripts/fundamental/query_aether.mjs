import Database from 'better-sqlite3';
const db = new Database('portfolio.db');
const hfs = db.prepare(`SELECT * FROM HistoricalFinancialStatements WHERE symbol='AETHER' ORDER BY period_date DESC LIMIT 5`).all();
console.log('HistoricalFinancialStatements:', hfs);
