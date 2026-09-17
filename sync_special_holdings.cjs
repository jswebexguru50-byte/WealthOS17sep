const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  
  // 1. Ensure SBIFUN in cc9 is 1,700 shares
  await db.execute(`
    INSERT OR REPLACE INTO Holdings (
      portfolio, isin, folio, symbol, quantity, avg_buy_price, total_cost, ltp, prev_close,
      day_change, day_change_pct, current_value, unrealized_pnl, unrealized_pct,
      data_source, data_status, last_update, currency,
      native_ltp, native_current_value, native_total_cost, native_avg_buy_price, native_unrealized_pnl
    ) VALUES (
      'cc9', 'SBIFUN-UNKNOWN', 'NA', 'SBIFUN', 1700, 577.4565, 981676.05, 563.45, 563.45,
      0, 0, 957865.00, -23811.05, -2.43,
      'PMS Statement', 'LIVE', CURRENT_TIMESTAMP, 'INR',
      563.45, 957865.00, 981676.05, 577.4565, -23811.05
    )
  `);

  // 2. Ensure INVICTA in Maa is 50,000 shares
  await db.execute(`
    INSERT OR REPLACE INTO Holdings (
      portfolio, isin, folio, symbol, quantity, avg_buy_price, total_cost, ltp, prev_close,
      day_change, day_change_pct, current_value, unrealized_pnl, unrealized_pct,
      data_source, data_status, last_update, currency,
      native_ltp, native_current_value, native_total_cost, native_avg_buy_price, native_unrealized_pnl
    ) VALUES (
      'Maa', 'INE0XJ501010', 'NA', 'INVICTA', 50000, 85.00, 4250000.00, 85.00, 85.00,
      0, 0, 4250000.00, 0, 0,
      'IPO Allotment', 'LIVE', CURRENT_TIMESTAMP, 'INR',
      85.00, 4250000.00, 4250000.00, 85.00, 0
    )
  `);

  // 3. Ensure Solitario Lab Grown in Maa is 450 shares
  await db.execute(`
    INSERT OR REPLACE INTO Holdings (
      portfolio, isin, folio, symbol, quantity, avg_buy_price, total_cost, ltp, prev_close,
      day_change, day_change_pct, current_value, unrealized_pnl, unrealized_pct,
      data_source, data_status, last_update, currency,
      native_ltp, native_current_value, native_total_cost, native_avg_buy_price, native_unrealized_pnl
    ) VALUES (
      'Maa', 'INE1HBH01016', 'NA', 'Solitario Lab Grown Private Limited', 450, 11100.00, 4995000.00, 11100.00, 11100.00,
      0, 0, 4995000.00, 0, 0,
      'Unlisted Allotment', 'LIVE', CURRENT_TIMESTAMP, 'INR',
      11100.00, 4995000.00, 4995000.00, 11100.00, 0
    )
  `);

  console.log("Holdings updated for SBIFUN, INVICTA, and Solitario Lab Grown.");
  process.exit(0);
}

main().catch(console.error);
