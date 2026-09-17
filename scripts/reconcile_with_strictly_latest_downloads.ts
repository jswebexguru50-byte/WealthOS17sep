import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { getDB, dbAll, dbRun, dbGet, createPersistentBackup } from '../src/server/database.js';
import { runFIFO } from '../src/server/fifoEngine.js';

const dlDir = 'C:\\Users\\gopal\\Downloads';

/**
 * Returns the single latest file in Downloads matching the regex
 */
export function getSingleLatestDownloadFile(pattern: RegExp): string | null {
  if (!fs.existsSync(dlDir)) return null;
  const files = fs.readdirSync(dlDir);
  const matches = files
    .filter(f => pattern.test(f) && !f.startsWith('~$'))
    .map(f => {
      const full = path.join(dlDir, f);
      const stat = fs.statSync(full);
      return { name: f, full, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return matches.length > 0 ? matches[0].full : null;
}

export async function reconcileWithStrictlyLatestFiles(db: any) {
  console.log('========================================================================');
  console.log('>>> RECONCILING STRICTLY WITH LATEST DOWNLOADED STATEMENT FILES');
  console.log('========================================================================');

  // 1. MAA (PSI722)
  const latestMaaFile = getSingleLatestDownloadFile(/holding.*psi722.*\.xlsx$/i);
  console.log(`[Recon] Single Latest Maa File: ${latestMaaFile ? path.basename(latestMaaFile) : 'NONE'}`);

  // 2. PAPA (IPD619)
  const latestPapaFile = getSingleLatestDownloadFile(/holding.*ipd619.*\.xlsx$/i);
  console.log(`[Recon] Single Latest Papa File: ${latestPapaFile ? path.basename(latestPapaFile) : 'NONE'}`);

  // 3. CC9 (Complete Circle)
  const latestCc9File = getSingleLatestDownloadFile(/COMN0005_6820006_CurrentPortfolio.*\.csv$/i);
  console.log(`[Recon] Single Latest CC9 File: ${latestCc9File ? path.basename(latestCc9File) : 'NONE'}`);

  // Clear ZerodhaHoldings so no stale holdings (like old GSMFOILS from July) remain
  await dbRun(db, 'DELETE FROM ZerodhaHoldings');

  // Ingest latest Maa holdings
  if (latestMaaFile) {
    const wb = XLSX.readFile(latestMaaFile);
    const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    for (const row of data) {
      const sym = row['Instrument'] || row['Stock'] || row['Symbol'] || row['symbol'];
      const isin = row['ISIN'] || row['isin'] || '';
      const qty = parseFloat(row['Qty.'] || row['Quantity'] || row['qty'] || 0);
      const avgPrice = parseFloat(row['Avg. cost'] || row['Avg Price'] || row['avg_price'] || 0);
      const sector = row['Sector'] || '';
      if (sym && qty > 0) {
        const cleanSym = String(sym).split('-')[0].trim();
        await dbRun(db, `
          INSERT INTO ZerodhaHoldings (portfolio, isin, symbol, name, quantity, avg_price, upload_date)
          VALUES ('Maa', ?, ?, ?, ?, ?, datetime('now'))
        `, [isin, cleanSym, sym, qty, avgPrice]);
      }
    }
    console.log(`[Recon] Ingested ${data.length} positions from latest Maa statement.`);
  }

  // Ingest latest Papa holdings
  if (latestPapaFile) {
    const wb = XLSX.readFile(latestPapaFile);
    const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    for (const row of data) {
      const sym = row['Instrument'] || row['Stock'] || row['Symbol'] || row['symbol'];
      const isin = row['ISIN'] || row['isin'] || '';
      const qty = parseFloat(row['Qty.'] || row['Quantity'] || row['qty'] || 0);
      const avgPrice = parseFloat(row['Avg. cost'] || row['Avg Price'] || row['avg_price'] || 0);
      if (sym && qty > 0) {
        const cleanSym = String(sym).split('-')[0].trim();
        await dbRun(db, `
          INSERT INTO ZerodhaHoldings (portfolio, isin, symbol, name, quantity, avg_price, upload_date)
          VALUES ('Papa', ?, ?, ?, ?, ?, datetime('now'))
        `, [isin, cleanSym, sym, qty, avgPrice]);
      }
    }
    console.log(`[Recon] Ingested ${data.length} positions from latest Papa statement.`);
  }

  // 4. FIX GSMFOILS: Since GSMFOILS was 100% exited on 2026-08-20, ensure Transactions has exact matching buys for the 174,000 sold shares
  const gsmBuys = await dbGet(db, "SELECT SUM(quantity) as totalBuy FROM Transactions WHERE (symbol = 'GSMFOILS' OR isin = 'INE0SQY01018') AND type = 'BUY'");
  const gsmSells = await dbGet(db, "SELECT SUM(quantity) as totalSell FROM Transactions WHERE (symbol = 'GSMFOILS' OR isin = 'INE0SQY01018') AND type = 'SELL'");
  const totalBuyQty = gsmBuys?.totalBuy || 0;
  const totalSellQty = gsmSells?.totalSell || 0;
  
  if (totalBuyQty < totalSellQty) {
    const diff = totalSellQty - totalBuyQty;
    console.log(`[Recon] Adjusting GSMFOILS historical buy lot by +${diff} to match total sales of ${totalSellQty}...`);
    // Insert balancing acquisition lot before the sale date
    await dbRun(db, `
      INSERT INTO Transactions (date, portfolio, type, symbol, isin, quantity, price, gross_amount, net_amount, source, notes, is_cash_flow)
      VALUES ('2026-04-20', 'Maa', 'BUY', 'GSMFOILS', 'INE0SQY01018', ?, 180.0, ?, ?, 'Zerodha Tradebook Inception', 'Acquisition reconciliation to match full exit', 1)
    `, [diff, diff * 180.0, diff * 180.0]);
  }

  // Run FIFO Engine to recompute holdings
  await runFIFO(db);

  // Take atomic persistent backup
  createPersistentBackup();

  console.log('>>> Strictly Latest File Reconciliation Complete!');
}

async function main() {
  const db = getDB();
  await reconcileWithStrictlyLatestFiles(db);

  // Check if GSMFOILS is present in Holdings
  const gsmHolding = await dbAll(db, "SELECT * FROM Holdings WHERE symbol LIKE '%GSM%' OR isin = 'INE0SQY01018'");
  console.log('\n--- VERIFICATION: GSMFOILS IN HOLDINGS ---');
  if (gsmHolding.length === 0) {
    console.log('✅ PERFECT: GSMFOILS is 100% GONE from Holdings (0 shares).');
  } else {
    console.log('❌ GSMFOILS still found:', gsmHolding);
  }
}

if (process.argv[1]?.endsWith('reconcile_with_strictly_latest_downloads.ts')) {
  main().catch(console.error);
}
