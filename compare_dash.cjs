const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:./portfolio.db' });

async function compareDashboardVsCommandCenter() {
  console.log("=== COMPARING DASHBOARD VS COMMAND CENTER METRICS ===");

  // 1. Fetch dashboard metrics for Combined
  const resDash = await fetch('http://localhost:3000/api/dashboard');
  const dashData = await resDash.json();
  console.log("\n1. /api/dashboard summary metrics:");
  console.log("   total_invested:", dashData.metrics?.total_invested);
  console.log("   current_value: ", dashData.metrics?.current_value);
  console.log("   unrealized_pnl:", dashData.metrics?.unrealized_pnl);
  console.log("   unrealized_pct:", dashData.metrics?.unrealized_pct);
  console.log("   day_change:    ", dashData.metrics?.day_change);
  console.log("   day_change_pct:", dashData.metrics?.day_change_pct);
  console.log("   holdings count:", dashData.holdings?.length);

  // 2. Fetch command-center summary metrics
  const resCC = await fetch('http://localhost:3000/api/command-center');
  const ccData = await resCC.json();
  console.log("\n2. /api/command-center summary metrics:");
  console.log("   totalCostBasisINR:    ", ccData.summary?.totalCostBasisINR);
  console.log("   totalPortfolioValINR: ", ccData.summary?.totalPortfolioValINR);
  console.log("   totalBankAndFdVal:    ", ccData.summary?.totalBankAndFdVal);
  console.log("   totalNetWorthINR:     ", ccData.summary?.totalNetWorthINR);
  console.log("   totalDayChangeINR:    ", ccData.summary?.totalDayChangeINR);

  // 3. Why is there a difference?
  // Let's inspect the US - IBKR holding in Holdings:
  const usHoldings = await db.execute("SELECT portfolio, symbol, quantity, avg_buy_price, total_cost, current_value, currency, native_current_value, native_total_cost FROM Holdings WHERE portfolio='US - IBKR'");
  console.log("\n3. US - IBKR holdings in DB:");
  usHoldings.rows.forEach(r => console.log("   ", r));
}

compareDashboardVsCommandCenter().catch(console.error);
