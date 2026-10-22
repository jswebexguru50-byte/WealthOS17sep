import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { getDB, dbAll, dbRun, dbGet } from '../src/server/database.js';
import { runFIFO } from '../src/server/fifoEngine.js';

function readWorkbook(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') {
    return XLSX.read(fs.readFileSync(filePath, 'utf8'), { type: 'string' });
  }
  return XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const CC9_NAME_TO_SYM: Record<string, { sym: string, isin: string }> = {
  'SOLAR INDUSTRIES INDIA': { sym: 'SOLARINDS', isin: 'INE343H01029' },
  'HIRECT': { sym: 'HIRECT', isin: 'INE835D01023' },
  'HIND RECTIFIERS': { sym: 'HIRECT', isin: 'INE835D01023' },
  'UNO MINDA': { sym: 'UNOMINDA', isin: 'INE405E01023' },
  'LAURUS LABS': { sym: 'LAURUSLABS', isin: 'INE947Q01028' },
  'POLYCAB INDIA': { sym: 'POLYCAB', isin: 'INE455K01017' },
  'J G CHEMICALS': { sym: 'JGCHEM', isin: 'INE0CG901018' },
  'J.G.CHEMICALS': { sym: 'JGCHEM', isin: 'INE0CG901018' },
  'BHARTI AIRTEL': { sym: 'BHARTIARTL', isin: 'INE397D01024' },
  'FEDERAL BANK': { sym: 'FEDERALBNK', isin: 'INE171A01029' },
  'LARSEN and TOUBRO': { sym: 'LT', isin: 'INE018A01030' },
  'LARSEN & TOUBRO': { sym: 'LT', isin: 'INE018A01030' },
  'CENTRAL DEPOSITORY SERVICES': { sym: 'CDSL', isin: 'INE736A01011' },
  'RELIANCE INDUSTRIES': { sym: 'RELIANCE', isin: 'INE002A01018' },
  'AZAD ENGINEERING': { sym: 'AZAD', isin: 'INE028801017' },
  'ETERNAL': { sym: 'ETERNAL', isin: 'INE758T01015' },
  'DIVIS LABORATORIES': { sym: 'DIVISLAB', isin: 'INE361B01024' },
  'HINDUSTAN AERONAUTICS': { sym: 'HAL', isin: 'INE066F01012' },
  'MAZAGON DOCK SHIPBUILDERS': { sym: 'MAZDOCK', isin: 'INE249Z01012' },
  'BAJAJ FINANCE': { sym: 'BAJFINANCE', isin: 'INE296A01024' },
  'HDFC BANK': { sym: 'HDFCBANK', isin: 'INE040A01034' },
  'PIDILITE INDUSTRIES': { sym: 'PIDILITIND', isin: 'INE318A01026' },
  'TATA MOTORS': { sym: 'TATAMOTORS', isin: 'INE155A01022' },
  'TATA POWER': { sym: 'TATAPOWER', isin: 'INE245A01021' },
  'KPIT TECHNOLOGIES': { sym: 'KPITTECH', isin: 'INE04I401011' },
  'TINNA RUBBER': { sym: 'TINNARUBR', isin: 'INE437C01024' },
  'ZEN TECHNOLOGIES': { sym: 'ZENTEC', isin: 'INE251B01027' },
  'BILLIONBRAINS GARAGE VENTURES': { sym: 'GROWW', isin: 'INE0HOQ01053' },
  'DIXON TECHNOLOGIES': { sym: 'DIXON', isin: 'INE935N01020' },
  'APL APOLLO TUBES': { sym: 'APLAPOLLO', isin: 'INE702C01027' },
  'MAHINDRA and MAHINDRA': { sym: 'M&M', isin: 'INE101A01026' },
  'MAHINDRA & MAHINDRA': { sym: 'M&M', isin: 'INE101A01026' },
  'ITC': { sym: 'ITC', isin: 'INE154A01025' },
  'VEDANTA ALUMINIUM METAL': { sym: 'VEDL', isin: 'INE205A01025' },
  'EPL': { sym: 'EPL', isin: 'INE255A01020' },
  'ONE 97 COMMUNICATIONS': { sym: 'PAYTM', isin: 'INE982J01020' },
  'RBL BANK': { sym: 'RBLBANK', isin: 'INE976G01028' },
  'JIO FINANCIAL SERVICES': { sym: 'JIOFIN', isin: 'INE758E01017' },
  'BAJAJ HOUSING FINANCE': { sym: 'BAJAJHFL', isin: 'INE377Y01017' },
  'TATA CONSUMER PRODUCTS': { sym: 'TATACONSUM', isin: 'INE192A01025' },
  'AMARA RAJA ENERGY & MOBILITY': { sym: 'ARE&M', isin: 'INE885A01032' },
  'BANK OF BARODA': { sym: 'BANKBARODA', isin: 'INE028A01039' },
  'GANESHA ECOSPHERE': { sym: 'GANECOS', isin: 'INE845D01014' },
  'GOKALDAS EXPORTS': { sym: 'GOKEX', isin: 'INE887G01027' },
  'HOME FIRST FINANCE COMPANY': { sym: 'HOMEFIRST', isin: 'INE481N01025' },
  'MEESHO': { sym: 'MEESHO', isin: 'INE0MEE01010' },
  'NARAYANA HRUDAYALAYA': { sym: 'NH', isin: 'INE410P01011' },
  'OLECTRA GREENTECH': { sym: 'OLECTRA', isin: 'INE260D01016' },
  'RAJRATAN GLOBAL WIRE': { sym: 'RAJRATAN', isin: 'INE451D01029' },
  'STATE BANK OF INDIA': { sym: 'SBIN', isin: 'INE062A01020' },
  'BLUE JET HEALTHCARE': { sym: 'BLUEJET', isin: 'INE0BCP01023' },
  'CG POWER': { sym: 'CGPOWER', isin: 'INE067A01029' },
  'ESCORTS KUBOTA': { sym: 'ESCORTS', isin: 'INE042A01014' },
  'BHARAT ELECTRONICS': { sym: 'BEL', isin: 'INE263A01024' },
  'SBI FUNDS MANAGEMENT': { sym: 'SBIFUN', isin: 'INE006B01013' },
  'FRATELLI VINES': { sym: 'FRATELLIVI', isin: 'INE082E01010' },
  'FRATELLI VINEYARDS': { sym: 'FRATELLIVI', isin: 'INE082E01010' }
};

