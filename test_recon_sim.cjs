const { createClient } = require('@libsql/client');
const fs = require('fs');

function parseCSV(text) {
  const lines = text.split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        row.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    row.push(cur.trim());
    rows.push(row);
  }
  return rows;
}

function normalizeName(name) {
  if (!name) return '';
  return name.toUpperCase()
    .replace(/LIMITED/g, 'LTD')
    .replace(/AND/g, '&')
    .replace(/[^A-Z0-9]/g, '');
}

async function main() {
  // We can query the in-memory or a copy, or simulate FIFO
  const db = createClient({ url: 'file:./portfolio.db' });

  // 1. Parse statement
  const raw = fs.readFileSync('cc9_portfolio_statement_20260823.csv', 'utf8');
  const rows = parseCSV(raw);

  const stmtHoldings = [];
  let isEquitySection = false;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const col0 = (r[0] || '').replace(/"/g, '').trim();
    if (col0 === 'Security' || col0 === 'Shares') {
      isEquitySection = true;
      continue;
    }
    if (col0 === 'Total' || col0.startsWith('Cash') || col0.startsWith('Other')) {
      isEquitySection = false;
      continue;
    }
    if (isEquitySection && col0 && col0 !== 'Equity' && col0 !== 'Shares') {
      const qty = parseFloat((r[3] || '0').replace(/,/g, ''));
      const unitCost = parseFloat((r[4] || '0').replace(/,/g, ''));
      const totalCost = parseFloat((r[5] || '0').replace(/,/g, ''));
      const mktPrice = parseFloat((r[6] || '0').replace(/,/g, ''));
      const mktVal = parseFloat((r[7] || '0').replace(/,/g, ''));
      if (!isNaN(qty) && qty > 0) {
        stmtHoldings.push({
          securityName: col0,
          normName: normalizeName(col0),
          qty,
          unitCost,
          totalCost,
          mktPrice,
          mktVal
        });
      }
    }
  }

  // Check all transactions without the duplicate SECURITY IN/OUT from PMS-1787815999863
  const txs = await db.execute(`
    SELECT id, date, type, symbol, isin, quantity, price, net_amount, source, batch_id, is_ca, is_cash_flow
    FROM Transactions
    WHERE portfolio='cc9'
      AND NOT (batch_id='PMS-1787815999863' AND UPPER(type) IN ('SECURITY IN', 'SECURITY OUT'))
    ORDER BY date ASC, id ASC
  `);

  console.log(`Transactions after excluding duplicate SECURITY IN/OUT: ${txs.rows.length}`);

  // Let's compute running FIFO / net quantities for each symbol
  const stockQty = {};
  const stockCost = {};

  txs.rows.forEach(t => {
    const type = (t.type || '').toUpperCase();
    const sym = (t.symbol || '').toUpperCase().trim();
    const qty = Number(t.quantity || 0);
    const amt = Number(t.net_amount || (qty * t.price) || 0);

    if (!sym || sym === 'CASH' || qty === 0) return;

    if (['BUY', 'PURCHASE', 'TRANSFER IN', 'SECURITY IN', 'BONUS', 'SPLIT'].includes(type)) {
      stockQty[sym] = (stockQty[sym] || 0) + qty;
    } else if (['SELL', 'SALE', 'TRANSFER OUT', 'SECURITY OUT'].includes(type)) {
      stockQty[sym] = (stockQty[sym] || 0) - qty;
    }
  });

  console.log('\n=== SIMULATED NET QUANTITIES vs STATEMENT ===');
  // Build name/symbol mapping
  const symbolMap = {
    [normalizeName("AMARA RAJA ENERGY & MOBILITY LIMITED")]: "ARE&M",
    [normalizeName("APL APOLLO TUBES LTD")]: "APLAPOLLO",
    [normalizeName("AZAD ENGINEERING LTD")]: "AZAD",
    [normalizeName("BAJAJ FINANCE LTD")]: "BAJFINANCE",
    [normalizeName("BAJAJ HOUSING FINANCE LTD")]: "BAJAJHFL",
    [normalizeName("BANK OF BARODA")]: "BANKBARODA",
    [normalizeName("BHARAT ELECTRONICS LTD")]: "BEL",
    [normalizeName("BHARTI AIRTEL LTD")]: "BHARTIARTL",
    [normalizeName("BILLIONBRAINS GARAGE VENTURES LTD")]: "BGVL",
    [normalizeName("BLUE JET HEALTHCARE LTD")]: "BLUEJET",
    [normalizeName("CENTRAL DEPOSITORY SERVICES INDIA LTD")]: "CDSL",
    [normalizeName("CG POWER AND INDUSTRIAL SOLUTIONS LTD")]: "CGPOWER",
    [normalizeName("DIVIS LABORATORIES LTD")]: "DIVISLAB",
    [normalizeName("DIXON TECHNOLOGIES INDIA LTD")]: "DIXON",
    [normalizeName("EPL LTD")]: "EPL",
    [normalizeName("ETERNAL LTD")]: "ETERNAL",
    [normalizeName("FEDERAL BANK LTD")]: "FEDERALBNK",
    [normalizeName("FRATELLI VINEYARDS LTD")]: "FRATELLI",
    [normalizeName("GANESHA ECOSPHERE LTD")]: "GANECOS",
    [normalizeName("GOKALDAS EXPORTS LTD")]: "GOKEX",
    [normalizeName("HDFC BANK LTD")]: "HDFCBANK",
    [normalizeName("HINDUSTAN AERONAUTICS LTD")]: "HAL",
    [normalizeName("HIRECT LTD")]: "HIRECT",
    [normalizeName("HOME FIRST FINANCE COMPANY INDIA LTD")]: "HOMEFIRST",
    [normalizeName("J G CHEMICALS LTD")]: "JGCHEM",
    [normalizeName("KPIT TECHNOLOGIES LTD")]: "KPITTECH",
    [normalizeName("LARSEN and TOUBRO LTD")]: "LT",
    [normalizeName("LAURUS LABS LTD")]: "LAURUSLABS",
    [normalizeName("MAHINDRA and MAHINDRA LTD")]: "M&M",
    [normalizeName("MAZAGON DOCK SHIPBUILDERS LTD")]: "MAZDOCK",
    [normalizeName("MEESHO LTD")]: "MEESHO",
    [normalizeName("NARAYANA HRUDAYALAYA LTD")]: "NH",
    [normalizeName("OLECTRA GREENTECH LTD")]: "OLECTRA",
    [normalizeName("ONE 97 COMMUNICATIONS LTD")]: "PAYTM",
    [normalizeName("PIDILITE INDUSTRIES LTD")]: "PIDILITIND",
    [normalizeName("POLYCAB INDIA LTD")]: "POLYCAB",
    [normalizeName("RAJRATAN GLOBAL WIRE LTD")]: "RAJRATAN",
    [normalizeName("RBL BANK LTD")]: "RBLBANK",
    [normalizeName("RELIANCE INDUSTRIES LTD")]: "RELIANCE",
    [normalizeName("SBI FUNDS MANAGEMENT LTD")]: "SBIFUN",
    [normalizeName("SOLAR INDUSTRIES INDIA LTD")]: "SOLARINDS",
    [normalizeName("STATE BANK OF INDIA")]: "SBIN",
    [normalizeName("TATA CONSUMER PRODUCTS LTD")]: "TATACONSUM",
    [normalizeName("TATA MOTORS LTD")]: "TATAMOTORS",
    [normalizeName("TATA POWER CO LTD")]: "TATAPOWER",
    [normalizeName("TINNA RUBBER and INFRASTRUCTURE LTD")]: "TINNARUBR",
    [normalizeName("UNO MINDA LTD")]: "UNOMINDA",
    [normalizeName("ZEN TECHNOLOGIES LTD")]: "ZENTEC"
  };

  let matchCount = 0;
  let mismatchCount = 0;
  const matchedSyms = new Set();

  stmtHoldings.forEach(sh => {
    let sym = symbolMap[sh.normName] || sh.normName;
    // Check if sym or alternate matches in stockQty
    let q = stockQty[sym];
    if (q === undefined) {
      // search
      for (const k of Object.keys(stockQty)) {
        if (normalizeName(k) === sh.normName || k === sym) {
          sym = k;
          q = stockQty[k];
          break;
        }
      }
    }
    const finalQty = q !== undefined ? Math.round(q * 100) / 100 : 0;
    const diff = finalQty - sh.qty;
    const isMatch = Math.abs(diff) < 0.01;
    if (isMatch) matchCount++; else mismatchCount++;
    matchedSyms.add(sym);

    console.log(`${sh.securityName.substring(0, 32).padEnd(34)} | Stmt: ${String(sh.qty).padStart(6)} | Calc: ${String(finalQty).padStart(6)} | Diff: ${String(diff).padStart(6)} | ${isMatch ? 'MATCH ✅' : 'MISMATCH ❌'} (${sym})`);
  });

  console.log(`\nResults: ${matchCount} matches / ${stmtHoldings.length} total (${mismatchCount} mismatches)`);

  // Check remaining non-zero quantities in stockQty not in statement
  console.log('\n=== REMAINING STOCKS WITH NON-ZERO QUANTITY NOT IN STATEMENT ===');
  let extraCount = 0;
  for (const [k, v] of Object.entries(stockQty)) {
    if (!matchedSyms.has(k) && Math.abs(v) > 0.01) {
      console.log(`Extra: ${k.padEnd(15)} Qty: ${v}`);
      extraCount++;
    }
  }
  if (extraCount === 0) console.log('None! All other stocks have 0 quantity! ✅');
}

main().catch(console.error);
