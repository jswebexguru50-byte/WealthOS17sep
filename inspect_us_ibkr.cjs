const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  console.log("=== INSPECTING US - IBKR HOLDINGS & PRICES ===");

  const holdings = await db.execute(`
    SELECT 
      portfolio,
      symbol,
      isin,
      quantity,
      avg_buy_price,
      total_cost,
      ltp,
      prev_close,
      current_value,
      unrealized_pnl,
      unrealized_pct,
      currency,
      native_ltp,
      native_current_value,
      native_total_cost,
      native_avg_buy_price,
      data_source,
      data_status,
      last_update
    FROM Holdings
    WHERE portfolio = 'US - IBKR'
  `);

  console.log("Holdings in US - IBKR:");
  for (const h of holdings.rows) {
    console.log(`Symbol: ${h.symbol} | Qty: ${h.quantity} | AvgBuy: $${h.native_avg_buy_price} (₹${h.avg_buy_price}) | TotalCost: ₹${h.total_cost} | LTP: $${h.native_ltp} (₹${h.ltp}) | CurVal: ₹${h.current_value} | UnPnl: ₹${h.unrealized_pnl} (${h.unrealized_pct}%) | Status: ${h.data_status}`);
  }

  // Check MasterTickers for these symbols
  const syms = holdings.rows.map(h => h.symbol);
  const mt = await db.execute(`
    SELECT symbol, isin, name, exchange, currency, last_price, previous_close, last_updated
    FROM MasterTickers
    WHERE symbol IN (${syms.map(s => `'${s}'`).join(',')})
  `);
  console.log("\nMasterTickers for US tickers:");
  for (const m of mt.rows) {
    console.log(`Symbol: ${m.symbol} | Name: ${m.name} | LastPrice: $${m.last_price} | PrevClose: $${m.previous_close} | Updated: ${m.last_updated}`);
  }

  // Check FX rates in AppConfig or USD rate
  const fx = await db.execute("SELECT * FROM AppConfig WHERE key LIKE '%usd%' OR key LIKE '%fx%' OR key LIKE '%rate%'");
  console.log("\nFX / USD Config in DB:");
  console.log(JSON.stringify(fx.rows, null, 2));

  // Check Transactions for US - IBKR
  const tx = await db.execute("SELECT id, date, type, symbol, quantity, price, gross_amount, net_amount, notes FROM Transactions WHERE portfolio = 'US - IBKR'");
  console.log("\nTransactions for US - IBKR:");
  console.log(JSON.stringify(tx.rows, null, 2));

  process.exit(0);
}

main().catch(console.error);
