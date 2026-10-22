import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { getDB, dbAll, dbRun, dbGet, createPersistentBackup } from '../src/server/database.js';
import { runFIFO } from '../src/server/fifoEngine.js';

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

export async function setupPmsGroundTruthAndLock(db: any) {
  console.log('>>> [Sanctity Engine] Setting up PmsSummaryHoldings ground truth table...');
  
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS PmsSummaryHoldings (
      portfolio TEXT NOT NULL,
      isin TEXT NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT,
      quantity REAL NOT NULL,
      avg_price REAL NOT NULL,
      total_cost REAL NOT NULL,
      ltp REAL NOT NULL,
      current_value REAL NOT NULL,
      statement_date TEXT,
      PRIMARY KEY (portfolio, isin)
    )
  `);

  const stmtPath = path.join(process.cwd(), 'COMN0005_6820006_CurrentPortfolio2086GT (9).csv');
  if (!fs.existsSync(stmtPath)) {
    console.warn('[Sanctity Engine] Statement file not found:', stmtPath);
    return;
  }

  const content = fs.readFileSync(stmtPath, 'utf8');
  const lines = content.split('\n');

  await dbRun(db, "DELETE FROM PmsSummaryHoldings WHERE portfolio = 'cc9'");

  let parsedCount = 0;
  let totalEquityCost = 0;
  let totalEquityVal = 0;

  for (const line of lines) {
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
        await dbRun(db, `
          INSERT OR REPLACE INTO PmsSummaryHoldings (portfolio, isin, symbol, name, quantity, avg_price, total_cost, ltp, current_value, statement_date)
          VALUES ('cc9', ?, ?, ?, ?, ?, ?, ?, ?, '2026-08-28')
        `, [isin, sym, name, qty, unitCost, totalCost, mktPrice, mktVal]);

        // Also ensure MasterTickers is updated with canonical symbol and statement LTP
        await dbRun(db, `
          INSERT INTO MasterTickers (isin, symbol, name, exchange, segment, manual_ltp, manual_ltp_date)
          VALUES (?, ?, ?, 'NSE', 'EQ', ?, '2026-08-28')
          ON CONFLICT(isin) DO UPDATE SET
            symbol = excluded.symbol,
            name = CASE WHEN MasterTickers.name IS NULL OR MasterTickers.name = '' OR MasterTickers.name = MasterTickers.symbol THEN excluded.name ELSE MasterTickers.name END,
            manual_ltp = excluded.manual_ltp,
            manual_ltp_date = '2026-08-28'
        `, [isin, sym, name, mktPrice]).catch(() => {});

        totalEquityCost += totalCost;
        totalEquityVal += mktVal;
        parsedCount++;
      }
    }
  }

  console.log(`[Sanctity Engine] Successfully populated PmsSummaryHoldings with ${parsedCount} official positions.`);
  console.log(`[Sanctity Engine] CC9 Ground Truth Equities Value: ₹${(totalEquityVal / 10000000).toFixed(4)} Cr | Cost: ₹${(totalEquityCost / 10000000).toFixed(4)} Cr`);
}

async function main() {
  const db = getDB();
  await setupPmsGroundTruthAndLock(db);

  console.log('\n>>> Running FIFO Engine with ground truth locks...');
  await runFIFO(db);

  createPersistentBackup();
  console.log('\n>>> All done! Reconciled and locked.');
}

if (process.argv[1]?.endsWith('reconcile_and_lock_database_sanctity.ts')) {
  main().catch(console.error);
}
