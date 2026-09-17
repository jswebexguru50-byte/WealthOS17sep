const http = require('http');

function fetchJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve({ error: data.slice(0, 200) }); }
      });
    }).on('error', reject);
  });
}

async function main() {
  // 1. Dashboard breakdown
  const breakdown = await fetchJson('/api/dashboard/breakdown');
  console.log("=== 1. DASHBOARD BREAKDOWN ===");
  console.log("Totals:", JSON.stringify(breakdown.totals, null, 2));
  
  // 2. Per-portfolio analytics
  const analytics = await fetchJson('/api/portfolio-analytics');
  console.log("\n=== 2. PORTFOLIO ANALYTICS ===");
  if (analytics.portfolios) {
    for (const p of analytics.portfolios) {
      console.log(`${p.name}: Val=₹${p.currentValue?.toLocaleString()} | Cost=₹${p.totalCost?.toLocaleString()} | XIRR=${p.xirr}% | Realized=₹${p.realizedPnl?.toLocaleString()} | Unrealized=₹${p.unrealizedPnl?.toLocaleString()} | Dividends=₹${p.dividends?.toLocaleString()}`);
    }
  } else {
    console.log(JSON.stringify(analytics, null, 2).slice(0, 2000));
  }

  // 3. Scrip performance for a known stock (RELIANCE in CC9)
  const reliance = await fetchJson('/api/analytics/scrip-performance?query=RELIANCE');
  console.log("\n=== 3. SCRIP PERFORMANCE: RELIANCE ===");
  if (reliance.success) {
    const d = reliance.data || reliance;
    console.log(`Qty: ${d.current_quantity} | Val: ₹${d.current_value?.toLocaleString()} | Cost: ₹${d.total_cost?.toLocaleString()} | XIRR: ${d.xirr}% | Realized: ₹${d.realized_pnl?.toLocaleString()} | Unrealized: ₹${d.unrealized_pnl?.toLocaleString()}`);
  } else {
    console.log(JSON.stringify(reliance, null, 2).slice(0, 500));
  }

  // 4. Tax summary
  const tax = await fetchJson('/api/tax-summary');
  console.log("\n=== 4. TAX SUMMARY ===");
  console.log(JSON.stringify(tax, null, 2).slice(0, 1500));

  // 5. RealizedGains summary
  const rg = await fetchJson('/api/realized-gains?limit=5');
  console.log("\n=== 5. REALIZED GAINS (Top 5) ===");
  console.log(JSON.stringify(rg, null, 2).slice(0, 1500));

  // 6. Holdings for CC9
  const cc9h = await fetchJson('/api/holdings?portfolio=cc9');
  console.log("\n=== 6. CC9 HOLDINGS (first 3) ===");
  const holdArr = cc9h.holdings || cc9h.data || cc9h;
  if (Array.isArray(holdArr)) {
    holdArr.slice(0, 3).forEach(h => console.log(`${h.symbol}: Qty=${h.quantity} | AvgBuy=₹${h.avg_buy_price?.toFixed(2)} | LTP=₹${h.ltp?.toFixed(2)} | UnPnl=₹${h.unrealized_pnl?.toFixed(2)} (${h.unrealized_pct?.toFixed(2)}%)`));
  } else {
    console.log(JSON.stringify(holdArr, null, 2).slice(0, 500));
  }
  
  process.exit(0);
}

main().catch(console.error);
