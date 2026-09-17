const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  // Fetch all transactions across all portfolios
  const allTx = await db.execute(`
    SELECT id, portfolio, date, type, symbol, isin, quantity, price, gross_amount, net_amount, source, notes, batch_id
    FROM Transactions
    ORDER BY portfolio, symbol, date ASC, id ASC
  `);

  // Active Holdings
  const activeHoldings = await db.execute("SELECT portfolio, symbol, isin, quantity FROM Holdings WHERE quantity > 0 ORDER BY portfolio, symbol");
  const activeHoldingsMap = new Set(activeHoldings.rows.map(h => `${h.portfolio}|||${h.symbol.toUpperCase().replace(/-(SM|ST|MT|M|BE|EQ)$/i, '').trim()}`));

  const groupMap = new Map();

  for (const t of allTx.rows) {
    const portfolio = t.portfolio || 'UNKNOWN';
    let sym = String(t.symbol || '').toUpperCase().trim();
    if (!sym || sym === 'CASH' || sym.startsWith('CASH:')) continue;
    const cleanSym = sym.replace(/-(SM|ST|MT|M|BE|EQ)$/i, '').trim();
    const date = String(t.date || '').split('T')[0].trim();
    const type = String(t.type || '').toUpperCase().trim();
    
    let stdType = type;
    if (type.includes('BUY') || type.includes('PURCHASE')) stdType = 'BUY';
    else if (type.includes('SELL') || type.includes('SALE')) stdType = 'SELL';
    else continue;

    const key = `${portfolio}|||${cleanSym}|||${date}|||${stdType}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key).push(t);
  }

  const suspiciousCases = [];

  for (const [key, rows] of groupMap.entries()) {
    if (rows.length < 2) continue;

    const [portfolio, symbol, date, stdType] = key.split('|||');
    const sorted = [...rows].sort((a, b) => b.quantity - a.quantity);
    
    for (let i = 0; i < sorted.length; i++) {
      const candidateSummary = sorted[i];
      const others = sorted.filter((_, idx) => idx !== i);

      const sumOthersQty = others.reduce((acc, r) => acc + Number(r.quantity || 0), 0);
      const candQty = Number(candidateSummary.quantity || 0);

      if (Math.abs(candQty - sumOthersQty) < 0.001 && candQty > 0 && others.length >= 2) {
        suspiciousCases.push({
          portfolio,
          symbol,
          date,
          type: stdType,
          summaryRow: candidateSummary,
          childRows: others,
          matchType: 'EXACT_SUM_OF_ALL_OTHERS'
        });
        break;
      }

      if (others.length > 2 && candQty > 0) {
        const subset = findSubsetSum(others, candQty);
        if (subset && subset.length >= 2) {
          suspiciousCases.push({
            portfolio,
            symbol,
            date,
            type: stdType,
            summaryRow: candidateSummary,
            childRows: subset,
            matchType: 'EXACT_SUM_OF_SUBSET'
          });
          break;
        }
      }
    }
  }

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

  console.log(`Total Detected Cases: ${suspiciousCases.length}\n`);

  const activeCases = suspiciousCases.filter(sc => activeHoldingsMap.has(`${sc.portfolio}|||${sc.symbol}`));
  const historicalCases = suspiciousCases.filter(sc => !activeHoldingsMap.has(`${sc.portfolio}|||${sc.symbol}`));

  console.log(`=== A. ON-HAND ACTIVE HOLDINGS (${activeCases.length} cases detected) ===`);
  activeCases.forEach((sc, i) => {
    console.log(`${i + 1}. [${sc.portfolio}] ${sc.symbol} on ${sc.date} (${sc.type}): Summary ID ${sc.summaryRow.id} (Qty: ${sc.summaryRow.quantity}) duplicates ${sc.childRows.length} fills [IDs: ${sc.childRows.map(r => r.id).join(', ')}]`);
  });

  console.log(`\n=== B. HISTORICAL / EXITED STOCKS (${historicalCases.length} cases detected) ===`);
  historicalCases.forEach((sc, i) => {
    console.log(`${i + 1}. [${sc.portfolio}] ${sc.symbol} on ${sc.date} (${sc.type}): Summary ID ${sc.summaryRow.id} (Qty: ${sc.summaryRow.quantity}) duplicates ${sc.childRows.length} fills [IDs: ${sc.childRows.map(r => r.id).join(', ')}]`);
  });

  process.exit(0);
}

main().catch(console.error);
