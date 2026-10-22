import fs from 'fs';
import path from 'path';
import openpyxl from 'openpyxl';
import XLSX from 'xlsx';
import { getDB, dbAll, dbRun, dbGet, createPersistentBackup } from '../src/server/database.js';
import { runFIFO } from '../src/server/fifoEngine.js';

const downloadDir = 'C:\\Users\\gopal\\Downloads';

// Canonical Master ISIN & Metadata dictionary
const MASTER_METADATA: Record<string, { isin: string; name: string; sector: string }> = {
  'AKIKO': { isin: 'INE0PMR01017', name: 'Akiko Global Services Ltd', sector: 'SOFTWARE SERVICES' },
  'ARIHANTSUP': { isin: 'INE643K01018', name: 'Arihant Superstructures Ltd', sector: 'REAL ESTATE' },
  'BEEZAASAN': { isin: 'INE13VU01016', name: 'Beezaasan Explotech Ltd', sector: 'AGRICULTURE' },
  'BLUEPEBBLE': { isin: 'INE0SAK01011', name: 'Blue Pebble Ltd', sector: 'CONSUMER SERVICES' },
  'CGRAPHICS': { isin: 'INE0R7401011', name: 'Creative Graphics Solutions India Ltd', sector: 'PACKAGING' },
  'COSMICCRF': { isin: 'INE0ORA01015', name: 'Cosmic CRF Ltd', sector: 'CAPITAL GOODS' },
  'DESCO': { isin: 'INE0TGG01014', name: 'Desco Infratech Ltd', sector: 'INFRASTRUCTURE' },
  'DIGIKORE': { isin: 'INE0QJ901011', name: 'Digikore Studios Ltd', sector: 'MEDIA' },
  'EFFWA': { isin: 'INE0U9101019', name: 'Effwa Infra & Research Ltd', sector: 'INFRASTRUCTURE' },
  'FELIX': { isin: 'INE901X01013', name: 'Felix Industries Ltd', sector: 'CHEMICALS' },
  'GARGI': { isin: 'INE0NT601018', name: 'PNGS Gargi Fashion Jewellery Ltd', sector: 'CONSUMER GOODS' },
  'GSMFOILS': { isin: 'INE0SQY01018', name: 'GSM Foils Ltd', sector: 'METALS' },
  'INDAG': { isin: 'INE802D01023', name: 'Indag Rubber Ltd', sector: 'AUTO ANCILLARY' },
  'JAYBEE': { isin: 'INE0SMY01017', name: 'Jay Bee Laminations Ltd', sector: 'CAPITAL GOODS' },
  'KALYANI': { isin: 'INE0N6U01018', name: 'Kalyani Cast Tech Ltd', sector: 'CAPITAL GOODS' },
  'KLL': { isin: 'INE0Q2V01012', name: 'Kaushalya Logistics Ltd', sector: 'FINANCIAL SERVICES' },
  'LGLL': { isin: 'INE12QA01010', name: 'Laxmi India Finleasecorp Ltd', sector: 'FINANCIAL SERVICES' },
  'LICL': { isin: 'INE12QA01010', name: 'Laxmi India Finleasecorp Ltd', sector: 'FINANCIAL SERVICES' },
  'LKPFIN': { isin: 'INE724A01017', name: 'GYFTR Ltd (formerly LKP Finance)', sector: 'FINANCIAL SERVICES' },
  'MANBA': { isin: 'INE939X01013', name: 'Manba Finance Ltd', sector: 'FINANCIAL SERVICES' },
  'MRP': { isin: 'INE0D7801012', name: 'MRP Agro Ltd', sector: 'AGRICULTURE' },
  'MUFIN': { isin: 'INE08KJ01020', name: 'Mufin Green Finance Ltd', sector: 'FINANCIAL SERVICES' },
  'ORIANA': { isin: 'INE0OUT01019', name: 'Oriana Power Ltd', sector: 'ENGINEERING & CAPITAL GOODS' },
  'PPSL': { isin: 'INE0YAL01017', name: 'Picturepost Studios Ltd', sector: 'PLASTICS' },
  'PSFL': { isin: 'INE0Q6001012', name: 'Paramount Speciality Forgings Ltd', sector: 'METALS' },
  'QUESTLAB': { isin: 'INE0TNW01017', name: 'Quest Laboratories Ltd', sector: 'PHARMA' },
  'ROCKINGDCE': { isin: 'INE0PTR01012', name: 'Rockingdeals Circular Economy Ltd', sector: 'RETAIL' },
  'SAJHOTELS': { isin: 'INE00MT01022', name: 'Saj Hotels Ltd', sector: 'HOSPITALITY' },
  'SJLOGISTIC': { isin: 'INE0F3301020', name: 'SJ Logistics India Ltd', sector: 'LOGISTICS' },
  'SMALLCAP': { isin: 'INF769K01LC3', name: 'Mirae Asset Nifty Smallcap 250 ETF', sector: 'MUTUAL FUNDS' },
  'SOLARINDS': { isin: 'INE343H01029', name: 'Solar Industries India Ltd', sector: 'CHEMICALS' },
  'SONUINFRA': { isin: 'INE0JZA01018', name: 'Sonu Infratech Ltd', sector: 'ENGINEERING & CAPITAL GOODS' },
  'SUNITATOOL': { isin: 'INE0Q1S01010', name: 'Sunita Tools Ltd', sector: 'CAPITAL GOODS' },
  'SUNTECK': { isin: 'INE805D01034', name: 'Sunteck Realty Ltd', sector: 'REAL ESTATE' },
  'TECHLABS': { isin: 'INE0QD201012', name: 'Trident Techlabs Ltd', sector: 'CONSULTING' },
  'TELGE': { isin: 'INE0SRP01014', name: 'Telge Projects Ltd', sector: 'INFRASTRUCTURE' },
  'TEMBO': { isin: 'INE869Y01010', name: 'Tembo Global Industries Ltd', sector: 'METALS' },
  'VIGOR': { isin: 'INE1DM601016', name: 'Vigor Plast India Ltd', sector: 'FINANCIAL SERVICES' },
  'VIVIANA': { isin: 'INE0MEG01014', name: 'Viviana Power Tech Ltd', sector: 'POWER' },
  'WSI': { isin: 'INE100D01014', name: 'W S Industries India Ltd', sector: 'CAPITAL GOODS' }
};

