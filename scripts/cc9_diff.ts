import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('portfolio.db');

db.all(`
  SELECT 
    H.symbol, H.quantity, H.avg_buy_price, H.ltp, H.total_cost, H.current_value, H.data_source,
    P.quantity as pms_qty, P.avg_price as pms_avg, P.ltp as pms_ltp, P.current_value as pms_val
  FROM Holdings H
  LEFT JOIN PmsSummaryHoldings P ON (P.portfolio = 'cc9' AND (P.isin = H.isin OR P.symbol = H.symbol))
  WHERE H.portfolio = 'cc9'
  ORDER BY H.current_value DESC
`, (err, rows) => {
  console.log('--- cc9 Holdings vs PmsSummaryHoldings ---');
  console.table((rows || []).map(r => ({
    symbol: r.symbol,
    qty: r.quantity,
    ltp: r.ltp,
    pms_ltp: r.pms_ltp,
    val_L: (r.current_value / 100000).toFixed(2),
    pms_val_L: r.pms_val ? (r.pms_val / 100000).toFixed(2) : 'NONE',
    diff_L: r.pms_val ? ((r.current_value - r.pms_val) / 100000).toFixed(2) : 'NEW',
    source: r.data_source
  })));
});
