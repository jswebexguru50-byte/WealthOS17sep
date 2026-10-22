import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('portfolio.db');

function dbRun(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAll(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
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

const NAME_TO_SYM: Record<string, string> = {
  'SOLAR INDUSTRIES INDIA': 'SOLARINDS',
  'HIRECT': 'HIRECT',
  'HIND RECTIFIERS': 'HIRECT',
  'UNO MINDA': 'UNOMINDA',
  'LAURUS LABS': 'LAURUSLABS',
  'POLYCAB INDIA': 'POLYCAB',
  'J G CHEMICALS': 'JGCHEM',
  'J.G.CHEMICALS': 'JGCHEM',
  'BHARTI AIRTEL': 'BHARTIARTL',
  'FEDERAL BANK': 'FEDERALBNK',
  'LARSEN and TOUBRO': 'LT',
  'LARSEN & TOUBRO': 'LT',
  'CENTRAL DEPOSITORY SERVICES': 'CDSL',
  'RELIANCE INDUSTRIES': 'RELIANCE',
  'AZAD ENGINEERING': 'AZAD',
  'ETERNAL': 'ETERNAL',
  'DIVIS LABORATORIES': 'DIVISLAB',
  'HINDUSTAN AERONAUTICS': 'HAL',
  'MAZAGON DOCK SHIPBUILDERS': 'MAZDOCK',
  'BAJAJ FINANCE': 'BAJFINANCE',
  'HDFC BANK': 'HDFCBANK',
  'PIDILITE INDUSTRIES': 'PIDILITIND',
  'TATA MOTORS': 'TATAMOTORS',
  'TATA POWER': 'TATAPOWER',
  'KPIT TECHNOLOGIES': 'KPITTECH',
  'TINNA RUBBER': 'TINNARUBR',
  'ZEN TECHNOLOGIES': 'ZENTEC',
  'BILLIONBRAINS GARAGE VENTURES': 'GROWW',
  'DIXON TECHNOLOGIES': 'DIXON',
  'APL APOLLO TUBES': 'APLAPOLLO',
  'MAHINDRA and MAHINDRA': 'M&M',
  'MAHINDRA & MAHINDRA': 'M&M',
  'ITC': 'ITC',
  'VEDANTA ALUMINIUM METAL': 'VEDL',
  'EPL': 'EPL',
  'ONE 97 COMMUNICATIONS': 'PAYTM',
  'RBL BANK': 'RBLBANK',
  'JIO FINANCIAL SERVICES': 'JIOFIN',
  'BAJAJ HOUSING FINANCE': 'BAJAJHFL',
  'TATA CONSUMER PRODUCTS': 'TATACONSUM',
  'AMARA RAJA ENERGY & MOBILITY': 'ARE&M',
  'BANK OF BARODA': 'BANKBARODA',
  'GANESHA ECOSPHERE': 'GANECOS',
  'GOKALDAS EXPORTS': 'GOKEX',
  'HOME FIRST FINANCE COMPANY': 'HOMEFIRST',
  'MEESHO': 'MEESHO',
  'NARAYANA HRUDAYALAYA': 'NH',
  'OLECTRA GREENTECH': 'OLECTRA',
  'RAJRATAN GLOBAL WIRE': 'RAJRATAN',
  'STATE BANK OF INDIA': 'SBIN',
  'BLUE JET HEALTHCARE': 'BLUEJET',
  'CG POWER': 'CGPOWER',
  'ESCORTS KUBOTA': 'ESCORTS',
  'BHARAT ELECTRONICS': 'BEL',
  'SBI FUNDS MANAGEMENT': 'SBIFUN',
  'FRATELLI VINEYARDS': 'FRATELLI'
};

function resolveSymbol(name: string): string {
  for (const [k, sym] of Object.entries(NAME_TO_SYM)) {
    if (name.toUpperCase().includes(k.toUpperCase())) return sym;
  }
  return name.replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

async function syncExact28AugPositions() {
  console.log('================================================================================');
  console.log('SYNCHRONIZING EXACT 28-AUG-2026 COMPLETE CIRCLE POSITIONS INTO HOLDINGS TABLE');
  console.log('================================================================================');

  // Load ISIN map from MasterTickers and Transactions
  const isinRows = await dbAll("SELECT symbol, isin FROM MasterTickers WHERE isin IS NOT NULL AND isin != ''");
  const isinMap: Record<string, string> = {};
  isinRows.forEach(r => { isinMap[r.symbol] = r.isin; });

  const txnIsinRows = await dbAll("SELECT symbol, isin FROM Transactions WHERE isin IS NOT NULL AND isin != ''");
  txnIsinRows.forEach(r => { if (!isinMap[r.symbol]) isinMap[r.symbol] = r.isin; });

  const stmtPath = path.join(process.cwd(), 'COMN0005_6820006_CurrentPortfolio2086GT (9).csv');
  const content = fs.readFileSync(stmtPath, 'utf8');
  const lines = content.split('\n');

  // Clear existing CC9 Holdings
  await dbRun("DELETE FROM Holdings WHERE portfolio = 'cc9'");

  let totalEquityVal = 0;
  let totalCost = 0;
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cols = parseCSVLine(line);
    if (cols.length >= 8 && cols[0] && cols[0] !== 'Security' && !cols[0].includes('Complete Circle') && !cols[0].includes('Total') && !cols[0].includes('Other Assets') && !cols[0].includes('Equity') && !cols[0].includes('Tolstoy')) {
      const name = cols[0].trim();
      const qty = parseFloat(cols[3]?.replace(/,/g, ''));
      const unitCost = parseFloat(cols[4]?.replace(/,/g, ''));
      const scripTotalCost = parseFloat(cols[5]?.replace(/,/g, ''));
      const mktPrice = parseFloat(cols[6]?.replace(/,/g, ''));
      const mktVal = parseFloat(cols[7]?.replace(/,/g, ''));

      if (!isNaN(qty) && qty > 0 && !isNaN(mktVal)) {
        const sym = resolveSymbol(name);
        const isin = isinMap[sym] || `IN999${sym.slice(0, 7)}`;
        const unrealizedPnl = mktVal - scripTotalCost;
        const unrealizedPct = scripTotalCost > 0 ? (unrealizedPnl / scripTotalCost) * 100 : 0;

        await dbRun(`
          INSERT INTO Holdings (
            portfolio, symbol, isin, quantity, avg_buy_price, total_cost,
            tax_avg_price, tax_cost_basis, ltp, prev_close,
            current_value, unrealized_pnl, unrealized_pct, day_change,
            day_change_pct, currency
          ) VALUES (
            'cc9', ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, 0,
            0, 'INR'
          )
        `, [
          sym, isin, qty, unitCost, scripTotalCost,
          unitCost, scripTotalCost, mktPrice, mktPrice,
          mktVal, unrealizedPnl, unrealizedPct
        ]);

        totalEquityVal += mktVal;
        totalCost += scripTotalCost;
        count++;
      }
    }
  }

  // Insert Cash row
  const cashVal = 22559.08;
  await dbRun(`
    INSERT INTO Holdings (
      portfolio, symbol, isin, quantity, avg_buy_price, total_cost,
      tax_avg_price, tax_cost_basis, ltp, prev_close,
      current_value, unrealized_pnl, unrealized_pct, day_change,
      day_change_pct, currency
    ) VALUES (
      'cc9', 'CASH', 'INR000000001', ?, 1.0, ?,
      1.0, ?, 1.0, 1.0,
      ?, 0, 0, 0,
      0, 'INR'
    )
  `, [cashVal, cashVal, cashVal, cashVal]);

  const totalPortfolioVal = totalEquityVal + cashVal;

  // Clear disk cache
  await dbRun("DELETE FROM DashboardDiskCache");

  console.log(`✅ Synced ${count} official equity positions + Cash`);
  console.log(`- Equity Valuation:  ₹${(totalEquityVal / 10000000).toFixed(4)} Cr (₹${Math.round(totalEquityVal).toLocaleString('en-IN')})`);
  console.log(`- Bank Cash:         ₹${(cashVal / 10000000).toFixed(4)} Cr (₹${Math.round(cashVal).toLocaleString('en-IN')})`);
  console.log(`- Total Valuation:   ₹${(totalPortfolioVal / 10000000).toFixed(4)} Cr (₹${Math.round(totalPortfolioVal).toLocaleString('en-IN')})`);
  console.log(`- Total Cost:        ₹${(totalCost / 10000000).toFixed(4)} Cr (₹${Math.round(totalCost).toLocaleString('en-IN')})`);
  console.log(`- Unrealized Gain:   +₹${((totalEquityVal - totalCost) / 10000000).toFixed(4)} Cr (+${(((totalEquityVal - totalCost) / totalCost) * 100).toFixed(2)}%)`);
  console.log('================================================================================');
}

syncExact28AugPositions().catch(console.error);
