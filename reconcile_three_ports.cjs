const xlsx = require('xlsx');
const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

function normalizeSymbol(s) {
  if (!s) return '';
  return s.toUpperCase().replace(/-[A-Z0-9]+$/, '').replace(/[^A-Z0-9]/g, '');
}

async function reconcileAllThree() {
  console.log("================================================================================");
  console.log("              COMPREHENSIVE HOLDINGS RECONCILIATION REPORT                      ");
  console.log("================================================================================\n");

  // ============================================================================
  // 1. RECONCILE PAPA (holdings-IPD619)
  // ============================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("1. PAPA PORTFOLIO RECONCILIATION vs holdings-IPD619.xlsx (Client ID: IPD619)");
  console.log("--------------------------------------------------------------------------------");
  const wbPapa = xlsx.readFile('holdings-IPD619 (1).xlsx');
  const sPapa = wbPapa.Sheets['Equity'] || wbPapa.Sheets[wbPapa.SheetNames[0]];
  const dPapa = xlsx.utils.sheet_to_json(sPapa, { header: 1 });
  
  let papaHeaderIdx = -1;
  for (let i = 0; i < dPapa.length; i++) {
    if (dPapa[i] && dPapa[i][0] === 'Symbol' && dPapa[i][1] === 'ISIN') {
      papaHeaderIdx = i;
      break;
    }
  }

  const papaStmtHoldings = [];
  for (let i = papaHeaderIdx + 1; i < dPapa.length; i++) {
    const row = dPapa[i];
    if (!row || !row[0]) continue;
    const sym = String(row[0]).trim();
    const isin = String(row[1] || '').trim();
    const qty = parseFloat(row[3]) || 0;
    const avgPrice = parseFloat(row[8]) || 0;
    const ltp = parseFloat(row[9]) || 0;
    papaStmtHoldings.push({ symbol: sym, isin, qty, avgPrice, ltp, normSym: normalizeSymbol(sym) });
  }

  const dbPapaRows = (await db.execute("SELECT symbol, isin, quantity, total_cost, current_value FROM Holdings WHERE portfolio='Papa' AND quantity > 0")).rows;
  const dbPapaMap = new Map();
  dbPapaRows.forEach(r => {
    if (r.isin && r.isin !== 'UNKNOWN') dbPapaMap.set(r.isin, r);
    dbPapaMap.set(normalizeSymbol(r.symbol), r);
  });

  console.log("\n[PAPA HOLDINGS COMPARISON]");
  const papaMatchedDb = new Set();
  papaStmtHoldings.forEach(sh => {
    const dbH = dbPapaMap.get(sh.isin) || dbPapaMap.get(sh.normSym);
    const dbQty = dbH ? dbH.quantity : 0;
    if (dbH) papaMatchedDb.add(dbH.symbol);
    const diff = dbQty - sh.qty;
    const status = Math.abs(diff) < 0.001 ? "MATCH ✅" : (diff > 0 ? `DB EXCESS (+${diff}) ⚠️` : `DB SHORT (${diff}) ❌`);
    console.log(`- ${sh.symbol.padEnd(16)} (ISIN: ${sh.isin.padEnd(12)}): Stmt Qty = ${String(sh.qty).padStart(8)} | DB Qty = ${String(dbQty).padStart(8)} | Diff = ${String(diff).padStart(8)} | ${status}`);
  });

  // Check DB holdings not in statement
  dbPapaRows.forEach(dh => {
    if (!papaMatchedDb.has(dh.symbol)) {
      console.log(`- ${dh.symbol.padEnd(16)} (ISIN: ${String(dh.isin).padEnd(12)}): Stmt Qty =        0 | DB Qty = ${String(dh.quantity).padStart(8)} | Diff = +${String(dh.quantity).padStart(7)} | IN DB ONLY (Not in Stmt) ⚠️`);
    }
  });


  // ============================================================================
  // 2. RECONCILE MAA (holdings-PSI722)
  // ============================================================================
  console.log("\n\n--------------------------------------------------------------------------------");
  console.log("2. MAA PORTFOLIO RECONCILIATION vs holdings-PSI722.xlsx (Client ID: PSI722)");
  console.log("--------------------------------------------------------------------------------");
  const wbMaa = xlsx.readFile('holdings-PSI722 (6).xlsx');
  const sMaa = wbMaa.Sheets['Equity'] || wbMaa.Sheets[wbMaa.SheetNames[0]];
  const dMaa = xlsx.utils.sheet_to_json(sMaa, { header: 1 });
  
  let maaHeaderIdx = -1;
  for (let i = 0; i < dMaa.length; i++) {
    if (dMaa[i] && dMaa[i][0] === 'Symbol' && dMaa[i][1] === 'ISIN') {
      maaHeaderIdx = i;
      break;
    }
  }

  const maaStmtHoldings = [];
  for (let i = maaHeaderIdx + 1; i < dMaa.length; i++) {
    const row = dMaa[i];
    if (!row || !row[0]) continue;
    const sym = String(row[0]).trim();
    const isin = String(row[1] || '').trim();
    const qty = parseFloat(row[3]) || 0;
    const avgPrice = parseFloat(row[8]) || 0;
    const ltp = parseFloat(row[9]) || 0;
    maaStmtHoldings.push({ symbol: sym, isin, qty, avgPrice, ltp, normSym: normalizeSymbol(sym) });
  }

  const dbMaaRows = (await db.execute("SELECT symbol, isin, quantity, total_cost, current_value FROM Holdings WHERE portfolio='Maa' AND quantity > 0")).rows;
  const dbMaaMap = new Map();
  dbMaaRows.forEach(r => {
    if (r.isin && r.isin !== 'UNKNOWN') dbMaaMap.set(r.isin, r);
    dbMaaMap.set(normalizeSymbol(r.symbol), r);
  });

  console.log("\n[MAA HOLDINGS COMPARISON]");
  const maaMatchedDb = new Set();
  maaStmtHoldings.forEach(sh => {
    const dbH = dbMaaMap.get(sh.isin) || dbMaaMap.get(sh.normSym);
    const dbQty = dbH ? dbH.quantity : 0;
    if (dbH) maaMatchedDb.add(dbH.symbol);
    const diff = dbQty - sh.qty;
    const status = Math.abs(diff) < 0.001 ? "MATCH ✅" : (diff > 0 ? `DB EXCESS (+${diff}) ⚠️` : `DB SHORT (${diff}) ❌`);
    console.log(`- ${sh.symbol.padEnd(16)} (ISIN: ${sh.isin.padEnd(12)}): Stmt Qty = ${String(sh.qty).padStart(12)} | DB Qty = ${String(dbQty).padStart(12)} | Diff = ${String(diff).padStart(10)} | ${status}`);
  });

  // Check DB holdings not in statement
  dbMaaRows.forEach(dh => {
    if (!maaMatchedDb.has(dh.symbol)) {
      console.log(`- ${dh.symbol.padEnd(16)} (ISIN: ${String(dh.isin).padEnd(12)}): Stmt Qty =            0 | DB Qty = ${String(dh.quantity).padStart(12)} | Diff = +${String(dh.quantity).padStart(9)} | IN DB ONLY (Not in Stmt) ⚠️`);
    }
  });


  // ============================================================================
  // 3. RECONCILE SELF HDFC (Demat Holding Query Stmt_1692)
  // ============================================================================
  console.log("\n\n--------------------------------------------------------------------------------");
  console.log("3. SELF HDFC PORTFOLIO RECONCILIATION vs Demat Holding Query Stmt (DP: 35411692)");
  console.log("--------------------------------------------------------------------------------");
  const wbHdfc = xlsx.readFile('Demat Holding Query Stmt_1692_24-08-2026 12.56.XLS');
  const sHdfc = wbHdfc.Sheets[wbHdfc.SheetNames[0]];
  const dHdfc = xlsx.utils.sheet_to_json(sHdfc, { header: 1 });

  let hdfcHeaderIdx = -1;
  for (let i = 0; i < dHdfc.length; i++) {
    if (dHdfc[i] && dHdfc[i].some(c => String(c).includes('ISIN'))) {
      hdfcHeaderIdx = i;
      break;
    }
  }

  const hdfcStmtHoldings = [];
  for (let i = hdfcHeaderIdx + 1; i < dHdfc.length; i++) {
    const row = dHdfc[i];
    if (!row) continue;
    const isin = row[7] || '';
    const compName = row[12] || '';
    const qty = parseFloat(row[18]) || 0;
    const rate = parseFloat(row[21]) || 0;
    const value = parseFloat(row[24]) || 0;
    const status = row[28] || '';
    if (isin && isin.startsWith('INE')) {
      hdfcStmtHoldings.push({ isin, compName, qty, rate, value, status });
    }
  }

  console.log("\n[SELF HDFC STATEMENT HOLDINGS ON HAND]");
  hdfcStmtHoldings.forEach(sh => {
    console.log(`- ${sh.compName.padEnd(35)} (ISIN: ${sh.isin}): Qty = ${String(sh.qty).padStart(8)} | Rate = ₹${String(sh.rate).padStart(6)} | Value = ₹${String(sh.value).padStart(12)} | Status = ${sh.status}`);
  });

  const dbSelfHdfcRows = (await db.execute("SELECT portfolio, symbol, isin, quantity, total_cost, current_value FROM Holdings WHERE (portfolio LIKE '%HDFC%' OR portfolio LIKE '%Self%') AND quantity > 0")).rows;
  console.log(`\nHoldings in DB for 'Self HDFC Securities': ${dbSelfHdfcRows.length}`);

  // Cross-portfolio audit for the 5 HDFC ISINs
  console.log("\n[WHERE DO THESE 5 HDFC DEMAT STOCKS CURRENTLY RESIDE IN THE DB?]");
  for (const sh of hdfcStmtHoldings) {
    const cross = await db.execute({
      sql: "SELECT portfolio, symbol, isin, quantity, current_value FROM Holdings WHERE isin = ? AND quantity > 0",
      args: [sh.isin]
    });
    console.log(`\nISIN ${sh.isin} | ${sh.compName} [HDFC Statement Qty = ${sh.qty}]:`);
    if (cross.rows.length === 0) {
      console.log(`  ❌ NOT FOUND in any portfolio in DB!`);
    } else {
      cross.rows.forEach(cr => {
        console.log(`  📍 Present in Portfolio '${cr.portfolio}': Symbol=${cr.symbol}, DB Qty=${cr.quantity}, Val=₹${cr.current_value}`);
      });
    }
  }
}

reconcileAllThree();