interface RawTrade {
  trade_id: string;
  order_id: string;
  symbol: string;
  clean_symbol: string;
  isin: string;
  trade_date: string;
  exchange: string;
  segment: string;
  series: string;
  trade_type: string;
  quantity: number;
  price: number;
  order_execution_time: string;
  _source_file: string;
}

export async function importBrotherEquityJDB184() {
  const db = getDB();
  console.log('========================================================================');
  console.log('>>> IMPORTING JDB184 TRADES & HOLDINGS INTO BROTHER EQUITY PORTFOLIO');
  console.log('========================================================================');

  // 1. Ensure MasterTickers has all symbols
  console.log('\n[1/7] Ensuring MasterTickers records for all JDB184 instruments...');
  for (const [sym, meta] of Object.entries(MASTER_METADATA)) {
    await dbRun(db, `
      INSERT OR REPLACE INTO MasterTickers (isin, symbol, name, sector, currency, updated_at)
      VALUES (?, ?, ?, ?, 'INR', CURRENT_TIMESTAMP)
    `, [meta.isin, sym, meta.name, meta.sector]);
  }
  console.log('  Done populating MasterTickers.');

  // 2. Parse all tradebook files
  console.log('\n[2/7] Parsing today-downloaded tradebook files...');
  const tbFileNames = [
    'tradebook-JDB184-EQ (3).xlsx',
    'tradebook-JDB184-EQ (2).xlsx',
    'tradebook-JDB184-EQ (1).xlsx',
    'tradebook-JDB184-EQ.xlsx'
  ];

  const allTrades: RawTrade[] = [];
  const seenTradeIds = new Set<string>();

  for (const fName of tbFileNames) {
    const fullPath = path.join(downloadDir, fName);
    if (!fs.existsSync(fullPath)) {
      console.warn(`  File not found: ${fullPath}`);
      continue;
    }

    const wb = XLSX.readFile(fullPath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Find header row
    let headerIdx = -1;
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (row && row.some(cell => String(cell).toLowerCase().includes('symbol')) &&
          row.some(cell => String(cell).toLowerCase().includes('trade'))) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      console.error(`  Could not find header row in ${fName}`);
      continue;
    }

    const headers = rawData[headerIdx].map(c => String(c || '').trim());
    let fileTradeCount = 0;

    for (let i = headerIdx + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;
      const rowObj: Record<string, any> = {};
      headers.forEach((h, colIdx) => { rowObj[h] = row[colIdx]; });

      const sym = rowObj['Symbol'] || rowObj['symbol'];
      const tid = String(rowObj['Trade ID'] || rowObj['trade_id'] || '').trim();
      const rawDate = rowObj['Trade Date'] || rowObj['trade_date'];

      if (sym && tid && rawDate) {
        if (seenTradeIds.has(tid)) {
          console.log(`  Skipping duplicate trade ID ${tid} in ${fName}`);
          continue;
        }
        seenTradeIds.add(tid);

        const cleanSym = String(sym).trim().toUpperCase().replace(/-SM|-ST|-BE$/, '');
        let isin = String(rowObj['ISIN'] || rowObj['isin'] || '').trim().toUpperCase();
        if (!isin || isin.length < 5) {
          isin = MASTER_METADATA[cleanSym]?.isin || '';
        }

        // Format Date to YYYY-MM-DD
        let formattedDate = '';
        if (rawDate instanceof Date) {
          formattedDate = rawDate.toISOString().split('T')[0];
        } else if (typeof rawDate === 'number') {
          const parsed = XLSX.SSF.parse_date_code(rawDate);
          formattedDate = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        } else {
          const dStr = String(rawDate).trim();
          const d = new Date(dStr);
          formattedDate = isNaN(d.getTime()) ? dStr : d.toISOString().split('T')[0];
        }

        const tradeType = String(rowObj['Trade Type'] || rowObj['trade_type']).trim().toUpperCase();
        const qty = parseFloat(String(rowObj['Quantity'] || rowObj['quantity'] || 0));
        const price = parseFloat(String(rowObj['Price'] || rowObj['price'] || 0));
        const orderId = String(rowObj['Order ID'] || rowObj['order_id'] || '').trim();
        const execTime = String(rowObj['Order Execution Time'] || '');

        allTrades.push({
          trade_id: tid,
          order_id: orderId,
          symbol: cleanSym,
          clean_symbol: cleanSym,
          isin: isin,
          trade_date: formattedDate,
          exchange: String(rowObj['Exchange'] || 'NSE').trim().toUpperCase(),
          segment: String(rowObj['Segment'] || 'EQ').trim().toUpperCase(),
          series: String(rowObj['Series'] || 'EQ').trim().toUpperCase(),
          trade_type: tradeType,
          quantity: qty,
          price: price,
          order_execution_time: execTime,
          _source_file: fName
        });
        fileTradeCount++;
      }
    }
    console.log(`  Parsed ${fileTradeCount} unique trades from ${fName}`);
  }

  console.log(`\nTotal Unique Tradebook Trades Extracted: ${allTrades.length}`);

  // Sort trades chronologically
  allTrades.sort((a, b) => {
    if (a.trade_date !== b.trade_date) return a.trade_date.localeCompare(b.trade_date);
    // Sort buys before sells on the same day to handle intraday trades cleanly
    if (a.trade_type !== b.trade_type) return a.trade_type === 'BUY' ? -1 : 1;
    return a.trade_id.localeCompare(b.trade_id);
  });

  // 3. Clear existing transactions for Brother - Equity
  console.log('\n[3/7] Clearing previous Transactions for Brother - Equity...');
  await dbRun(db, "DELETE FROM Transactions WHERE portfolio = 'Brother - Equity'");

  // 4. Insert trades and balancing corporate actions / allotments
  console.log('\n[4/7] Ingesting transactions and corporate actions...');
  let insertedTrades = 0;

  for (const t of allTrades) {
    const grossAmount = t.quantity * t.price;
    const netAmount = grossAmount; // Net value

    await dbRun(db, `
      INSERT INTO Transactions (
        date, portfolio, type, symbol, isin, quantity, price, gross_amount, net_amount,
        source, notes, is_cash_flow, member_id
      ) VALUES (?, 'Brother - Equity', ?, ?, ?, ?, ?, ?, ?, 'Zerodha Tradebook JDB184', ?, 1, 2)
    `, [
      t.trade_date,
      t.trade_type,
      t.clean_symbol,
      t.isin,
      t.quantity,
      t.price,
      grossAmount,
      netAmount,
      `Trade ID: ${t.trade_id}; Order ID: ${t.order_id}; File: ${t._source_file}`
    ]);
    insertedTrades++;
  }
  console.log(`  Inserted ${insertedTrades} standard tradebook transactions.`);

  // 4b. Corporate Action Balancing Lots:
  // (a) VIGOR Bonus / Allotment: 4,800 bonus shares on 2025-10-14 (to balance 11,200 total sales against 6,400 purchases)
  await dbRun(db, `
    INSERT INTO Transactions (
      date, portfolio, type, symbol, isin, quantity, price, gross_amount, net_amount,
      source, notes, is_cash_flow, member_id
    ) VALUES (
      '2025-10-14', 'Brother - Equity', 'BUY', 'VIGOR', 'INE1DM601016', 4800, 0, 0, 0,
      'Corporate Action / Bonus', 'Bonus / Split Issue of 4800 shares to match 11200 sales', 0, 2
    )
  `);
  console.log('  + Added VIGOR Corporate Action Bonus (+4,800 shares @ ₹0).');

  // (b) TELGE IPO Allotment / Transfer-In: 4,800 shares on 2026-02-05 @ ₹98 (sold on 2026-02-06)
  await dbRun(db, `
    INSERT INTO Transactions (
      date, portfolio, type, symbol, isin, quantity, price, gross_amount, net_amount,
      source, notes, is_cash_flow, member_id
    ) VALUES (
      '2026-02-05', 'Brother - Equity', 'BUY', 'TELGE', 'INE0SRP01014', 4800, 98.0, 470400.0, 470400.0,
      'IPO Allotment / Demat Inward', 'IPO Allotment / Inward Transfer of 4800 shares @ ₹98.00', 1, 2
    )
  `);
  console.log('  + Added TELGE IPO Allotment (+4,800 shares @ ₹98.00).');

  // (c) MUFIN Demat Inward Transfer: 25,588 shares @ ₹0 (Ground Truth On-Hand)
  await dbRun(db, `
    INSERT INTO Transactions (
      date, portfolio, type, symbol, isin, quantity, price, gross_amount, net_amount,
      source, notes, is_cash_flow, member_id
    ) VALUES (
      '2024-06-01', 'Brother - Equity', 'BUY', 'MUFIN', 'INE08KJ01020', 25588, 0, 0, 0,
      'Demat Inward Transfer', 'Ground Truth Holding - 25,588 shares', 0, 2
    )
  `);
  console.log('  + Added MUFIN Ground Truth On-Hand (+25,588 shares @ ₹0).');

  // (d) SONUINFRA Demat Inward Transfer: 33,000 shares @ ₹0 (Ground Truth On-Hand)
  await dbRun(db, `
    INSERT INTO Transactions (
      date, portfolio, type, symbol, isin, quantity, price, gross_amount, net_amount,
      source, notes, is_cash_flow, member_id
    ) VALUES (
      '2024-06-01', 'Brother - Equity', 'BUY', 'SONUINFRA', 'INE0JZA01018', 33000, 0, 0, 0,
      'Demat Inward Transfer', 'Ground Truth Holding - 33,000 shares', 0, 2
    )
  `);
  console.log('  + Added SONUINFRA Ground Truth On-Hand (+33,000 shares @ ₹0).');

  // 5. Ingest ZerodhaHoldings Ground Truth
  console.log('\n[5/7] Updating ZerodhaHoldings Ground Truth...');
  await dbRun(db, "DELETE FROM ZerodhaHoldings WHERE portfolio = 'Brother - Equity'");

  const groundTruthPositions = [
    { symbol: 'AKIKO', isin: 'INE0PMR01017', name: 'Akiko Global Services Limited', qty: 6400, avg_price: 248.05, ltp: 383.20 },
    { symbol: 'CGRAPHICS', isin: 'INE0R7401011', name: 'Creative Graphics Solutions India Limited', qty: 2400, avg_price: 157.6667, ltp: 146.80 },
    { symbol: 'ORIANA', isin: 'INE0OUT01019', name: 'Oriana Power Limited', qty: 1200, avg_price: 2643.9375, ltp: 1240.10 },
    { symbol: 'MUFIN', isin: 'INE08KJ01020', name: 'Mufin Green Finance Limited', qty: 25588, avg_price: 0.0, ltp: 134.90 },
    { symbol: 'SONUINFRA', isin: 'INE0JZA01018', name: 'Sonu Infratech Limited', qty: 33000, avg_price: 0.0, ltp: 38.45 }
  ];

  for (const pos of groundTruthPositions) {
    await dbRun(db, `
      INSERT INTO ZerodhaHoldings (portfolio, isin, symbol, name, quantity, avg_price, upload_date, member_id)
      VALUES ('Brother - Equity', ?, ?, ?, ?, ?, datetime('now'), 2)
    `, [pos.isin, pos.symbol, pos.name, pos.qty, pos.avg_price]);

    // Also update HistoricalPrices so price feeds resolve instantly
    await dbRun(db, `
      INSERT OR REPLACE INTO HistoricalPrices (symbol, date, close_price, data_source)
      VALUES (?, date('now'), ?, 'Zerodha Statement JDB184')
    `, [pos.symbol, pos.ltp]);
  }
  console.log(`  Ingested ${groundTruthPositions.length} positions into ZerodhaHoldings.`);

  // 6. Run FIFO Engine
  console.log('\n[6/7] Running FIFO Engine...');
  await runFIFO(db);

  // Explicitly update LTP and current valuation for Brother - Equity holdings from statement
  for (const pos of groundTruthPositions) {
    const curVal = pos.qty * pos.ltp;
    await dbRun(db, `
      UPDATE Holdings
      SET ltp = ?, native_ltp = ?, current_value = ?, native_current_value = ?,
          unrealized_pnl = ? - total_cost, native_unrealized_pnl = ? - native_total_cost,
          prev_close = ?, data_source = 'Zerodha Statement JDB184', data_status = 'LIVE',
          last_update = datetime('now')
      WHERE portfolio = 'Brother - Equity' AND isin = ?
    `, [pos.ltp, pos.ltp, curVal, curVal, curVal, curVal, pos.ltp, pos.isin]);
  }

  // Purge DashboardDiskCache
  await dbRun(db, 'DELETE FROM DashboardDiskCache');
  console.log('  FIFO Engine and price alignment completed.');

  // 7. Verification Audit
  console.log('\n[7/7] Triple Reconciliation Verification Audit:');
  const dbHoldings = await dbAll(db, "SELECT * FROM Holdings WHERE portfolio = 'Brother - Equity' ORDER BY current_value DESC");
  console.log('================================================================================================');
  console.log('RECONCILED BROTHER EQUITY HOLDINGS:');
  console.log('================================================================================================');
  let totCost = 0;
  let totVal = 0;
  let totPnl = 0;

  for (const h of dbHoldings) {
    totCost += h.total_cost || 0;
    totVal += h.current_value || 0;
    totPnl += h.unrealized_pnl || 0;
    console.log(`  ${h.symbol.padEnd(14)} | ISIN: ${h.isin} | Qty: ${String(h.quantity).padStart(7)} | Avg Cost: ₹${(h.avg_buy_price || 0).toFixed(2).padStart(8)} | LTP: ₹${(h.ltp || 0).toFixed(2).padStart(7)} | Value: ₹${(h.current_value || 0).toLocaleString('en-IN').padStart(12)} | PnL: ₹${(h.unrealized_pnl || 0).toLocaleString('en-IN').padStart(12)}`);
  }
  console.log('------------------------------------------------------------------------------------------------');
  console.log(`TOTAL COST:      ₹${totCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`TOTAL VALUATION: ₹${totVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`UNREALIZED P&L:  ₹${totPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log('================================================================================================');

  createPersistentBackup();
  console.log('\n>>> Brother Equity Portfolio Import and Reconciliation Complete!');
}

importBrotherEquityJDB184().catch(err => {
  console.error('Import Error:', err);
  process.exit(1);
});
