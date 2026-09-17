const { createClient } = require('@libsql/client');
const fs = require('fs');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  console.log('=== PORTFOLIO RECORD ===');
  const port = await db.execute("SELECT * FROM Portfolios WHERE name='cc9'");
  console.log(port.rows);

  console.log('\n=== TRANSACTION TYPES BREAKDOWN FOR cc9 ===');
  const txTypes = await db.execute(`
    SELECT type, source, is_ca, is_cash_flow, count(1) as cnt, sum(net_amount) as total_net, sum(quantity) as total_qty 
    FROM Transactions 
    WHERE portfolio='cc9' 
    GROUP BY type, source, is_ca, is_cash_flow
    ORDER BY type, source
  `);
  txTypes.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== ALL DEPOSIT TRANSACTIONS ===');
  const deposits = await db.execute("SELECT id, date, type, symbol, quantity, price, net_amount, notes, source, batch_id FROM Transactions WHERE portfolio='cc9' AND UPPER(type)='DEPOSIT' ORDER BY date ASC");
  deposits.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== ALL WITHDRAWAL / OUT TRANSACTIONS ===');
  const outs = await db.execute("SELECT id, date, type, symbol, quantity, price, net_amount, notes, source, batch_id, is_ca, is_cash_flow FROM Transactions WHERE portfolio='cc9' AND (UPPER(type) LIKE '%WITHDRAW%' OR UPPER(type) LIKE '%OUT%') ORDER BY date ASC");
  outs.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== ALL SECURITY IN / TRANSFER IN TRANSACTIONS (Sample & Counts) ===');
  const secInSummary = await db.execute(`
    SELECT type, source, batch_id, count(1) as cnt, sum(net_amount) as total_net, min(date) as min_date, max(date) as max_date
    FROM Transactions 
    WHERE portfolio='cc9' AND (UPPER(type) LIKE '%SECURITY IN%' OR UPPER(type) LIKE '%TRANSFER IN%')
    GROUP BY type, source, batch_id
  `);
  secInSummary.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== ALL EXPENSES / MANAGEMENT FEES / TDS ===');
  const expSummary = await db.execute(`
    SELECT type, count(1) as cnt, sum(net_amount) as total_net
    FROM Transactions
    WHERE portfolio='cc9' AND UPPER(type) IN ('MANAGEMENT_FEE', 'MANAGEMENT', 'TDS', 'EXPENSE', 'STT_EXPENSE', 'CHARGES', 'BROKERAGE', 'ENTRY_LOAD', 'CUSTODY_CHARGES', 'AUDIT_CHARGES', 'DP_CHARGES')
    GROUP BY type
  `);
  expSummary.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== HOLDINGS IN DB FOR cc9 ===');
  const holdings = await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, ltp, current_value, unrealized_pnl FROM Holdings WHERE portfolio='cc9' ORDER BY current_value DESC");
  console.log(`Total holdings rows: ${holdings.rows.length}`);
  let sumCost = 0, sumVal = 0;
  holdings.rows.forEach(r => {
    sumCost += (r.total_cost || 0);
    sumVal += (r.current_value || 0);
    console.log(`${String(r.symbol).padEnd(15)} | Qty: ${String(r.quantity).padStart(8)} | Avg: ${String(r.avg_buy_price).padStart(10)} | Cost: ${String(r.total_cost).padStart(12)} | LTP: ${String(r.ltp).padStart(10)} | Val: ${String(r.current_value).padStart(12)}`);
  });
  console.log(`\nTotal DB Holdings Cost: ${sumCost}, Value: ${sumVal}`);
}

main().catch(console.error);
