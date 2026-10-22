import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('portfolio.db');

db.all(`
  SELECT 
    portfolio, 
    COUNT(*) as positions,
    SUM(total_cost) as cost_sum,
    SUM(current_value) as value_sum,
    SUM(unrealized_pnl) as pnl_sum
  FROM Holdings
  GROUP BY portfolio
  ORDER BY value_sum DESC
`, (err, rows) => {
  console.log('--- RECONCILED PORTFOLIO HOLDINGS ---');
  console.table((rows || []).map(r => ({
    portfolio: r.portfolio,
    positions: r.positions,
    cost_Cr: (r.cost_sum / 10000000).toFixed(4),
    val_Cr: (r.value_sum / 10000000).toFixed(4),
    pnl_Cr: (r.pnl_sum / 10000000).toFixed(4)
  })));

  const totalVal = (rows || []).reduce((s, r) => s + (r.value_sum || 0), 0);
  const totalCost = (rows || []).reduce((s, r) => s + (r.cost_sum || 0), 0);
  console.log(`TOTAL HOLDINGS VALUATION: ₹${(totalVal/10000000).toFixed(4)} Cr (Cost: ₹${(totalCost/10000000).toFixed(4)} Cr)`);
});
