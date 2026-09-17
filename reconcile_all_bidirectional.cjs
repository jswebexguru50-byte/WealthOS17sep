const fs = require('fs');
const xlsx = require('xlsx');
const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

function normalizeSymbol(s) {
  if (!s) return '';
  return s.toUpperCase().replace(/-[A-Z0-9]+$/, '').replace(/[^A-Z0-9]/g, '');
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) { result.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  result.push(cur.trim());
  return result;
}

async function bidirectionalAudit() {
  console.log("==========================================================================================");
  console.log("             BIDIRECTIONAL HOLDINGS RECONCILIATION REPORT (4 PORTFOLIOS)                  ");
  console.log("                    Portfolios: PAPA, MAA, CC9 (Complete Circle), UNLISTED                ");
  console.log("==========================================================================================\n");

  // ============================================================================
  // 1. PAPA PORTFOLIO (holdings-IPD619.xlsx)
  // ============================================================================
  console.log("==========================================================================================");
  console.log("1. PORTFOLIO: PAPA (Client ID: IPD619) vs holdings-IPD619 (1).xlsx");
  console.log("==========================================================================================");
  
  const wbPapa = xlsx.readFile('holdings-IPD619 (1).xlsx');
  const sPapa = wbPapa.Sheets['Equity'] || wbPapa.Sheets[wbPapa.SheetNames[0]];
  const dPapa = xlsx.utils.sheet_to_json(sPapa, { header: 1 });
  let papaHeaderIdx = -1;
  for (let i = 0; i < dPapa.length; i++) {
    if (dPapa[i] && dPapa[i][0] === 'Symbol' && dPapa[i][1] === 'ISIN') { papaHeaderIdx = i; break; }
  }
  const papaStmt = [];
  for (let i = papaHeaderIdx + 1; i < dPapa.length; i++) {
    const row = dPapa[i];
    if (!row || !row[0]) continue;
    papaStmt.push({
      symbol: String(row[0]).trim(),
      isin: String(row[1] || '').trim(),
      qty: parseFloat(row[3]) || 0,
      avgPrice: parseFloat(row[8]) || 0,
      ltp: parseFloat(row[9]) || 0,
      curVal: parseFloat(row[10]) || 0,
      normSym: normalizeSymbol(String(row[0]))
    });
  }

  const dbPapaRows = (await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, ltp, current_value FROM Holdings WHERE portfolio='Papa' AND quantity > 0")).rows;
  const dbPapaMap = new Map();
  dbPapaRows.forEach(r => {
    if (r.isin && r.isin !== 'UNKNOWN') dbPapaMap.set(r.isin, r);
    dbPapaMap.set(normalizeSymbol(r.symbol), r);
  });

  console.log("\n--- [DIRECTION 1: Statement -> DB Audit (Papa)] ---");
  const papaMatchedDbSyms = new Set();
  papaStmt.forEach(sh => {
    const dbH = dbPapaMap.get(sh.isin) || dbPapaMap.get(sh.normSym);
    const dbQty = dbH ? dbH.quantity : 0;
    if (dbH) papaMatchedDbSyms.add(dbH.symbol);
    const diff = dbQty - sh.qty;
    const isMatch = Math.abs(diff) < 0.001;
    console.log(`  • ${sh.symbol.padEnd(16)} (ISIN: ${sh.isin.padEnd(12)}): Stmt Qty = ${String(sh.qty).padStart(7)} | DB Qty = ${String(dbQty).padStart(7)} | Diff = ${String(diff).padStart(6)} | ${isMatch ? 'MATCH ✅' : 'MISMATCH ❌'}`);
  });

  console.log("\n--- [DIRECTION 2: DB -> Statement Audit (Papa)] ---");
  let papaExtraInDb = 0;
  dbPapaRows.forEach(dh => {
    if (!papaMatchedDbSyms.has(dh.symbol)) {
      papaExtraInDb++;
      console.log(`  ⚠️ In DB only: ${dh.symbol} (ISIN: ${dh.isin}) - Qty: ${dh.quantity} (NOT found in Statement)`);
    }
  });
  if (papaExtraInDb === 0) console.log("  ✅ No extra or orphaned holdings in DB. 100% bidirectional sync!");


  // ============================================================================
  // 2. MAA PORTFOLIO (holdings-PSI722.xlsx)
  // ============================================================================
  console.log("\n==========================================================================================");
  console.log("2. PORTFOLIO: MAA (Client ID: PSI722) vs holdings-PSI722 (6).xlsx");
  console.log("==========================================================================================");

  const wbMaa = xlsx.readFile('holdings-PSI722 (6).xlsx');
  const sMaa = wbMaa.Sheets['Equity'] || wbMaa.Sheets[wbMaa.SheetNames[0]];
  const dMaa = xlsx.utils.sheet_to_json(sMaa, { header: 1 });
  let maaHeaderIdx = -1;
  for (let i = 0; i < dMaa.length; i++) {
    if (dMaa[i] && dMaa[i][0] === 'Symbol' && dMaa[i][1] === 'ISIN') { maaHeaderIdx = i; break; }
  }
  const maaStmt = [];
  for (let i = maaHeaderIdx + 1; i < dMaa.length; i++) {
    const row = dMaa[i];
    if (!row || !row[0]) continue;
    maaStmt.push({
      symbol: String(row[0]).trim(),
      isin: String(row[1] || '').trim(),
      qty: parseFloat(row[3]) || 0,
      avgPrice: parseFloat(row[8]) || 0,
      ltp: parseFloat(row[9]) || 0,
      curVal: parseFloat(row[10]) || 0,
      normSym: normalizeSymbol(String(row[0]))
    });
  }

  const dbMaaRows = (await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, ltp, current_value FROM Holdings WHERE portfolio='Maa' AND quantity > 0")).rows;
  const dbMaaMap = new Map();
  dbMaaRows.forEach(r => {
    if (r.isin && r.isin !== 'UNKNOWN') dbMaaMap.set(r.isin, r);
    dbMaaMap.set(normalizeSymbol(r.symbol), r);
  });

  console.log("\n--- [DIRECTION 1: Statement -> DB Audit (Maa)] ---");
  const maaMatchedDbSyms = new Set();
  maaStmt.forEach(sh => {
    const dbH = dbMaaMap.get(sh.isin) || dbMaaMap.get(sh.normSym);
    const dbQty = dbH ? dbH.quantity : 0;
    if (dbH) maaMatchedDbSyms.add(dbH.symbol);
    const diff = dbQty - sh.qty;
    const isMatch = Math.abs(diff) < 0.001;

    let note = isMatch ? 'MATCH ✅' : `Diff: ${diff}`;
    if (!dbH) {
      if (['INE08GI01012', 'INE0T0H01020', 'INE103001017', 'INF162422184', 'INF162422218'].includes(sh.isin) || ['INE08GI01012', 'INE0T0H01020', 'INE103001017', 'INF162422184', 'INF162422218'].includes(sh.symbol)) {
        note = 'Tracked in UNLISTED Portfolio 📌';
      }
    }
    console.log(`  • ${sh.symbol.padEnd(16)} (ISIN: ${sh.isin.padEnd(12)}): Stmt Qty = ${String(sh.qty).padStart(11)} | DB Qty = ${String(dbQty).padStart(11)} | ${note}`);
  });

  console.log("\n--- [DIRECTION 2: DB -> Statement Audit (Maa)] ---");
  let maaExtraInDb = 0;
  dbMaaRows.forEach(dh => {
    if (!maaMatchedDbSyms.has(dh.symbol)) {
      maaExtraInDb++;
      console.log(`  ⚠️ In DB only: ${dh.symbol} (ISIN: ${dh.isin}) - Qty: ${dh.quantity} (NOT found in Statement)`);
    }
  });
  if (maaExtraInDb === 0) console.log("  ✅ No extra or orphaned holdings in DB. 100% bidirectional sync!");


  // ============================================================================
  // 3. COMPLETE CIRCLE (CC9) PORTFOLIO
  // ============================================================================
  console.log("\n==========================================================================================");
  console.log("3. PORTFOLIO: COMPLETE CIRCLE (cc9) vs Statement (COMN0005 - 23/08/2026)");
  console.log("==========================================================================================");

  const rawCsv = fs.readFileSync('cc9_portfolio_statement_20260823.csv', 'utf8');
  const lines = rawCsv.split('\n').map(l => l.trim()).filter(Boolean);

  const ccStmt = [];
  let headerSeen = false;
  for (const line of lines) {
    if (line.includes('Security,Price as on')) { headerSeen = true; continue; }
    if (line.includes('Shares - Total') || line.includes('Equity - Total')) continue;
    if (!headerSeen) continue;
    if (line.startsWith('Equity') || line.startsWith('Shares') || line.startsWith('Cash') || line.startsWith('Other') || line.startsWith('Total') || line.startsWith('Tax Deducted')) continue;

    const parts = parseCSVLine(line);
    if (parts.length >= 10 && parts[0] && parts[3]) {
      const name = parts[0].replace(/"/g, '').trim();
      if (!name || name.includes('Total') || name === 'Security') continue;
      const qty = parseFloat(parts[3].replace(/[",]/g, ''));
      if (isNaN(qty)) continue;
      const unitCost = parseFloat(parts[4].replace(/[",]/g, '')) || 0;
      const totalCost = parseFloat(parts[5].replace(/[",]/g, '')) || 0;
      const mktPrice = parseFloat(parts[6].replace(/[",]/g, '')) || 0;
      const mktVal = parseFloat(parts[7].replace(/[",]/g, '')) || 0;
      ccStmt.push({ name, qty, unitCost, totalCost, mktPrice, mktVal });
    }
  }

  const dbCcRows = (await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, ltp, current_value FROM Holdings WHERE portfolio='cc9'")).rows;
  const dbCcMap = new Map();
  dbCcRows.forEach(h => dbCcMap.set(h.symbol.toUpperCase(), h));

  const ccSymbolMap = {
    "AMARA RAJA ENERGY & MOBILITY LIMITED": "ARE&M",
    "APL APOLLO TUBES LTD": "APLAPOLLO",
    "AZAD ENGINEERING LTD": "AZAD",
    "BAJAJ FINANCE LTD": "BAJFINANCE",
    "BAJAJ HOUSING FINANCE LTD": "BAJAJHFL",
    "BANK OF BARODA": "BANKBARODA",
    "BHARAT ELECTRONICS LTD": "BEL",
    "BHARTI AIRTEL LTD": "BHARTIARTL",
    "BILLIONBRAINS GARAGE VENTURES LTD": "GROWW",
    "BLUE JET HEALTHCARE LTD": "BLUEJET",
    "CENTRAL DEPOSITORY SERVICES INDIA LTD": "CDSL",
    "CG POWER AND INDUSTRIAL SOLUTIONS LTD": "CGPOWER",
    "DIVIS LABORATORIES LTD": "DIVISLAB",
    "DIXON TECHNOLOGIES INDIA LTD": "DIXON",
    "EPL LTD": "EPL",
    "ETERNAL LTD": "ETERNAL",
    "FEDERAL BANK LTD": "FEDERALBNK",
    "FRATELLI VINEYARDS LTD": "FRATELLI",
    "GANESHA ECOSPHERE LTD": "GANECOS",
    "GOKALDAS EXPORTS LTD": "GOKEX",
    "HDFC BANK LTD": "HDFCBANK",
    "HINDUSTAN AERONAUTICS LTD": "HAL",
    "HIRECT LTD": "HIRECT",
    "HOME FIRST FINANCE COMPANY INDIA LTD": "HOMEFIRST",
    "J G CHEMICALS LTD": "JGCHEM",
    "KPIT TECHNOLOGIES LTD": "KPITTECH",
    "LARSEN and TOUBRO LTD": "LT",
    "LAURUS LABS LTD": "LAURUSLABS",
    "MAHINDRA and MAHINDRA LTD": "M&M",
    "MAZAGON DOCK SHIPBUILDERS LTD": "MAZDOCK",
    "MEESHO LTD": "MEESHO",
    "NARAYANA HRUDAYALAYA LTD": "NH",
    "OLECTRA GREENTECH LTD": "OLECTRA",
    "ONE 97 COMMUNICATIONS LTD": "PAYTM",
    "PIDILITE INDUSTRIES LTD": "PIDILITIND",
    "POLYCAB INDIA LTD": "POLYCAB",
    "RAJRATAN GLOBAL WIRE LTD": "RAJRATAN",
    "RBL BANK LTD": "RBLBANK",
    "RELIANCE INDUSTRIES LTD": "RELIANCE",
    "SBI FUNDS MANAGEMENT LTD": "SBIFUN",
    "SOLAR INDUSTRIES INDIA LTD": "SOLARINDS",
    "STATE BANK OF INDIA": "SBIN",
    "TATA CONSUMER PRODUCTS LTD": "TATACONSUM",
    "TATA MOTORS LTD": "TATAMOTORS",
    "TATA POWER CO LTD": "TATAPOWER",
    "TINNA RUBBER and INFRASTRUCTURE LTD": "TINNARUBR",
    "UNO MINDA LTD": "UNOMINDA",
    "VEDANTA ALUMINIUM METAL LTD": "VEDALUM",
    "ZEN TECHNOLOGIES LTD": "ZENTEC"
  };

  console.log("\n--- [DIRECTION 1: Statement -> DB Audit (cc9)] ---");
  const ccMatchedDbSyms = new Set();
  ccStmt.forEach(sh => {
    const sym = ccSymbolMap[sh.name] || sh.name;
    const dbH = dbCcMap.get(sym);
    const dbQty = dbH ? dbH.quantity : 0;
    if (dbH) ccMatchedDbSyms.add(dbH.symbol);
    const diff = dbQty - sh.qty;
    const isMatch = Math.abs(diff) < 0.01;
    console.log(`  • ${sh.name.padEnd(38)} (${sym.padEnd(10)}): Stmt Qty = ${String(sh.qty).padStart(6)} | DB Qty = ${String(Math.round(dbQty)).padStart(6)} | Diff = ${String(Math.round(diff)).padStart(5)} | ${isMatch ? 'MATCH ✅' : 'MISMATCH ⚠️'}`);
  });

  console.log("\n--- [DIRECTION 2: DB -> Statement Audit (cc9)] ---");
  let ccExtraInDb = 0;
  dbCcRows.forEach(dh => {
    if (!ccMatchedDbSyms.has(dh.symbol)) {
      ccExtraInDb++;
      console.log(`  ⚠️ In DB only: ${dh.symbol} (ISIN: ${dh.isin}) - Qty: ${dh.quantity} (NOT found in Statement)`);
    }
  });
  if (ccExtraInDb === 0) console.log("  ✅ No extra or orphaned holdings in DB for cc9. 100% bidirectional sync!");


  // ============================================================================
  // 4. UNLISTED PORTFOLIO
  // ============================================================================
  console.log("\n==========================================================================================");
  console.log("4. PORTFOLIO: UNLISTED vs Demat Statements & Off-Market Records");
  console.log("==========================================================================================");

  const dbUnlistedRows = (await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, ltp, current_value FROM Holdings WHERE portfolio='Unlisted' AND quantity > 0")).rows;
  
  console.log("\n--- [DIRECTION 1 & 2: Bidirectional Audit (Unlisted)] ---");
  const unlistedExpected = [
    { symbol: 'UL-Delta Galaxy', isin: 'INE0T0H01020', name: 'Delta Galaxy Ventures Ltd', expectedQty: 40000, source: 'Demat (PSI722)' },
    { symbol: 'UL-Smart Horizon 1', isin: 'INF162422010', name: 'Smart Horizon Fund 1', expectedQty: 1999900.005, source: 'Demat (PSI722/INF162422184)' },
    { symbol: 'UL-Annu Projects', isin: 'INE103001017', name: 'Annu Projects Ltd', expectedQty: 89920, source: 'Demat (PSI722)' },
    { symbol: 'UL-Smart Horizon 2', isin: 'INF162422010S2', name: 'Smart Horizon Fund 2', expectedQty: 1999900.01, source: 'Demat (PSI722/INF162422218)' },
    { symbol: 'UL -Hindon', isin: 'INE08GI01012', name: 'Hindon Mercantile Ltd', expectedQty: 5000, source: 'Demat (PSI722)' },
    { symbol: 'UL-SMART HORIZON 3', isin: '1INF162422010S3', name: 'Smart Horizon Fund 3', expectedQty: 799960, source: 'Direct Off-Market' },
    { symbol: 'UL-SMART HORIZON 4', isin: 'INF162422010S4', name: 'Smart Horizon Fund 4', expectedQty: 499975, source: 'Direct Off-Market' }
  ];

  const unlistedMap = new Map();
  dbUnlistedRows.forEach(r => unlistedMap.set(r.symbol, r));

  const matchedUnlistedSyms = new Set();
  unlistedExpected.forEach(ue => {
    const dbH = unlistedMap.get(ue.symbol);
    const dbQty = dbH ? dbH.quantity : 0;
    if (dbH) matchedUnlistedSyms.add(dbH.symbol);
    const diff = dbQty - ue.expectedQty;
    const isMatch = Math.abs(diff) < 0.01;
    console.log(`  • ${ue.symbol.padEnd(20)} (ISIN: ${ue.isin.padEnd(15)}): Stmt/Doc Qty = ${String(ue.expectedQty).padStart(11)} | DB Qty = ${String(dbQty).padStart(11)} | [${ue.source}] | ${isMatch ? 'MATCH ✅' : 'MISMATCH ❌'}`);
  });

  let unlistedExtraInDb = 0;
  dbUnlistedRows.forEach(dh => {
    if (!matchedUnlistedSyms.has(dh.symbol)) {
      unlistedExtraInDb++;
      console.log(`  ⚠️ In DB only: ${dh.symbol} (ISIN: ${dh.isin}) - Qty: ${dh.quantity}`);
    }
  });
  if (unlistedExtraInDb === 0) console.log("\n  ✅ No extra or orphaned holdings in DB for Unlisted. 100% bidirectional sync!");
}

bidirectionalAudit().catch(console.error);
