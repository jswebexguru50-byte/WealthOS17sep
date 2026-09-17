import { getDB, initializeDatabase, dbAll } from './src/server/database.js';

await initializeDatabase();
const db = getDB();

console.log('=== DEPOSIT totals ===');
const deposits = await dbAll(db, "SELECT type, SUM(ABS(net_amount)) as total, COUNT(*) as cnt FROM Transactions WHERE portfolio = 'cc9' AND type = 'DEPOSIT' GROUP BY type");
console.log(JSON.stringify(deposits, null, 2));

console.log('\n=== TRANSFER IN / SECURITY IN breakdown ===');
const transfers = await dbAll(db, "SELECT type, is_cash_flow, is_ca, SUM(ABS(net_amount)) as total, COUNT(*) as cnt FROM Transactions WHERE portfolio = 'cc9' AND type IN ('TRANSFER IN','SECURITY IN') GROUP BY type, is_cash_flow, is_ca ORDER BY type, is_cash_flow");
console.log(JSON.stringify(transfers, null, 2));

console.log('\n=== All inflow types summary ===');
const all = await dbAll(db, "SELECT type, SUM(ABS(net_amount)) as total, COUNT(*) as cnt FROM Transactions WHERE portfolio = 'cc9' GROUP BY type ORDER BY total DESC");
console.log(JSON.stringify(all, null, 2));

process.exit(0);