function resolveCC9SymbolAndIsin(name: string): { sym: string, isin: string } {
  for (const [k, v] of Object.entries(CC9_NAME_TO_SYM)) {
    if (name.toUpperCase().includes(k.toUpperCase())) return v;
  }
  const cleanSym = name.replace(/[^A-Z0-9]/g, '').slice(0, 10);
  return { sym: cleanSym, isin: 'CUSTOM_' + cleanSym };
}

async function executeFullReconciliation() {
  const db = getDB();
  const workspaceDir = process.cwd();

  console.log('======================================================================');
  console.log('STARTING PERMANENT RECONCILIATION ACROSS ALL PORTFOLIOS');
  console.log('======================================================================');

  // -------------------------------------------------------------------------
  // 1. RECONCILE CC9 PMS HOLDINGS & TRANSACTIONS
  // -------------------------------------------------------------------------
  console.log('\n>>> 1. Reconciling CC9 against 28-Aug Official Statement...');
  const stmtPath = path.join(workspaceDir, 'COMN0005_6820006_CurrentPortfolio2086GT (9).csv');
  const stmtContent = fs.readFileSync(stmtPath, 'utf8');
  const lines = stmtContent.split('\n');

  interface CC9Position {
    name: string;
    sym: string;
    isin: string;
    qty: number;
    unit_cost: number;
    total_cost: number;
    mkt_price: number;
    mkt_val: number;
  }

  const stmtPositions: CC9Position[] = [];
  let stmtTotalVal = 0;
  let stmtTotalCost = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cols = parseCSVLine(line);
    if (cols.length >= 8 && cols[0] && cols[0] !== 'Security' && !cols[0].includes('Complete Circle') && !cols[0].includes('Total') && !cols[0].includes('Other Assets') && !cols[0].includes('Equity') && !cols[0].includes('Tolstoy')) {
      const name = cols[0].trim();
      const qty = parseFloat(cols[3]?.replace(/,/g, ''));
      const unitCost = parseFloat(cols[4]?.replace(/,/g, ''));
      const totalCost = parseFloat(cols[5]?.replace(/,/g, ''));
      const mktPrice = parseFloat(cols[6]?.replace(/,/g, ''));
      const mktVal = parseFloat(cols[7]?.replace(/,/g, ''));

      if (!isNaN(qty) && qty > 0 && !isNaN(mktVal)) {
        const { sym, isin } = resolveCC9SymbolAndIsin(name);
        stmtPositions.push({ name, sym, isin, qty, unit_cost: unitCost, total_cost: totalCost, mkt_price: mktPrice, mkt_val: mktVal });
        stmtTotalVal += mktVal;
        stmtTotalCost += totalCost;
      }
    }
  }

  console.log(`Parsed ${stmtPositions.length} CC9 positions from statement.`);
  console.log(`Statement Equities Valuation: ₹${(stmtTotalVal / 10000000).toFixed(4)} Cr | Cost: ₹${(stmtTotalCost / 10000000).toFixed(4)} Cr`);

  // Ensure MasterTickers is updated with exact ISIN, symbol, and statement LTP
  for (const pos of stmtPositions) {
    await dbRun(db, `
      INSERT INTO MasterTickers (isin, symbol, name, exchange, segment, manual_ltp, manual_ltp_date)
      VALUES (?, ?, ?, 'NSE', 'EQ', ?, '2026-08-28')
      ON CONFLICT(isin) DO UPDATE SET
        symbol = excluded.symbol,
        name = CASE WHEN MasterTickers.name IS NULL OR MasterTickers.name = '' OR MasterTickers.name = MasterTickers.symbol THEN excluded.name ELSE MasterTickers.name END,
        manual_ltp = excluded.manual_ltp,
        manual_ltp_date = '2026-08-28'
    `, [pos.isin, pos.sym, pos.name, pos.mkt_price]).catch(() => {});
  }

  // Check current transactions for CC9
  const existingTxns = await dbAll(db, "SELECT * FROM Transactions WHERE portfolio = 'cc9'");
  console.log(`Existing CC9 Transactions in DB: ${existingTxns.length}`);

  // For each position, check if net transactions equal statement quantity
  for (const pos of stmtPositions) {
    const symTxns = existingTxns.filter(t => t.isin === pos.isin || t.symbol === pos.sym);
    let netQty = 0;
    for (const t of symTxns) {
      const type = String(t.type).toUpperCase();
      if (type.includes('BUY') || type.includes('IPO') || type.includes('BONUS') || type.includes('REINVEST')) {
        netQty += t.quantity;
      } else if (type.includes('SELL') || type.includes('TRANSFER OUT') || type.includes('MERGED_OUT')) {
        netQty -= t.quantity;
      }
    }

    const diffQty = pos.qty - netQty;
    if (Math.abs(diffQty) > 0.001) {
      console.log(`Reconciling CC9 ${pos.sym} (${pos.isin}): Statement Qty = ${pos.qty}, Net Txn Qty = ${netQty}, Diff = ${diffQty}`);
      if (diffQty > 0) {
        // Missing buy lots: Insert canonical buy lot as of initial takeover / statement date
        await dbRun(db, `
          INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, notes)
          VALUES ('2023-10-04', 'cc9', 'BUY', ?, ?, ?, ?, ?, ?, 'Canonical PMS Inception Lot Reconciliation')
        `, [pos.isin, pos.sym, diffQty, pos.unit_cost, diffQty * pos.unit_cost, diffQty * pos.unit_cost]);
      } else {
        // Extra quantity: Insert adjustment sell lot
        const sellQty = Math.abs(diffQty);
        await dbRun(db, `
          INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, notes)
          VALUES ('2026-08-28', 'cc9', 'SELL', ?, ?, ?, ?, ?, ?, 'Canonical PMS Adjustment Lot Reconciliation')
        `, [pos.isin, pos.sym, sellQty, pos.unit_cost, sellQty * pos.unit_cost, sellQty * pos.unit_cost]);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. RUN FIFO ENGINE TO COMPUTE GROUND TRUTH HOLDINGS
  // -------------------------------------------------------------------------
  console.log('\n>>> 2. Running FIFO Engine...');
  await runFIFO(db);
  console.log('FIFO Engine execution completed.');

  // -------------------------------------------------------------------------
  // 3. APPLY CASH POSITION & POST-FIFO PMS SANCTITY
  // -------------------------------------------------------------------------
  console.log('\n>>> 3. Setting CC9 Cash in Hand...');
  await dbRun(db, `DELETE FROM Holdings WHERE portfolio = 'cc9' AND symbol = 'CASH'`).catch(() => {});
  await dbRun(db, `
    INSERT INTO Holdings (
      portfolio, isin, symbol, quantity, avg_buy_price, total_cost, ltp, prev_close, day_change, day_change_pct, current_value, unrealized_pnl, unrealized_pct, currency, native_ltp, native_current_value, native_total_cost, native_avg_buy_price, native_unrealized_pnl
    )
    VALUES (
      'cc9', 'CASH', 'CASH', 22559.08, 1.0, 22559.08, 1.0, 1.0, 0, 0, 22559.08, 0, 0, 'INR', 1.0, 22559.08, 22559.08, 1.0, 0
    )
  `);

  // Verify CC9 final Holdings in DB
  const finalCC9Holdings = await dbAll(db, "SELECT * FROM Holdings WHERE portfolio = 'cc9'");
  const finalCC9Cost = finalCC9Holdings.reduce((s, h) => s + (h.total_cost || 0), 0);
  const finalCC9Val = finalCC9Holdings.reduce((s, h) => s + (h.current_value || (h.quantity * h.ltp) || 0), 0);
  console.log(`\nCC9 FINAL RECONCILED HOLDINGS:`);
  console.log(`- Scrip Count:  ${finalCC9Holdings.length}`);
  console.log(`- Cost Basis:   ₹${(finalCC9Cost / 10000000).toFixed(4)} Cr`);
  console.log(`- Market Value: ₹${(finalCC9Val / 10000000).toFixed(4)} Cr (Expected: ~₹7.346 Cr)`);

  // -------------------------------------------------------------------------
  // 4. AUDIT & VERIFY ALL PORTFOLIOS SUMMARY
  // -------------------------------------------------------------------------
  const summary = await dbAll(db, `
    SELECT 
      portfolio, 
      COUNT(*) as scrips, 
      SUM(total_cost) as total_cost, 
      SUM(current_value) as current_value,
      SUM(unrealized_pnl) as unrealized_pnl
    FROM Holdings
    GROUP BY portfolio
  `);

  console.log('\n======================================================================');
  console.log('ALL PORTFOLIOS RECONCILED SUMMARY TABLE:');
  console.log('======================================================================');
  console.table(summary.map(s => ({
    portfolio: s.portfolio,
    scrips: s.scrips,
    cost_Cr: (s.total_cost / 10000000).toFixed(4),
    val_Cr: (s.current_value / 10000000).toFixed(4),
    gain_Cr: (s.unrealized_pnl / 10000000).toFixed(4),
    gain_pct: s.total_cost > 0 ? ((s.unrealized_pnl / s.total_cost) * 100).toFixed(2) + '%' : '0.00%'
  })));

  console.log('\n>>> Reconciliation script completed successfully!');
}

executeFullReconciliation().catch(console.error);
