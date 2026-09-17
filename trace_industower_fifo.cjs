const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT id, date, portfolio, type, isin, symbol, quantity, price, net_amount, notes FROM Transactions WHERE portfolio = 'IIFL360' AND (symbol LIKE '%INDUSTOWER%' OR symbol LIKE '%APOLLO%') ORDER BY date ASC, id ASC", [], (err, txns) => {
  console.log('TRACE_TXNS_COUNT:', txns.length);
  const buyQueues = {};

  for (const r of txns) {
    const tType = String(r.type).toUpperCase().trim();
    let resolvedType = tType;
    if (
      tType.includes('BUYBACK') ||
      tType.includes('TENDER') ||
      tType.includes('MERGER_OUT') ||
      tType.includes('MERGED_OUT') ||
      tType.includes('MERGED') ||
      tType.includes('SELL') ||
      tType.includes('SALE') ||
      tType.includes('REDEMPTION') ||
      tType.includes('ROUNDING') ||
      tType.includes('TRANSFER OUT') ||
      tType.includes('SECURITY OUT')
    ) {
      resolvedType = 'SELL';
    } else if (
      tType.includes('MERGER') ||
      tType.includes('BUY') ||
      tType.includes('PURCHASE') ||
      tType.includes('IPO') ||
      tType.includes('ALLOTMENT') ||
      tType.includes('INVESTMENT') ||
      tType.includes('REINVEST') ||
      tType.includes('TRANSFER IN') ||
      tType.includes('SECURITY IN')
    ) {
      resolvedType = 'BUY';
    }

    const groupKey = `${r.portfolio}::${r.isin || r.symbol}::${r.symbol}::NA`;
    if (!buyQueues[groupKey]) buyQueues[groupKey] = [];

    if (resolvedType === 'BUY') {
      buyQueues[groupKey].push({ date: r.date, qty: r.quantity, price: r.price });
      console.log(`[BUY] ${r.date} ${r.symbol} qty=${r.quantity} price=${r.price}`);
    } else if (resolvedType === 'SELL') {
      let sellQty = r.quantity;
      console.log(`[SELL/OUT] ${r.date} ${r.symbol} (${tType}) qty=${sellQty} price=${r.price}`);
      const queue = buyQueues[groupKey];
      while (sellQty > 0.0001 && queue.length > 0) {
        const lot = queue[0];
        const match = Math.min(sellQty, lot.qty);
        lot.qty -= match;
        sellQty -= match;
        if (lot.qty <= 0.0001) queue.shift();
      }
      if (sellQty > 0.0001) {
        console.log(`  -> UNMATCHED SELL QTY: ${sellQty}`);
      }
    }
  }

  console.log('\nFINAL_QUEUES:');
  for (const [k, q] of Object.entries(buyQueues)) {
    const rem = q.reduce((s, x) => s + x.qty, 0);
    console.log(k, 'Remaining:', rem, q);
  }
});
