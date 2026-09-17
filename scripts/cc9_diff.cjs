const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT * FROM PmsSummaryHoldings WHERE portfolio = 'cc9'", (err, pmsRows) => {
  db.all("SELECT * FROM Holdings WHERE portfolio = 'cc9'", (err2, hRows) => {
    console.log('=== CC9 OFFICIAL STATEMENT (PmsSummaryHoldings) ===');
    console.log(`Total Statement Positions: ${pmsRows.length}`);
    const pmsCost = pmsRows.reduce((s, r) => s + r.total_cost, 0);
    const pmsVal = pmsRows.reduce((s, r) => s + r.current_value, 0);
    console.log(`Total Cost: ₹${(pmsCost/10000000).toFixed(4)} Cr`);
    console.log(`Total Val:  ₹${(pmsVal/10000000).toFixed(4)} Cr`);

    console.log('\n=== CC9 HOLDINGS TABLE (Holdings) ===');
    console.log(`Total DB Positions: ${hRows.length}`);
    const hCost = hRows.reduce((s, r) => s + r.total_cost, 0);
    const hVal = hRows.reduce((s, r) => s + r.current_value, 0);
    console.log(`Total Cost: ₹${(hCost/10000000).toFixed(4)} Cr`);
    console.log(`Total Val:  ₹${(hVal/10000000).toFixed(4)} Cr`);

    // Let's find which rows in hRows are NOT in pmsRows
    const pmsMap = new Map();
    pmsRows.forEach(r => pmsMap.set(r.isin, r));

    const extraRows = [];
    const matchedRows = [];
    hRows.forEach(h => {
      if (h.symbol === 'CASH') return;
      if (pmsMap.has(h.isin)) {
        matchedRows.push(h);
      } else {
        extraRows.push(h);
      }
    });

    console.log(`\nExtra Rows in Holdings NOT in official statement (${extraRows.length}):`);
    console.table(extraRows.map(h => ({
      symbol: h.symbol,
      isin: h.isin,
      qty: h.quantity,
      cost_L: (h.total_cost/100000).toFixed(2),
      val_L: (h.current_value/100000).toFixed(2),
      ltp: h.ltp,
      data_source: h.data_source
    })));

    const extraCost = extraRows.reduce((s, r) => s + r.total_cost, 0);
    const extraVal = extraRows.reduce((s, r) => s + r.current_value, 0);
    console.log(`Extra Cost: ₹${(extraCost/10000000).toFixed(4)} Cr`);
    console.log(`Extra Val:  ₹${(extraVal/10000000).toFixed(4)} Cr`);

    console.log(`\nMatched Rows Count: ${matchedRows.length}`);
    const matchedVal = matchedRows.reduce((s, r) => s + r.current_value, 0);
    console.log(`Matched Rows Valuation: ₹${(matchedVal/10000000).toFixed(4)} Cr`);
  });
});
