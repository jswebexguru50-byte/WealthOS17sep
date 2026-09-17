const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  console.log("==========================================================================================");
  console.log("            MULTI-PORTFOLIO RECONCILIATION BASIS COPIED STATEMENT FILES                  ");
  console.log("==========================================================================================\n");

  // =========================================================================
  // 1. RECONCILE CC9 (Complete Circle) basis COMN0005_6820006_CurrentPortfolio2086GT (8).csv (26/08/2026)
  // =========================================================================
  console.log("------------------------------------------------------------------------------------------");
  console.log("1. PORTFOLIO: CC9 (Complete Circle Deep Financial PMS)");
  console.log("   Source File: src/COMN0005_6820006_CurrentPortfolio2086GT (8).csv (As of 26-Aug-2026)");
  console.log("------------------------------------------------------------------------------------------");
  
  const cc9CsvPath = path.resolve('src/COMN0005_6820006_CurrentPortfolio2086GT (8).csv');
  let cc9StatementHoldings = [];
  let cc9StatementCash = 0;
  
  if (fs.existsSync(cc9CsvPath)) {
    const raw = fs.readFileSync(cc9CsvPath, 'utf8');
    const lines = raw.split('\n');
    let inHoldings = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      if (line.includes('CASH & CASH EQUIVALENT') || line.includes('Cash Balance')) {
        const parts = line.split(',');
        for (const p of parts) {
          const num = parseFloat(p.replace(/[",]/g, '').trim());
          if (!isNaN(num) && num > 0) cc9StatementCash = num;
        }
      }
      
      if (line.includes('Security Name') || line.includes('Scrip Name') || line.includes('ISIN') || (line.includes('Qty') && line.includes('Value'))) {
        inHoldings = true;
        continue;
      }
      
      if (line.includes('Total') || line.includes('PORTFOLIO TOTAL')) {
        inHoldings = false;
      }
      
      if (inHoldings) {
        // Parse CSV holding row
        // Format typically: "Security Name",ISIN,Quantity,Rate,Value...
        const cols = line.split(',').map(c => c.replace(/["]/g, '').trim());
        if (cols.length >= 4) {
          const name = cols[0];
          let isin = '';
          let qty = 0;
          let mktPrice = 0;
          let mktVal = 0;
          
          for (const c of cols) {
            if (/^INE[A-Z0-9]{9}$/i.test(c) || /^INF[A-Z0-9]{9}$/i.test(c)) {
              isin = c.toUpperCase();
            }
          }
          
          // Find numeric values
          const nums = cols.filter(c => !isNaN(parseFloat(c.replace(/,/g, '')))).map(c => parseFloat(c.replace(/,/g, '')));
          if (nums.length >= 2) {
            qty = nums[0];
            if (nums.length >= 3) {
              mktPrice = nums[1];
              mktVal = nums[2];
            } else {
              mktVal = nums[1];
            }
          }
          
          if (name && qty > 0) {
            cc9StatementHoldings.push({ name, isin, qty, mktPrice, mktVal });
          }
        }
      }
    }
  }

  // Fetch DB cc9 Holdings
  const dbCc9 = await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, current_value FROM Holdings WHERE portfolio='cc9' AND symbol != 'CASH' AND quantity > 0");
  const dbCc9Map = new Map();
  dbCc9.rows.forEach(r => {
    dbCc9Map.set(r.symbol.toUpperCase(), r);
    if (r.isin) dbCc9Map.set(r.isin.toUpperCase(), r);
  });

  console.log(`Parsed ${cc9StatementHoldings.length} securities from 26-Aug-2026 Complete Circle statement.`);
  let cc9Matches = 0;
  let cc9Diffs = 0;
  
  console.log(`\nSample CC9 Comparison (26-Aug-2026 Statement vs Live DB):`);
  cc9StatementHoldings.forEach(sh => {
    const dbRow = dbCc9Map.get(sh.isin) || dbCc9Map.get(sh.name.toUpperCase()) || null;
    const dbQty = dbRow ? Number(dbRow.quantity) : 0;
    const diff = dbQty - sh.qty;
    if (Math.abs(diff) < 0.001) {
      cc9Matches++;
    } else {
      cc9Diffs++;
      console.log(`  ⚠️ Diff in ${sh.name} (${sh.isin}): Statement Qty=${sh.qty}, DB Qty=${dbQty} (Diff=${diff})`);
    }
  });
  console.log(`  => CC9 Match Rate: ${cc9Matches} / ${cc9StatementHoldings.length} matched (Diffs: ${cc9Diffs})\n`);


  // =========================================================================
  // 2. RECONCILE PAPA (Zerodha PSI722) basis src/holdings-PSI722 (8).xlsx
  // =========================================================================
  console.log("------------------------------------------------------------------------------------------");
  console.log("2. PORTFOLIO: Papa (Zerodha Account: PSI722)");
  console.log("   Source File: src/holdings-PSI722 (8).xlsx");
  console.log("------------------------------------------------------------------------------------------");
  
  const papaPath = path.resolve('src/holdings-PSI722 (8).xlsx');
  let papaHoldings = [];
  if (fs.existsSync(papaPath)) {
    const wb = XLSX.readFile(papaPath);
    const sheet = wb.Sheets['Equity'] || wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    // Find header row (Symbol, ISIN, Quantity, Average price, etc.)
    let headerIdx = -1;
    for (let i = 0; i < data.length; i++) {
      const row = data[i] || [];
      const rowStr = row.join(' ').toLowerCase();
      if (rowStr.includes('symbol') || rowStr.includes('isin') || rowStr.includes('instrument') || (rowStr.includes('qty') && rowStr.includes('price'))) {
        headerIdx = i;
        break;
      }
    }
    
    if (headerIdx >= 0) {
      const headers = data[headerIdx].map(h => String(h || '').trim().toLowerCase());
      const symIdx = headers.findIndex(h => h.includes('symbol') || h.includes('instrument'));
      const isinIdx = headers.findIndex(h => h.includes('isin'));
      const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity'));
      const priceIdx = headers.findIndex(h => h.includes('avg') || h.includes('price'));
      const valIdx = headers.findIndex(h => h.includes('cur') || h.includes('val'));
      
      for (let i = headerIdx + 1; i < data.length; i++) {
        const r = data[i] || [];
        const sym = r[symIdx] ? String(r[symIdx]).trim().toUpperCase() : '';
        const isin = isinIdx >= 0 && r[isinIdx] ? String(r[isinIdx]).trim().toUpperCase() : '';
        const qty = qtyIdx >= 0 && r[qtyIdx] ? parseFloat(String(r[qtyIdx]).replace(/,/g, '')) : 0;
        const avgPrice = priceIdx >= 0 && r[priceIdx] ? parseFloat(String(r[priceIdx]).replace(/,/g, '')) : 0;
        
        if (sym && qty > 0) {
          papaHoldings.push({ symbol: sym, isin, qty, avgPrice });
        }
      }
    }
  }

  // Fetch DB Papa Holdings
  const dbPapa = await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, current_value FROM Holdings WHERE portfolio='Papa' AND quantity > 0");
  const dbPapaMap = new Map();
  dbPapa.rows.forEach(r => {
    dbPapaMap.set(r.symbol.toUpperCase(), r);
    if (r.isin) dbPapaMap.set(r.isin.toUpperCase(), r);
  });

  console.log(`Parsed ${papaHoldings.length} equity positions from Zerodha PSI722 statement.`);
  let papaMatches = 0;
  let papaDiffs = 0;
  
  papaHoldings.forEach(sh => {
    const dbRow = dbPapaMap.get(sh.symbol) || dbPapaMap.get(sh.isin) || null;
    const dbQty = dbRow ? Number(dbRow.quantity) : 0;
    const diff = dbQty - sh.qty;
    if (Math.abs(diff) < 0.001) {
      papaMatches++;
      console.log(`  ✅ MATCH: ${sh.symbol.padEnd(16)} | Qty: ${String(sh.qty).padStart(5)} | DB Qty: ${String(dbQty).padStart(5)}`);
    } else {
      papaDiffs++;
      console.log(`  ⚠️ DIFF:  ${sh.symbol.padEnd(16)} | Statement Qty: ${sh.qty} | DB Qty: ${dbQty} (Diff: ${diff})`);
    }
  });
  console.log(`  => Papa Match Rate: ${papaMatches} / ${papaHoldings.length} matched (Diffs: ${papaDiffs})\n`);


  // =========================================================================
  // 3. RECONCILE MAA (Zerodha IPD619) basis holdings-IPD619 (1).xlsx
  // =========================================================================
  console.log("------------------------------------------------------------------------------------------");
  console.log("3. PORTFOLIO: Maa (Zerodha Account: IPD619)");
  console.log("   Source File: holdings-IPD619 (1).xlsx");
  console.log("------------------------------------------------------------------------------------------");

  const maaPath = path.resolve('holdings-IPD619 (1).xlsx');
  let maaHoldings = [];
  if (fs.existsSync(maaPath)) {
    const wb = XLSX.readFile(maaPath);
    const sheet = wb.Sheets['Equity'] || wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    let headerIdx = -1;
    for (let i = 0; i < data.length; i++) {
      const row = data[i] || [];
      const rowStr = row.join(' ').toLowerCase();
      if (rowStr.includes('symbol') || rowStr.includes('isin') || rowStr.includes('instrument') || (rowStr.includes('qty') && rowStr.includes('price'))) {
        headerIdx = i;
        break;
      }
    }
    
    if (headerIdx >= 0) {
      const headers = data[headerIdx].map(h => String(h || '').trim().toLowerCase());
      const symIdx = headers.findIndex(h => h.includes('symbol') || h.includes('instrument'));
      const isinIdx = headers.findIndex(h => h.includes('isin'));
      const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity'));
      const priceIdx = headers.findIndex(h => h.includes('avg') || h.includes('price'));
      
      for (let i = headerIdx + 1; i < data.length; i++) {
        const r = data[i] || [];
        const sym = r[symIdx] ? String(r[symIdx]).trim().toUpperCase() : '';
        const isin = isinIdx >= 0 && r[isinIdx] ? String(r[isinIdx]).trim().toUpperCase() : '';
        const qty = qtyIdx >= 0 && r[qtyIdx] ? parseFloat(String(r[qtyIdx]).replace(/,/g, '')) : 0;
        const avgPrice = priceIdx >= 0 && r[priceIdx] ? parseFloat(String(r[priceIdx]).replace(/,/g, '')) : 0;
        
        if (sym && qty > 0) {
          maaHoldings.push({ symbol: sym, isin, qty, avgPrice });
        }
      }
    }
  }

  // Fetch DB Maa Holdings
  const dbMaa = await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, current_value FROM Holdings WHERE portfolio='Maa' AND quantity > 0");
  const dbMaaMap = new Map();
  dbMaa.rows.forEach(r => {
    dbMaaMap.set(r.symbol.toUpperCase(), r);
    if (r.isin) dbMaaMap.set(r.isin.toUpperCase(), r);
  });

  console.log(`Parsed ${maaHoldings.length} equity positions from Zerodha IPD619 statement.`);
  let maaMatches = 0;
  let maaDiffs = 0;
  
  maaHoldings.forEach(sh => {
    const dbRow = dbMaaMap.get(sh.symbol) || dbMaaMap.get(sh.isin) || null;
    const dbQty = dbRow ? Number(dbRow.quantity) : 0;
    const diff = dbQty - sh.qty;
    if (Math.abs(diff) < 0.001) {
      maaMatches++;
      console.log(`  ✅ MATCH: ${sh.symbol.padEnd(16)} | Qty: ${String(sh.qty).padStart(5)} | DB Qty: ${String(dbQty).padStart(5)}`);
    } else {
      maaDiffs++;
      console.log(`  ⚠️ DIFF:  ${sh.symbol.padEnd(16)} | Statement Qty: ${sh.qty} | DB Qty: ${dbQty} (Diff: ${diff})`);
    }
  });
  console.log(`  => Maa Match Rate: ${maaMatches} / ${maaHoldings.length} matched (Diffs: ${maaDiffs})\n`);


  // =========================================================================
  // 4. RECONCILE HDFC DEMAT basis Demat Holding Query Stmt_1692_24-08-2026 12.56.XLS
  // =========================================================================
  console.log("------------------------------------------------------------------------------------------");
  console.log("4. PORTFOLIO: HDFC Depository Statement (Maa HDFC Sky / Self HDFC / Demat)");
  console.log("   Source File: Demat Holding Query Stmt_1692_24-08-2026 12.56.XLS (As of 22-Aug-2026)");
  console.log("------------------------------------------------------------------------------------------");

  const hdfcPath = path.resolve('Demat Holding Query Stmt_1692_24-08-2026 12.56.XLS');
  let hdfcHoldings = [];
  if (fs.existsSync(hdfcPath)) {
    const wb = XLSX.readFile(hdfcPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    // Find table rows
    for (let i = 0; i < data.length; i++) {
      const r = data[i] || [];
      // Look for ISIN in row
      for (let j = 0; j < r.length; j++) {
        const val = String(r[j] || '').trim();
        if (/^INE[A-Z0-9]{9}$/i.test(val) || /^INF[A-Z0-9]{9}$/i.test(val)) {
          const isin = val.toUpperCase();
          const name = r[j - 1] ? String(r[j - 1]).trim() : (r[j + 1] ? String(r[j + 1]).trim() : '');
          // Find quantity
          const nums = r.filter(c => typeof c === 'number' || (!isNaN(parseFloat(c)) && !/^INE/i.test(String(c)))).map(c => parseFloat(c));
          const qty = nums.length > 0 ? nums[0] : 0;
          if (qty > 0) {
            hdfcHoldings.push({ isin, name, qty });
          }
        }
      }
    }
  }

  console.log(`Parsed ${hdfcHoldings.length} positions from HDFC Demat holding query statement.`);
  hdfcHoldings.forEach(h => {
    console.log(`  📄 HDFC Demat Holding: ${h.isin} | Qty: ${h.qty} | ${h.name}`);
  });

  console.log("\n==========================================================================================");
  console.log("                      RECONCILIATION SUMMARY ACROSS ALL PORTFOLIOS                        ");
  console.log("==========================================================================================");
  console.log(`1. CC9 (Complete Circle)    : ${cc9Matches}/${cc9StatementHoldings.length} Matched (Source: COMN0005_6820006... 26-Aug-2026)`);
  console.log(`2. Papa (Zerodha PSI722)    : ${papaMatches}/${papaHoldings.length} Matched (Source: holdings-PSI722.xlsx)`);
  console.log(`3. Maa (Zerodha IPD619)     : ${maaMatches}/${maaHoldings.length} Matched (Source: holdings-IPD619.xlsx)`);
  console.log(`4. HDFC Demat Statement     : ${hdfcHoldings.length} positions parsed (Source: Demat Holding Query Stmt)`);
  console.log("==========================================================================================\n");

  process.exit(0);
}

main().catch(console.error);
