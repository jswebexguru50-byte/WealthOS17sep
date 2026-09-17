const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:./portfolio.db' });

async function setupDualCostBasis() {
  console.log("=== SETTING UP DUAL COST BASIS IN HOLDINGS ===");

  // 1. Check if columns exist in Holdings, add if missing
  const cols = await db.execute("PRAGMA table_info(Holdings)");
  const colNames = cols.rows.map(r => r.name);
  
  if (!colNames.includes('tax_cost_basis')) {
    await db.execute("ALTER TABLE Holdings ADD COLUMN tax_cost_basis REAL DEFAULT NULL");
    console.log("Added column: tax_cost_basis");
  }
  if (!colNames.includes('tax_avg_price')) {
    await db.execute("ALTER TABLE Holdings ADD COLUMN tax_avg_price REAL DEFAULT NULL");
    console.log("Added column: tax_avg_price");
  }

  // 2. We have the exact per-scrip Capital at Cost from the official Complete Circle Capital Register!
  // Map of Scrip Name -> { qty, costTotal, mktTotal, costPerSh }
  const capitalRegisterCosts = {
    'AEGIS LOGISTICS LTD': { symbol: 'AEGISLOG', costPerSh: 369.70 },
    'AFFLE 3I LTD': { symbol: 'AFFLE', costPerSh: 1095.00 },
    'ALKYL AMINES CHEMICALS LTD': { symbol: 'ALKYLAMINE', costPerSh: 3485.94 },
    'AMARA RAJA ENERGY & MOBILITY LIMITED': { symbol: 'ARE&M', costPerSh: 674.65 },
    'AMRUTANJAN HEALTH CARE LTD': { symbol: 'AMRUTANJAN', costPerSh: 818.70 },
    'APL APOLLO TUBES LTD': { symbol: 'APLAPOLLO', costPerSh: 1296.40 },
    'ASIAN PAINTS LTD': { symbol: 'ASIANPAINT', costPerSh: 3109.73 },
    'BAJAJ FINANCE LTD': { symbol: 'BAJFINANCE', costPerSh: 6952.37, postBonusCostPerSh: 527.19 },
    'BALAJI AMINES LTD': { symbol: 'BALAMINES', costPerSh: 2347.50 },
    'BANK OF BARODA': { symbol: 'BANKBARODA', costPerSh: 167.87 },
    'BERGER PAINTS INDIA LTD': { symbol: 'BERGEPAINT', costPerSh: 682.72 },
    'BLS INTERNATIONAL SERVICES LTD': { symbol: 'BLS', costPerSh: 207.08 },
    'BRIGHTCOM GROUP LTD': { symbol: 'BCG', costPerSh: 25.07 },
    'CANARA BANK': { symbol: 'CANBK', costPerSh: 318.48 },
    'CCL PRODUCTS INDIA LTD': { symbol: 'CCL', costPerSh: 647.40 },
    'CENTRAL DEPOSITORY SERVICES INDIA LTD': { symbol: 'CDSL', costPerSh: 1410.62 },
    'CL EDUCATE LTD': { symbol: 'CLEDUCATE', costPerSh: 75.00 },
    'DEEPAK NITRITE LTD': { symbol: 'DEEPAKNTR', costPerSh: 2200.77 },
    'DELTA CORP LTD': { symbol: 'DELTACORP', costPerSh: 199.87 },
    'DIVIS LABORATORIES LTD': { symbol: 'DIVISLAB', costPerSh: 3258.04 },
    'EKI ENERGY SERVICES LTD': { symbol: 'EKI', costPerSh: 718.44 },
    'FEDERAL BANK LTD': { symbol: 'FEDERALBNK', costPerSh: 129.00 },
    'GARWARE TECHNICAL FIBRES LTD': { symbol: 'GARFIBRES', costPerSh: 3309.37 },
    'HDFC BANK LTD': { symbol: 'HDFCBANK', costPerSh: 1500.71 },
    'HDFC LIFE INSURANCE COMPANY LTD': { symbol: 'HDFCLIFE', costPerSh: 589.47 },
    'HFCL LTD': { symbol: 'HFCL', costPerSh: 76.91 },
    'HINDUSTAN AERONAUTICS LTD': { symbol: 'HAL', costPerSh: 1113.00 },
    'IDBI BANK LTD': { symbol: 'IDBI', costPerSh: 70.50 },
    'IDFC FIRST BANK LTD': { symbol: 'IDFCFIRSTB', costPerSh: 63.62 },
    'IIFL CAPITAL SERVICES LTD': { symbol: 'IIFLCAPS', costPerSh: 97.35 },
    'INDIAN ENERGY EXCHANGE LTD': { symbol: 'IEX', costPerSh: 157.22 },
    'INDIAN RAILWAY CATERING and TOURISM CORPORATION LTD': { symbol: 'IRCTC', costPerSh: 725.92 },
    'JUBILANT FOODWORKS LTD': { symbol: 'JUBLFOOD', costPerSh: 518.00 },
    'KOTAK MAHINDRA BANK LTD': { symbol: 'KOTAKBANK', costPerSh: 1859.20 },
    'LIC HOUSING FINANCE LTD': { symbol: 'LICHSGFIN', costPerSh: 423.02 },
    'LUX INDUSTRIES LTD': { symbol: 'LUXIND', costPerSh: 1730.00 },
    'LnT TECHNOLOGY SERVICES LTD': { symbol: 'LTTS', costPerSh: 4044.43 },
    'MAZAGON DOCK SHIPBUILDERS LTD': { symbol: 'MAZDOCK', costPerSh: 1855.02 },
    'MIRZA INTERNATIONAL LTD': { symbol: 'MIRZAINT', costPerSh: 286.96 },
    'MODISON LTD': { symbol: 'MODISONLTD', costPerSh: 85.96 },
    'MTAR TECHNOLOGIES LTD': { symbol: 'MTARTECH', costPerSh: 2368.11 },
    'MUTHOOT FINANCE LTD': { symbol: 'MUTHOOTFIN', costPerSh: 1296.87 },
    'OLECTRA GREENTECH LTD': { symbol: 'OLECTRA', costPerSh: 1120.89 },
    'PAGE INDUSTRIES LTD': { symbol: 'PAGEIND', costPerSh: 48465.00 },
    'PIDILITE INDUSTRIES LTD': { symbol: 'PIDILITIND', costPerSh: 2406.88 },
    'RELAXO FOOTWEARS LTD': { symbol: 'RELAXO', costPerSh: 1118.09 },
    'SAMVARDHANA MOTHERSON INTERNATIONAL LTD': { symbol: 'MOTHERSON', costPerSh: 86.00 },
    'SBI CARDS AND PAYMENT SERVICES LTD': { symbol: 'SBICARD', costPerSh: 926.41 },
    'SEPC LTD': { symbol: 'SEPC', costPerSh: 14.65 },
    'SHEELA FOAM LTD': { symbol: 'SFL', costPerSh: 1216.25 },
    'SRF LTD': { symbol: 'SRF', costPerSh: 2160.00 },
    'TATA CONSULTANCY SERVICES LTD': { symbol: 'TCS', costPerSh: 3385.00 },
    'TATA ELXSI LTD': { symbol: 'TATAELXSI', costPerSh: 6569.77 },
    'TATA MOTORS PASSENGER VEHICLES LTD': { symbol: 'TATAMOTORS', costPerSh: 507.32 },
    'TATA MOTORS PASSENGER VEHICLES LTD TYPE A SHARES': { symbol: 'TATAMTRDVR', costPerSh: 318.27 },
    'TATA POWER CO LTD': { symbol: 'TATAPOWER', costPerSh: 222.45 },
    'TITAN COMPANY LTD': { symbol: 'TITAN', costPerSh: 3032.35 },
    'UNO MINDA LTD': { symbol: 'UNOMINDA', costPerSh: 612.95 },
    'VINSYS IT SERVICES INDIA LTD': { symbol: 'VINSYS', costPerSh: 252.50 },
    'WIPRO LTD': { symbol: 'WIPRO', costPerSh: 442.52 }
  };

  // Update Holdings for cc9
  const cc9Holdings = await db.execute("SELECT symbol, quantity, avg_buy_price, total_cost FROM Holdings WHERE portfolio='cc9'");
  
  for (const h of cc9Holdings.rows) {
    const sym = h.symbol;
    // Find in mapping
    let matchedCostPerSh = null;
    for (const [name, data] of Object.entries(capitalRegisterCosts)) {
      if (data.symbol === sym || sym.includes(data.symbol)) {
        matchedCostPerSh = data.postBonusCostPerSh || data.costPerSh;
        break;
      }
    }

    if (matchedCostPerSh) {
      const taxCost = matchedCostPerSh * Number(h.quantity);
      await db.execute({
        sql: "UPDATE Holdings SET tax_avg_price=?, tax_cost_basis=? WHERE portfolio='cc9' AND symbol=?",
        args: [matchedCostPerSh, taxCost, sym]
      });
      console.log(`cc9 | ${sym.padEnd(14)}: Qty ${h.quantity} | PMS Mkt Avg: ₹${Number(h.avg_buy_price).toFixed(2)} | Tax Cost Avg: ₹${matchedCostPerSh.toFixed(2)} | Tax Total: ₹${Math.round(taxCost).toLocaleString('en-IN')}`);
    } else {
      // Default tax cost = total cost
      await db.execute({
        sql: "UPDATE Holdings SET tax_avg_price=avg_buy_price, tax_cost_basis=total_cost WHERE portfolio='cc9' AND symbol=? AND tax_cost_basis IS NULL",
        args: [sym]
      });
    }
  }

  // Also default tax cost = total cost for non-cc9 portfolios
  await db.execute("UPDATE Holdings SET tax_avg_price=avg_buy_price, tax_cost_basis=total_cost WHERE portfolio != 'cc9' AND tax_cost_basis IS NULL");
  console.log("\n✅ Dual cost basis initialized successfully across all holdings.");
}

setupDualCostBasis().catch(console.error);
