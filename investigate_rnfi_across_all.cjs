const { createClient } = require('@libsql/client');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  console.log("==========================================================================================");
  console.log("                      INVESTIGATING RNFI ACROSS ALL PORTFOLIOS                            ");
  console.log("==========================================================================================\n");

  // 1. Check MasterTickers for RNFI
  const mt = await db.execute("SELECT * FROM MasterTickers WHERE symbol LIKE '%RNFI%' OR name LIKE '%RNFI%' OR isin = 'INE0SA001017'");
  console.log("=== 1. MASTER TICKERS ===");
  console.log(mt.rows);

  // 2. Check Holdings table across all portfolios
  const holdings = await db.execute("SELECT portfolio, symbol, isin, quantity, avg_buy_price, total_cost, current_value, ltp FROM Holdings WHERE symbol LIKE '%RNFI%' OR isin LIKE '%RNFI%' OR isin = 'INE0SA001017' OR symbol LIKE '%INE08GI01012%'");
  console.log("\n=== 2. CURRENT DATABASE HOLDINGS (TABLE: Holdings) ===");
  console.log(holdings.rows);

  // 3. Check ZerodhaHoldings table
  const zh = await db.execute("SELECT * FROM ZerodhaHoldings WHERE symbol LIKE '%RNFI%' OR isin = 'INE0SA001017'");
  console.log("\n=== 3. ZERODHA HOLDINGS (TABLE: ZerodhaHoldings) ===");
  console.log(zh.rows);

  // 4. Check Transactions table across ALL portfolios
  const tx = await db.execute("SELECT id, portfolio, date, type, symbol, isin, quantity, price, gross_amount, net_amount, source, notes FROM Transactions WHERE symbol LIKE '%RNFI%' OR isin LIKE '%RNFI%' OR isin = 'INE0SA001017' OR notes LIKE '%RNFI%' ORDER BY portfolio, date ASC, id ASC");
  console.log(`\n=== 4. TRANSACTIONS HISTORY (${tx.rows.length} transactions found) ===`);
  
  // Group by portfolio and calculate cumulative quantity
  const pMap = {};
  tx.rows.forEach(t => {
    const p = t.portfolio || 'UNKNOWN';
    if (!pMap[p]) pMap[p] = { buys: 0, sells: 0, netQty: 0, txns: [] };
    const qty = Number(t.quantity || 0);
    const type = String(t.type || '').toUpperCase();
    if (type.includes('BUY') || type === 'IN' || type === 'SECURITY IN' || type === 'BONUS') {
      pMap[p].buys += qty;
      pMap[p].netQty += qty;
    } else if (type.includes('SELL') || type === 'OUT' || type === 'SECURITY OUT') {
      pMap[p].sells += qty;
      pMap[p].netQty -= qty;
    }
    pMap[p].txns.push(t);
  });

  for (const [p, data] of Object.entries(pMap)) {
    console.log(`\n--- Portfolio: ${p} ---`);
    console.log(`Total Buys: ${data.buys} | Total Sells: ${data.sells} | Net Computed Ledger Qty: ${data.netQty}`);
    console.log(`Transactions breakdown:`);
    data.txns.forEach(t => {
      console.log(`  [ID: ${String(t.id).padStart(5)}] ${t.date} | ${t.type.padEnd(8)} | Qty: ${String(t.quantity).padStart(6)} @ ₹${String(t.price).padStart(7)} | NetAmt: ₹${String(t.net_amount || t.gross_amount).padStart(9)} | Notes: ${t.notes || ''}`);
    });
  }

  // 5. Scan all files in the explorer for RNFI or INE0SA001017 or INE08GI01012
  console.log("\n=== 5. CHECKING ALL SOURCE STATEMENT FILES ===");

  // A. holdings-PSI722 (8).xlsx (Maa Zerodha)
  const psiFile = path.resolve('src/holdings-PSI722 (8).xlsx');
  if (fs.existsSync(psiFile)) {
    const wb = XLSX.readFile(psiFile);
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
      rows.forEach((r, idx) => {
        const str = r.join(' ');
        if (str.includes('RNFI') || str.includes('INE0SA001017') || str.includes('INE08GI01012')) {
          console.log(`[File: holdings-PSI722 (8).xlsx | Sheet: ${sheetName} | Row ${idx}]:`, JSON.stringify(r));
        }
      });
    }
  }

  // B. holdings-IPD619 (1).xlsx (Papa Zerodha)
  const ipdFile = path.resolve('holdings-IPD619 (1).xlsx');
  if (fs.existsSync(ipdFile)) {
    const wb = XLSX.readFile(ipdFile);
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
      rows.forEach((r, idx) => {
        const str = r.join(' ');
        if (str.includes('RNFI') || str.includes('INE0SA001017')) {
          console.log(`[File: holdings-IPD619 (1).xlsx | Sheet: ${sheetName} | Row ${idx}]:`, JSON.stringify(r));
        }
      });
    }
  }

  // C. Demat Holding Query Stmt
  const dematFile = path.resolve('Demat Holding Query Stmt_1692_24-08-2026 12.56.XLS');
  if (fs.existsSync(dematFile)) {
    const wb = XLSX.readFile(dematFile);
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
      rows.forEach((r, idx) => {
        const str = r.join(' ');
        if (str.includes('RNFI') || str.includes('INE0SA001017') || str.includes('INE08GI01012')) {
          console.log(`[File: Demat Holding Query Stmt | Sheet: ${sheetName} | Row ${idx}]:`, JSON.stringify(r));
        }
      });
    }
  }

  // D. Complete Circle statement
  const ccCsv = path.resolve('src/COMN0005_6820006_CurrentPortfolio2086GT (8).csv');
  if (fs.existsSync(ccCsv)) {
    const lines = fs.readFileSync(ccCsv, 'utf8').split('\n');
    lines.forEach((l, idx) => {
      if (l.includes('RNFI') || l.includes('INE0SA001017')) {
        console.log(`[File: Complete Circle CSV | Line ${idx}]:`, l);
      }
    });
  }

  process.exit(0);
}

main().catch(console.error);
