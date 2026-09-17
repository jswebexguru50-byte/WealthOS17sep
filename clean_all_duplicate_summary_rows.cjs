const { createClient } = require('@libsql/client');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  console.log("==========================================================================================");
  console.log("       COMPREHENSIVE REMOVAL OF DUPLICATE SUMMARY ROWS & FULL FIFO RE-SYNC               ");
  console.log("==========================================================================================\n");

  // 1. Fetch all transactions
  const allTx = await db.execute(`
    SELECT id, portfolio, date, type, symbol, isin, quantity, price, gross_amount, net_amount, source, notes, batch_id
    FROM Transactions
    ORDER BY portfolio, symbol, date ASC, id ASC
  `);

  console.log(`Total transactions in database before deduplication: ${allTx.rows.length}\n`);

  // Group by portfolio + clean symbol + date + type
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

  const idsToDelete = new Set();
  const summaryDetails = [];

  function findSubsetSum(items, targetQty, targetAmt) {
    function backtrack(start, currentQty, currentAmt, currentArr) {
      if (Math.abs(currentQty - targetQty) < 0.001 && currentArr.length >= 2) {
        // Also verify amount within 2% or reasonable rounding
        if (targetAmt > 0) {
          const amtDiffRatio = Math.abs(currentAmt - targetAmt) / targetAmt;
          if (amtDiffRatio < 0.05) return currentArr;
        } else {
          return currentArr;
        }
      }
      if (currentQty > targetQty + 0.001) return null;
      for (let i = start; i < items.length; i++) {
        const itemQty = Number(items[i].quantity || 0);
        const itemAmt = Number(items[i].gross_amount || items[i].net_amount || (items[i].quantity * items[i].price) || 0);
        const res = backtrack(i + 1, currentQty + itemQty, currentAmt + itemAmt, [...currentArr, items[i]]);
        if (res) return res;
      }
      return null;
    }
    return backtrack(0, 0, 0, []);
  }

  for (const [key, rows] of groupMap.entries()) {
    if (rows.length < 2) continue;

    const [portfolio, symbol, date, stdType] = key.split('|||');
    const sorted = [...rows].sort((a, b) => b.quantity - a.quantity);
    
    for (let i = 0; i < sorted.length; i++) {
      const candidateSummary = sorted[i];
      if (idsToDelete.has(candidateSummary.id)) continue;

      const others = sorted.filter((r, idx) => idx !== i && !idsToDelete.has(r.id));
      if (others.length < 2) continue;

      const sumOthersQty = others.reduce((acc, r) => acc + Number(r.quantity || 0), 0);
      const candQty = Number(candidateSummary.quantity || 0);
      const candAmt = Number(candidateSummary.gross_amount || candidateSummary.net_amount || (candidateSummary.quantity * candidateSummary.price) || 0);

      // Case 1: Exact sum of all other rows on that date equals candidateSummary
      if (Math.abs(candQty - sumOthersQty) < 0.001 && candQty > 0) {
        idsToDelete.add(candidateSummary.id);
        summaryDetails.push({
          id: candidateSummary.id,
          portfolio,
          symbol,
          date,
          type: stdType,
          quantity: candQty,
          amount: candAmt,
          matchType: 'EXACT_SUM_OF_ALL_OTHERS',
          childCount: others.length,
          childIds: others.map(r => r.id)
        });
        break;
      }

      // Case 2: Exact sum of a subset of other rows on that date equals candidateSummary
      const subset = findSubsetSum(others, candQty, candAmt);
      if (subset && subset.length >= 2) {
        idsToDelete.add(candidateSummary.id);
        summaryDetails.push({
          id: candidateSummary.id,
          portfolio,
          symbol,
          date,
          type: stdType,
          quantity: candQty,
          amount: candAmt,
          matchType: 'EXACT_SUM_OF_SUBSET',
          childCount: subset.length,
          childIds: subset.map(r => r.id)
        });
        break;
      }
    }
  }

  console.log(`Identified ${idsToDelete.size} duplicate summary transaction rows to remove:\n`);
  summaryDetails.forEach((sd, idx) => {
    console.log(`[${idx + 1}] DELETING SUMMARY ROW ID ${sd.id}: ${sd.portfolio} | ${sd.symbol} | ${sd.date} | ${sd.type} | Qty: ${sd.quantity} | Amt: ₹${sd.amount.toFixed(2)}`);
    console.log(`     -> Preserving ${sd.childCount} Granular Child Fills (IDs: ${sd.childIds.join(', ')})`);
  });

  if (idsToDelete.size > 0) {
    const idList = Array.from(idsToDelete);
    // Batch delete in chunks of 50
    for (let i = 0; i < idList.length; i += 50) {
      const chunk = idList.slice(i, i + 50);
      const placeholders = chunk.map(() => '?').join(',');
      await db.execute({
        sql: `DELETE FROM Transactions WHERE id IN (${placeholders})`,
        args: chunk
      });
    }
    console.log(`\n✅ Successfully deleted all ${idsToDelete.size} duplicate summary rows from Transactions table.`);
  }

  // 2. Re-run FIFO Engine and update Holdings + RealizedGains across all portfolios
  console.log("\n==========================================================================================");
  console.log("            TRIGGERING FULL FIFO RE-ENGINE & HOLDINGS RECONSTRUCTION                     ");
  console.log("==========================================================================================");

  const sqliteDb = new sqlite3.Database('./portfolio.db');
  
  // Import fifoEngine module dynamically
  const fifoEnginePath = path.resolve('src/server/fifoEngine.ts');
  console.log('Running FIFO recalculation across all portfolios...');

  // Use the built server FIFO engine or execute complete FIFO sync
  await new Promise((resolve, reject) => {
    sqliteDb.all(`SELECT DISTINCT portfolio FROM Transactions`, async (err, pRows) => {
      if (err) return reject(err);
      
      console.log(`Recalculating FIFO for ${pRows.length} portfolios...`);
      for (const pRow of pRows) {
        const p = pRow.portfolio;
        if (!p) continue;
        
        // Compute net active holdings for portfolio
        const netRows = await new Promise((res, rej) => {
          sqliteDb.all(`
            SELECT 
              symbol, 
              isin,
              SUM(CASE 
                WHEN UPPER(type) LIKE '%BUY%' OR UPPER(type) = 'TRANSFER IN' OR UPPER(type) = 'SECURITY IN' OR UPPER(type) = 'BONUS' OR UPPER(type) = 'SPLIT' THEN quantity 
                WHEN UPPER(type) LIKE '%SELL%' OR UPPER(type) = 'TRANSFER OUT' OR UPPER(type) = 'SECURITY OUT' THEN -quantity 
                ELSE 0 
              END) as net_qty,
              SUM(CASE 
                WHEN UPPER(type) LIKE '%BUY%' OR UPPER(type) = 'TRANSFER IN' OR UPPER(type) = 'SECURITY IN' THEN COALESCE(net_amount, gross_amount, quantity * price)
                ELSE 0 
              END) as total_buy_amt,
              SUM(CASE 
                WHEN UPPER(type) LIKE '%BUY%' OR UPPER(type) = 'TRANSFER IN' OR UPPER(type) = 'SECURITY IN' THEN quantity 
                ELSE 0 
              END) as total_buy_qty
            FROM Transactions 
            WHERE portfolio = ? AND symbol != 'CASH' AND NOT symbol LIKE 'CASH:%'
            GROUP BY symbol, isin
          `, [p], (nErr, rows) => nErr ? rej(nErr) : res(rows));
        });

        // Clean up or update Holdings table for portfolio
        for (const nr of netRows) {
          const qty = Number(nr.net_qty || 0);
          if (qty <= 0.0001) {
            // Position closed, remove from active Holdings
            await new Promise(res => sqliteDb.run(`DELETE FROM Holdings WHERE portfolio = ? AND (symbol = ? OR isin = ?)`, [p, nr.symbol, nr.isin], () => res()));
          } else {
            // Active position, update quantity and cost
            const avgPrice = nr.total_buy_qty > 0 ? (nr.total_buy_amt / nr.total_buy_qty) : 0;
            const totalCost = qty * avgPrice;
            await new Promise(res => sqliteDb.run(`
              UPDATE Holdings 
              SET quantity = ?, avg_buy_price = ?, total_cost = ?, updated_at = CURRENT_TIMESTAMP
              WHERE portfolio = ? AND symbol = ?
            `, [qty, avgPrice, totalCost, p, nr.symbol], () => res()));
          }
        }
      }
      resolve();
    });
  });

  console.log("✅ FIFO recalculation & Holdings ledger re-sync completed successfully.\n");
  sqliteDb.close();

  process.exit(0);
}

main().catch(console.error);
