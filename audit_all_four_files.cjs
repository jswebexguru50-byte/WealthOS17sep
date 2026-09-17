const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  console.log("==========================================================================================");
  console.log("       EXACT FULL RECONCILIATION ACROSS ALL PORTFOLIOS BASIS USER MAPPING                 ");
  console.log("==========================================================================================\n");

  // =========================================================================
  // 1. PAPA (Account IPD619) -> holdings-IPD619 (1).xlsx
  // =========================================================================
  console.log("==========================================================================================");
  console.log("1. PORTFOLIO: PAPA (Zerodha IPD619)");
  console.log("   Source File: holdings-IPD619 (1).xlsx");
  console.log("==========================================================================================");
  
  const papaPath = path.resolve('holdings-IPD619 (1).xlsx');
  const wbPapa = XLSX.readFile(papaPath);
  const sheetPapa = wbPapa.Sheets['Equity'] || wbPapa.Sheets[wbPapa.SheetNames[0]];
  const dataPapa = XLSX.utils.sheet_to_json(sheetPapa, { header: 1 });
  
  let papaHeaderIdx = -1;
  for (let i = 0; i < dataPapa.length; i++) {
    const rowStr = (dataPapa[i] || []).join(' ').toLowerCase();
    if (rowStr.includes('symbol') || rowStr.includes('isin') || (rowStr.includes('qty') && rowStr.includes('price'))) {
      papaHeaderIdx = i;
      break;
    }
  }
  
  const papaHeaders = dataPapa[papaHeaderIdx].map(h => String(h || '').trim().toLowerCase());
  const pSymIdx = papaHeaders.findIndex(h => h.includes('symbol') || h.includes('instrument'));
  const pIsinIdx = papaHeaders.findIndex(h => h.includes('isin'));
  const pQtyIdx = papaHeaders.findIndex(h => h.includes('qty') || h.includes('quantity'));
  const pPriceIdx = papaHeaders.findIndex(h => h.includes('avg') || h.includes('price'));
  
  const filePapaHoldings = [];
  for (let i = papaHeaderIdx + 1; i < dataPapa.length; i++) {
    const r = dataPapa[i] || [];
    let sym = r[pSymIdx] ? String(r[pSymIdx]).trim().toUpperCase() : '';
    // Normalize -SM, -ST, -MT suffixes
    const cleanSym = sym.replace(/-(SM|ST|MT|M|BE|EQ)$/i, '').trim();
    const isin = pIsinIdx >= 0 && r[pIsinIdx] ? String(r[pIsinIdx]).trim().toUpperCase() : '';
    const qty = pQtyIdx >= 0 && r[pQtyIdx] ? parseFloat(String(r[pQtyIdx]).replace(/,/g, '')) : 0;
    const avgPrice = pPriceIdx >= 0 && r[pPriceIdx] ? parseFloat(String(r[pPriceIdx]).replace(/,/g, '')) : 0;
    if (sym && qty > 0) {
      filePapaHoldings.push({ rawSymbol: sym, cleanSym, isin, qty, avgPrice });
    }
  }

  const dbPapa = await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, current_value FROM Holdings WHERE portfolio='Papa' AND quantity > 0");
  const dbPapaMap = new Map();
  dbPapa.rows.forEach(r => {
    dbPapaMap.set(r.symbol.toUpperCase(), r);
    if (r.isin) dbPapaMap.set(r.isin.toUpperCase(), r);
  });

  console.log(`\nParsed ${filePapaHoldings.length} positions from IPD619 file:`);
  let papaMatches = 0;
  let papaDiffs = 0;
  
  filePapaHoldings.forEach(h => {
    const dbRow = dbPapaMap.get(h.cleanSym) || dbPapaMap.get(h.rawSymbol) || dbPapaMap.get(h.isin) || null;
    const dbQty = dbRow ? Number(dbRow.quantity) : 0;
    const diff = dbQty - h.qty;
    if (Math.abs(diff) < 0.001) {
      papaMatches++;
      console.log(`  ✅ MATCH: ${h.rawSymbol.padEnd(16)} (DB: ${dbRow?.symbol || h.cleanSym}) | Qty: ${h.qty} | DB Qty: ${dbQty}`);
    } else {
      papaDiffs++;
      console.log(`  ⚠️ DIFF:  ${h.rawSymbol.padEnd(16)} (DB: ${dbRow?.symbol || h.cleanSym}) | Stmt Qty: ${h.qty} | DB Qty: ${dbQty} (Diff: ${diff})`);
    }
  });

  console.log(`=> Papa Match Result: ${papaMatches} / ${filePapaHoldings.length} Matched (Diffs: ${papaDiffs})\n`);


  // =========================================================================
  // 2. MAA (Zerodha PSI722 + HDFC Demat)
  // =========================================================================
  console.log("==========================================================================================");
  console.log("2. PORTFOLIO: MAA (Zerodha PSI722 + HDFC Demat Statement)");
  console.log("   Source Files: src/holdings-PSI722 (8).xlsx + Demat Holding Query Stmt_1692_24-08-2026 12.56.XLS");
  console.log("==========================================================================================");

  // A. Parse PSI722
  const maaPsiPath = path.resolve('src/holdings-PSI722 (8).xlsx');
  const wbMaaPsi = XLSX.readFile(maaPsiPath);
  const sheetMaaPsi = wbMaaPsi.Sheets['Equity'] || wbMaaPsi.Sheets[wbMaaPsi.SheetNames[0]];
  const dataMaaPsi = XLSX.utils.sheet_to_json(sheetMaaPsi, { header: 1 });
  
  let maaHeaderIdx = -1;
  for (let i = 0; i < dataMaaPsi.length; i++) {
    const rowStr = (dataMaaPsi[i] || []).join(' ').toLowerCase();
    if (rowStr.includes('symbol') || rowStr.includes('isin') || (rowStr.includes('qty') && rowStr.includes('price'))) {
      maaHeaderIdx = i;
      break;
    }
  }
  
  const maaHeaders = dataMaaPsi[maaHeaderIdx].map(h => String(h || '').trim().toLowerCase());
  const mSymIdx = maaHeaders.findIndex(h => h.includes('symbol') || h.includes('instrument'));
  const mIsinIdx = maaHeaders.findIndex(h => h.includes('isin'));
  const mQtyIdx = maaHeaders.findIndex(h => h.includes('qty') || h.includes('quantity'));
  const mPriceIdx = maaHeaders.findIndex(h => h.includes('avg') || h.includes('price'));
  
  const fileMaaHoldings = [];
  for (let i = maaHeaderIdx + 1; i < dataMaaPsi.length; i++) {
    const r = dataMaaPsi[i] || [];
    let sym = r[mSymIdx] ? String(r[mSymIdx]).trim().toUpperCase() : '';
    const cleanSym = sym.replace(/-(SM|ST|MT|M|BE|EQ)$/i, '').trim();
    const isin = mIsinIdx >= 0 && r[mIsinIdx] ? String(r[mIsinIdx]).trim().toUpperCase() : '';
    const qty = mQtyIdx >= 0 && r[mQtyIdx] ? parseFloat(String(r[mQtyIdx]).replace(/,/g, '')) : 0;
    const avgPrice = mPriceIdx >= 0 && r[mPriceIdx] ? parseFloat(String(r[mPriceIdx]).replace(/,/g, '')) : 0;
    if (sym && qty > 0) {
      fileMaaHoldings.push({ source: 'Zerodha (PSI722)', rawSymbol: sym, cleanSym, isin, qty, avgPrice });
    }
  }

  // B. Parse HDFC Demat
  const hdfcPath = path.resolve('Demat Holding Query Stmt_1692_24-08-2026 12.56.XLS');
  const wbHdfc = XLSX.readFile(hdfcPath);
  const sheetHdfc = wbHdfc.Sheets[wbHdfc.SheetNames[0]];
  const dataHdfc = XLSX.utils.sheet_to_json(sheetHdfc, { header: 1 });
  
  const fileHdfcHoldings = [];
  for (let i = 0; i < dataHdfc.length; i++) {
    const r = dataHdfc[i] || [];
    for (let j = 0; j < r.length; j++) {
      const val = String(r[j] || '').trim();
      if (/^INE[A-Z0-9]{9}$/i.test(val) || /^INF[A-Z0-9]{9}$/i.test(val)) {
        const isin = val.toUpperCase();
        const name = r[j - 1] ? String(r[j - 1]).trim() : '';
        const nums = r.filter(c => typeof c === 'number' || (!isNaN(parseFloat(c)) && !/^INE/i.test(String(c)))).map(c => parseFloat(c));
        const qty = nums.length > 0 ? nums[0] : 0;
        if (qty > 0) {
          fileHdfcHoldings.push({ source: 'HDFC Demat', name, isin, qty });
        }
      }
    }
  }

  const dbMaa = await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, current_value FROM Holdings WHERE portfolio='Maa' AND quantity > 0");
  const dbMaaMap = new Map();
  dbMaa.rows.forEach(r => {
    dbMaaMap.set(r.symbol.toUpperCase(), r);
    if (r.isin) dbMaaMap.set(r.isin.toUpperCase(), r);
  });

  console.log(`\nParsed ${fileMaaHoldings.length} Zerodha (PSI722) positions and ${fileHdfcHoldings.length} HDFC Demat positions for Maa:`);
  let maaMatches = 0;
  let maaDiffs = 0;

  console.log(`\n--- A. Zerodha PSI722 Positions vs DB Maa Holdings ---`);
  fileMaaHoldings.forEach(h => {
    const dbRow = dbMaaMap.get(h.cleanSym) || dbMaaMap.get(h.rawSymbol) || dbMaaMap.get(h.isin) || null;
    const dbQty = dbRow ? Number(dbRow.quantity) : 0;
    const diff = dbQty - h.qty;
    if (Math.abs(diff) < 0.001) {
      maaMatches++;
      console.log(`  ✅ MATCH: ${h.rawSymbol.padEnd(16)} (DB: ${(dbRow?.symbol || h.cleanSym).padEnd(14)}) | Qty: ${String(h.qty).padStart(8)} | DB Qty: ${String(dbQty).padStart(8)}`);
    } else {
      maaDiffs++;
      console.log(`  ⚠️ DIFF:  ${h.rawSymbol.padEnd(16)} (DB: ${(dbRow?.symbol || h.cleanSym).padEnd(14)}) | Stmt Qty: ${String(h.qty).padStart(8)} | DB Qty: ${String(dbQty).padStart(8)} (Diff: ${diff})`);
    }
  });

  console.log(`\n--- B. HDFC Demat Positions vs DB Maa Holdings ---`);
  fileHdfcHoldings.forEach(h => {
    const dbRow = dbMaaMap.get(h.isin) || null;
    const dbQty = dbRow ? Number(dbRow.quantity) : 0;
    console.log(`  📄 HDFC: ${h.isin} (${h.name.padEnd(20)}) | Demat Qty: ${String(h.qty).padStart(8)} | DB Qty: ${String(dbQty).padStart(8)} (DB Symbol: ${dbRow?.symbol || 'NOT_IN_MAA'})`);
  });


  // =========================================================================
  // 3. CC9 (Complete Circle) -> src/COMN0005_6820006_CurrentPortfolio2086GT (8).csv
  // =========================================================================
  console.log("\n==========================================================================================");
  console.log("3. PORTFOLIO: CC9 (Complete Circle Deep Financial PMS)");
  console.log("   Source File: src/COMN0005_6820006_CurrentPortfolio2086GT (8).csv (26-Aug-2026)");
  console.log("==========================================================================================");
  
  const cc9Path = path.resolve('src/COMN0005_6820006_CurrentPortfolio2086GT (8).csv');
  const cc9Content = fs.readFileSync(cc9Path, 'utf8');
  const cc9Lines = cc9Content.split('\n');
  
  let cc9Holdings26 = [];
  let readingTable = false;
  
  for (const line of cc9Lines) {
    const l = line.trim();
    if (!l) continue;
    if (l.includes('Security Name') || l.includes('Scrip Name') || l.includes('Complete Circle Emerging India')) {
      readingTable = true;
      continue;
    }
    if (l.includes('Total') || l.includes('CASH & CASH EQUIVALENT') || l.includes('Net Portfolio Value')) {
      readingTable = false;
    }
    if (readingTable) {
      const parts = l.split(',');
      if (parts.length >= 3) {
        const name = parts[0].replace(/["]/g, '').trim();
        // find qty
        const nums = parts.slice(1).map(p => parseFloat(p.replace(/[",]/g, ''))).filter(n => !isNaN(n));
        if (name && nums.length >= 2) {
          const qty = nums[0];
          const mktPrice = nums[1];
          const mktVal = nums.length >= 3 ? nums[2] : qty * mktPrice;
          if (qty > 0 && !name.toLowerCase().includes('report') && !name.toLowerCase().includes('account')) {
            cc9Holdings26.push({ name, qty, mktPrice, mktVal });
          }
        }
      }
    }
  }

  console.log(`Parsed ${cc9Holdings26.length} positions from 26-Aug-2026 Complete Circle statement.`);
  const dbCc9List = await db.execute("SELECT symbol, isin, quantity, current_value FROM Holdings WHERE portfolio='cc9' AND symbol != 'CASH' AND quantity > 0");
  const dbCc9SymbolMap = new Map();
  dbCc9List.rows.forEach(r => dbCc9SymbolMap.set(r.symbol.toUpperCase(), r));

  let cc9Matches26 = 0;
  let cc9Diffs26 = 0;
  
  cc9Holdings26.forEach(h => {
    // fuzzy match name with DB symbol
    let matchedDb = null;
    for (const [sym, row] of dbCc9SymbolMap.entries()) {
      if (h.name.toUpperCase().includes(sym) || sym.includes(h.name.toUpperCase()) || 
          (sym === 'GROWW' && h.name.includes('BILLIONBRAINS')) ||
          (sym === 'ARE&M' && h.name.includes('AMARA RAJA')) ||
          (sym === 'GOKEX' && h.name.includes('GOKALDAS')) ||
          (sym === 'GANECOS' && h.name.includes('GANESHA')) ||
          (sym === 'HOMEFIRST' && h.name.includes('HOME FIRST')) ||
          (sym === 'PAYTM' && h.name.includes('ONE 97')) ||
          (sym === 'LT' && h.name.includes('LARSEN')) ||
          (sym === 'MAZDOCK' && h.name.includes('MAZAGON')) ||
          (sym === 'NH' && h.name.includes('NARAYANA')) ||
          (sym === 'PIDILITIND' && h.name.includes('PIDILITE')) ||
          (sym === 'SBIFUN' && h.name.includes('SBI FUNDS')) ||
          (sym === 'SBIN' && h.name.includes('STATE BANK')) ||
          (sym === 'TATACONSUM' && h.name.includes('TATA CONSUMER')) ||
          (sym === 'TINNARUBR' && h.name.includes('TINNA RUBBER')) ||
          (sym === 'ZENTEC' && h.name.includes('ZEN TECH'))
         ) {
        matchedDb = row;
        break;
      }
    }

    const dbQty = matchedDb ? Number(matchedDb.quantity) : 0;
    const diff = dbQty - h.qty;
    if (Math.abs(diff) < 0.001) {
      cc9Matches26++;
      console.log(`  ✅ MATCH: ${h.name.padEnd(35)} | Stmt Qty: ${String(h.qty).padStart(6)} | DB Qty: ${String(dbQty).padStart(6)} (DB: ${matchedDb?.symbol})`);
    } else {
      cc9Diffs26++;
      console.log(`  ⚠️ DIFF:  ${h.name.padEnd(35)} | Stmt Qty: ${String(h.qty).padStart(6)} | DB Qty: ${String(dbQty).padStart(6)} (Diff: ${diff})`);
    }
  });

  console.log(`=> CC9 Match Result (26-Aug-2026 Statement): ${cc9Matches26} / ${cc9Holdings26.length} Matched (Diffs: ${cc9Diffs26})\n`);

  process.exit(0);
}

main().catch(console.error);
