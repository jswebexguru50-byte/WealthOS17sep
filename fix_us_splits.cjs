const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  console.log("=== FIXING US ETF SPLIT QUANTITIES & VALUATIONS ===");

  const usdRate = 95.53;

  // 1. Update SCHG split transaction: Pre-split 629 shares, 4:1 split -> add 1887 shares
  await db.execute(`
    UPDATE Transactions 
    SET quantity = 1887, price = 0, gross_amount = 0, net_amount = 0, type = 'SPLIT', notes = 'Stock Split 4:1 (+1887 shares)'
    WHERE id = 119584 AND symbol = 'SCHG'
  `);

  // 2. Update VGT split transaction: Pre-split 156.0459 shares, 8:1 split -> add 1092.3213 shares
  await db.execute(`
    UPDATE Transactions 
    SET quantity = 1092.3213, price = 0, gross_amount = 0, net_amount = 0, type = 'SPLIT', notes = 'Stock Split 8:1 (+1092.3213 shares)'
    WHERE id = 119585 AND symbol = 'VGT'
  `);

  // 3. Update Holdings table for SCHG
  const schgQty = 2516;
  const schgLtpUsd = 35.31;
  const schgCostUsd = 61478.22; // Total historical bought cost
  const schgAvgUsd = schgCostUsd / schgQty;
  const schgValUsd = schgQty * schgLtpUsd;
  const schgUnrealPnlUsd = schgValUsd - schgCostUsd;

  await db.execute({
    sql: `UPDATE Holdings SET
      quantity = ?,
      avg_buy_price = ?,
      total_cost = ?,
      ltp = ?,
      prev_close = ?,
      current_value = ?,
      unrealized_pnl = ?,
      unrealized_pct = ?,
      native_ltp = ?,
      native_current_value = ?,
      native_total_cost = ?,
      native_avg_buy_price = ?,
      native_unrealized_pnl = ?,
      tax_cost_basis = ?,
      tax_avg_price = ?,
      data_status = 'LIVE',
      last_update = CURRENT_TIMESTAMP
    WHERE portfolio = 'US - IBKR' AND symbol = 'SCHG'`,
    args: [
      schgQty,
      schgAvgUsd * usdRate,
      schgCostUsd * usdRate,
      schgLtpUsd * usdRate,
      schgLtpUsd * usdRate,
      schgValUsd * usdRate,
      schgUnrealPnlUsd * usdRate,
      (schgUnrealPnlUsd / schgCostUsd) * 100,
      schgLtpUsd,
      schgValUsd,
      schgCostUsd,
      schgAvgUsd,
      schgUnrealPnlUsd,
      schgCostUsd * usdRate,
      schgAvgUsd * usdRate
    ]
  });

  // 4. Update Holdings table for VGT
  const vgtQty = 1248.3672;
  const vgtLtpUsd = 117.99;
  const vgtCostUsd = 61375.24; // Total historical bought cost
  const vgtAvgUsd = vgtCostUsd / vgtQty;
  const vgtValUsd = vgtQty * vgtLtpUsd;
  const vgtUnrealPnlUsd = vgtValUsd - vgtCostUsd;

  await db.execute({
    sql: `UPDATE Holdings SET
      quantity = ?,
      avg_buy_price = ?,
      total_cost = ?,
      ltp = ?,
      prev_close = ?,
      current_value = ?,
      unrealized_pnl = ?,
      unrealized_pct = ?,
      native_ltp = ?,
      native_current_value = ?,
      native_total_cost = ?,
      native_avg_buy_price = ?,
      native_unrealized_pnl = ?,
      tax_cost_basis = ?,
      tax_avg_price = ?,
      data_status = 'LIVE',
      last_update = CURRENT_TIMESTAMP
    WHERE portfolio = 'US - IBKR' AND symbol = 'VGT'`,
    args: [
      vgtQty,
      vgtAvgUsd * usdRate,
      vgtCostUsd * usdRate,
      vgtLtpUsd * usdRate,
      vgtLtpUsd * usdRate,
      vgtValUsd * usdRate,
      vgtUnrealPnlUsd * usdRate,
      (vgtUnrealPnlUsd / vgtCostUsd) * 100,
      vgtLtpUsd,
      vgtValUsd,
      vgtCostUsd,
      vgtAvgUsd,
      vgtUnrealPnlUsd,
      vgtCostUsd * usdRate,
      vgtAvgUsd * usdRate
    ]
  });

  console.log("✅ Successfully fixed US ETF stock splits for SCHG and VGT.");
  process.exit(0);
}

main().catch(console.error);
