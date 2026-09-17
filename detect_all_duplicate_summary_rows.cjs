const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  console.log("==========================================================================================");
  console.log("        COMPREHENSIVE AUDIT: DETECTING SUMMARY ROWS DUPLICATING TRADEBOOK FILLS          ");
  console.log("==========================================================================================\n");

  // Fetch all transactions across all portfolios
  const allTx = await db.execute(`
    SELECT id, portfolio, date, type, symbol, isin, quantity, price, gross_amount, net_amount, source, notes, batch_id
    FROM Transactions
    ORDER BY portfolio, symbol, date ASC, id ASC
  `);

  console.log(`Total transactions in database: ${allTx.rows.length}\n`);

  // Group by portfolio + clean symbol + date + type
  const groupMap = new Map();

  for (const t of allTx.rows) {
    const portfolio = t.portfolio || 'UNKNOWN';
    let sym = String(t.symbol || '').toUpperCase().trim();
    if (!sym || sym === 'CASH' || sym.startsWith('CASH:')) continue;
    // Normalize symbol
    const cleanSym = sym.replace(/-(SM|ST|MT|M|BE|EQ)$/i, '').trim();
    const date = String(t.date || '').split('T')[0].trim();
    const type = String(t.type || '').toUpperCase().trim();
    
    // Standardize Buy / Sell
    let stdType = type;
    if (type.includes('BUY') || type.includes('PURCHASE')) stdType = 'BUY';
    else if (type.includes('SELL') || type.includes('SALE')) stdType = 'SELL';
    else continue; // Only check buy/sell trades

    const key = `${portfolio}|||${cleanSym}|||${date}|||${stdType}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key).push(t);
  }

  const suspiciousCases = [];

  for (const [key, rows] of groupMap.entries()) {
    if (rows.length < 2) continue; // Need at least 2 rows on the same date to have a summary vs fills duplicate

    const [portfolio, symbol, date, stdType] = key.split('|||');

    // Sort by quantity descending
    const sorted = [...rows].sort((a, b) => b.quantity - a.quantity);
    
    // Check if the largest row (or any single row) equals the sum of the remaining rows
    for (let i = 0; i < sorted.length; i++) {
      const candidateSummary = sorted[i];
      const others = sorted.filter((_, idx) => idx !== i);

      const sumOthersQty = others.reduce((acc, r) => acc + Number(r.quantity || 0), 0);
      const sumOthersAmt = others.reduce((acc, r) => acc + Number(r.gross_amount || r.net_amount || (r.quantity * r.price) || 0), 0);
      const candQty = Number(candidateSummary.quantity || 0);
      const candAmt = Number(candidateSummary.gross_amount || candidateSummary.net_amount || (candidateSummary.quantity * candidateSummary.price) || 0);

      // Condition 1: Exact sum of remaining rows equals the candidate summary row
      if (Math.abs(candQty - sumOthersQty) < 0.001 && candQty > 0 && others.length >= 2) {
        suspiciousCases.push({
          portfolio,
          symbol,
          date,
          type: stdType,
          summaryRow: candidateSummary,
          childRows: others,
          matchType: 'EXACT_SUM_OF_ALL_OTHERS',
          confidence: 'HIGH'
        });
        break;
      }

      // Condition 2: Subset sum - check if candidate summary equals the sum of a subset of other rows
      if (others.length > 2 && candQty > 0) {
        // Find subsets of others that sum to candQty
        const subset = findSubsetSum(others, candQty);
        if (subset && subset.length >= 2) {
          suspiciousCases.push({
            portfolio,
            symbol,
            date,
            type: stdType,
            summaryRow: candidateSummary,
            childRows: subset,
            matchType: 'EXACT_SUM_OF_SUBSET',
            confidence: 'HIGH'
          });
          break;
        }
      }
    }
  }

  // Subset sum helper function
  function findSubsetSum(items, target) {
    function backtrack(start, currentSum, currentArr) {
      if (Math.abs(currentSum - target) < 0.001 && currentArr.length >= 2) {
        return currentArr;
      }
      if (currentSum > target + 0.001) return null;
      for (let i = start; i < items.length; i++) {
        const res = backtrack(i + 1, currentSum + Number(items[i].quantity || 0), [...currentArr, items[i]]);
        if (res) return res;
      }
      return null;
    }
    return backtrack(0, 0, []);
  }

  // Cross check against active Holdings table
  const activeHoldings = await db.execute("SELECT portfolio, symbol, isin, quantity FROM Holdings WHERE quantity > 0 ORDER BY portfolio, symbol");
  const activeHoldingsMap = new Set(activeHoldings.rows.map(h => `${h.portfolio}|||${h.symbol.toUpperCase().replace(/-(SM|ST|MT|M|BE|EQ)$/i, '').trim()}`));

  console.log(`==========================================================================================`);
  console.log(`                         DETECTED SUSPICIOUS / DUPLICATE SUMMARY ROWS                     `);
  console.log(`==========================================================================================\n`);

  if (suspiciousCases.length === 0) {
    console.log("✅ No duplicate summary rows detected across any portfolio or stock!");
  } else {
    console.log(`Found ${suspiciousCases.length} instance(s) of potential summary rows duplicating trade fills:\n`);

    suspiciousCases.forEach((sc, idx) => {
      const isOnHolding = activeHoldingsMap.has(`${sc.portfolio}|||${sc.symbol}`);
      console.log(`------------------------------------------------------------------------------------------`);
      console.log(`[CASE ${idx + 1}] Portfolio: ${sc.portfolio} | Stock: ${sc.symbol} | Date: ${sc.date} | Type: ${sc.type}`);
      console.log(`  Status in Live Portfolio: ${isOnHolding ? '📌 CURRENTLY ON-HAND ACTIVE HOLDING' : '⚪ Historical / Exited Stock'}`);
      console.log(`  Pattern: ${sc.matchType} (Confidence: ${sc.confidence})`);
      console.log(`\n  👉 Candidate Summary Row:`);
      console.log(`     [ID: ${sc.summaryRow.id}] Qty: ${sc.summaryRow.quantity} @ ₹${sc.summaryRow.price} | Amt: ₹${sc.summaryRow.gross_amount} | Source: ${sc.summaryRow.source || 'N/A'}`);
      console.log(`\n  👉 Granular Child Tradebook Fills (${sc.childRows.length} rows, Sum Qty = ${sc.childRows.reduce((a, r) => a + Number(r.quantity), 0)}):`);
      sc.childRows.forEach(cr => {
        console.log(`     [ID: ${cr.id}] Qty: ${cr.quantity} @ ₹${cr.price} | Amt: ₹${cr.gross_amount} | Source: ${cr.source || 'N/A'}`);
      });
      console.log(`------------------------------------------------------------------------------------------\n`);
    });
  }

  process.exit(0);
}

main().catch(console.error);
