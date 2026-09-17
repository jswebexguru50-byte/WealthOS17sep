const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  
  console.log("=== CHECKING ALL ASSET TYPES & VALUATION IN DATABASE ===");
  
  // 1. Check CashAndFD
  const cfd = await db.execute("SELECT sum(current_balance) as total_cash FROM BankAccounts");
  const fd = await db.execute("SELECT sum(principal_amount) as total_fd FROM FixedDeposits WHERE status='ACTIVE'");
  console.log(`Bank Accounts Total: ₹${Number(cfd.rows[0].total_cash || 0).toLocaleString()}`);
  console.log(`Fixed Deposits Total: ₹${Number(fd.rows[0].total_fd || 0).toLocaleString()}`);

  // 2. Check Holdings per portfolio
  const h = await db.execute("SELECT portfolio, count(*) as count, sum(current_value) as val, sum(total_cost) as cost FROM Holdings GROUP BY portfolio");
  console.log("\nHoldings Table Summary:");
  h.rows.forEach(r => console.log(`  ${r.portfolio.padEnd(20)}: Count = ${String(r.count).padStart(3)} | Val = ₹${Number(r.val || 0).toLocaleString()} | Cost = ₹${Number(r.cost || 0).toLocaleString()}`));

  // 3. Check ZerodhaHoldings
  const zh = await db.execute("SELECT portfolio, count(*) as count, sum(quantity * avg_price) as cost FROM ZerodhaHoldings GROUP BY portfolio");
  console.log("\nZerodhaHoldings Table Summary:");
  zh.rows.forEach(r => console.log(`  ${r.portfolio.padEnd(20)}: Count = ${String(r.count).padStart(3)} | Cost = ₹${Number(r.cost || 0).toLocaleString()}`));

  // 4. Check if any duplicate rows in Holdings for cc9 or others
  const dups = await db.execute("SELECT portfolio, symbol, count(*) FROM Holdings GROUP BY portfolio, symbol HAVING count(*) > 1");
  console.log("\nDuplicate symbols in Holdings:", dups.rows);

  process.exit(0);
}

main().catch(console.error);
