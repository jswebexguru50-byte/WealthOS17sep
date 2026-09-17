const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('portfolio.db');

async function runAudit() {
  console.log('=== FULL METRICS & DATA AUDIT REPORT ===');

  // 1. Bank Accounts and FDs
  const bankRows = await new Promise(res => db.all('SELECT * FROM BankAccountsAndFDs', (err, r) => res(r || [])));
  console.log('\n--- 1. BankAccountsAndFDs ---');
  console.log('Total Records:', bankRows.length);
  let totalBankInr = 0;
  bankRows.forEach(b => {
    const rate = b.currency === 'AED' ? 22.7 : (b.currency === 'USD' ? 83.5 : 1.0);
    const inr = b.balance_amount * rate;
    totalBankInr += inr;
    console.log(`  - [${b.portfolio}] ${b.name}: ${b.currency} ${b.balance_amount} (~INR ${Math.round(inr).toLocaleString('en-IN')})`);
  });
  console.log(`Total Bank & FD Valuation: INR ${Math.round(totalBankInr).toLocaleString('en-IN')}`);

  // 2. Holdings Breakdown by Portfolio
  console.log('\n--- 2. Holdings by Portfolio ---');
  const portRows = await new Promise(res => db.all(`
    SELECT 
      portfolio, 
      COUNT(*) as scrips, 
      ROUND(SUM(total_cost)) as cost, 
      ROUND(SUM(current_value)) as cur_val,
      ROUND(SUM(unrealized_pnl)) as pnl,
      ROUND(SUM(day_change)) as day_chg
    FROM Holdings 
    WHERE quantity > 0 
    GROUP BY portfolio 
    ORDER BY cur_val DESC
  `, (err, r) => res(r || [])));
  console.table(portRows);

  // 3. Command Center Allowed Portfolios Check for Member 1 vs All
  console.log('\n--- 3. Portfolios and Member Permissions ---');
  const allPorts = await new Promise(res => db.all('SELECT id, name, member_id, type, status FROM Portfolios', (err, r) => res(r || [])));
  console.table(allPorts);

  const memPerms = await new Promise(res => db.all('SELECT * FROM MemberPortfolioPermissions', (err, r) => res(r || [])));
  console.log('Member Permissions:', memPerms);

  // 4. Realized Gains Summary
  console.log('\n--- 4. Realized Gains Audit ---');
  const rgSummary = await new Promise(res => db.all(`
    SELECT 
      portfolio, 
      COUNT(*) as count, 
      ROUND(SUM(buy_cost)) as buy_cost, 
      ROUND(SUM(sell_proceeds)) as sell_proceeds, 
      ROUND(SUM(realized_pnl)) as realized_pnl,
      ROUND(SUM(taxable_pnl)) as taxable_pnl
    FROM RealizedGains 
    GROUP BY portfolio
  `, (err, r) => res(r || [])));
  console.table(rgSummary);

  // 5. Check if any duplicate rows exist in Transactions
  console.log('\n--- 5. Duplicate Transactions Check ---');
  const dupTxns = await new Promise(res => db.all(`
    SELECT portfolio, isin, symbol, date, type, quantity, price, COUNT(*) as cnt 
    FROM Transactions 
    GROUP BY portfolio, isin, symbol, date, type, quantity, price 
    HAVING cnt > 1 
    LIMIT 10
  `, (err, r) => res(r || [])));
  console.log('Potential duplicate transaction groups (showing max 10):', dupTxns.length);
  if (dupTxns.length > 0) console.table(dupTxns);

  // 6. Check DashboardDiskCache entries
  console.log('\n--- 6. DashboardDiskCache Entries ---');
  const cacheEntries = await new Promise(res => db.all('SELECT cache_key, updated_at FROM DashboardDiskCache', (err, r) => res(r || [])));
  console.table(cacheEntries);

  db.close();
}

runAudit();
