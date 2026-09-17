const fs = require('fs');
const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

function normalizeName(name) {
  if (!name) return '';
  return name.toUpperCase()
    .replace(/LIMITED/g, 'LTD')
    .replace(/AND/g, '&')
    .replace(/[^A-Z0-9]/g, '');
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

async function reconcileCC9() {
  console.log("================================================================================");
  console.log("             COMPLETE CIRCLE (CC9) PORTFOLIO RECONCILIATION REPORT              ");
  console.log("                    Statement Report Date: 23/08/2026                           ");
  console.log("================================================================================\n");

  const rawCsv = fs.readFileSync('cc9_portfolio_statement_20260823.csv', 'utf8');
  const lines = rawCsv.split('\n').map(l => l.trim()).filter(Boolean);

  const stmtHoldings = [];
  let headerSeen = false;
  let cashVal = 0;

  for (const line of lines) {
    if (line.includes('Security,Price as on') || line.includes('Shares - Total')) {
      if (line.includes('Security,Price as on')) headerSeen = true;
      continue;
    }
    if (line.startsWith('Cash,,,,') || line.includes('"85,335"')) {
      cashVal = 85335;
    }
    if (!headerSeen) continue;
    if (line.startsWith('Equity') || line.startsWith('Shares') || line.startsWith('Cash') || line.startsWith('Other') || line.startsWith('Total') || line.startsWith('Tax Deducted')) continue;

    const parts = parseCSVLine(line);
    if (parts.length >= 10 && parts[0] && parts[3]) {
      const name = parts[0].replace(/"/g, '').trim();
      if (!name || name.includes('Total') || name === 'Security') continue;
      const qtyStr = parts[3].replace(/[",]/g, '').trim();
      const qty = parseFloat(qtyStr);
      if (isNaN(qty)) continue;
      const unitCost = parseFloat(parts[4].replace(/[",]/g, '')) || 0;
      const totalCost = parseFloat(parts[5].replace(/[",]/g, '')) || 0;
      const mktPrice = parseFloat(parts[6].replace(/[",]/g, '')) || 0;
      const mktVal = parseFloat(parts[7].replace(/[",]/g, '')) || 0;
      const income = parseFloat(parts[8].replace(/[",]/g, '')) || 0;
      const totalGL = parseFloat(parts[9].replace(/[",]/g, '')) || 0;

      stmtHoldings.push({
        name,
        normName: normalizeName(name),
        qty,
        unitCost,
        totalCost,
        mktPrice,
        mktVal,
        income,
        totalGL
      });
    }
  }

  console.log(`Parsed ${stmtHoldings.length} securities from Complete Circle statement.\n`);

  // Fetch DB Holdings for cc9
  const dbHoldings = (await db.execute("SELECT symbol, isin, quantity, avg_buy_price, total_cost, ltp, current_value, unrealized_pnl FROM Holdings WHERE portfolio='cc9'")).rows;
  
  // Also fetch MasterTickers to map symbols/ISINs/company names
  const masterTickers = (await db.execute("SELECT symbol, isin, company_name FROM MasterTickers")).rows;
  const masterByNormName = new Map();
  const masterBySym = new Map();
  masterTickers.forEach(m => {
    if (m.company_name) masterByNormName.set(normalizeName(m.company_name), m);
    if (m.symbol) masterBySym.set(m.symbol.toUpperCase(), m);
  });

  // Also build Scrip Mappings
  const scripMappings = (await db.execute("SELECT scrip_name, mapped_symbol FROM ScripMappings WHERE portfolio='cc9' OR portfolio IS NULL OR portfolio='ALL'")).rows;
  const mappingByName = new Map();
  scripMappings.forEach(sm => mappingByName.set(normalizeName(sm.scrip_name), sm.mapped_symbol));

  const dbMapBySymbol = new Map();
  const dbMapByISIN = new Map();
  const dbMapByNormName = new Map();

  dbHoldings.forEach(dh => {
    dbMapBySymbol.set(dh.symbol.toUpperCase(), dh);
    if (dh.isin && dh.isin !== 'UNKNOWN') dbMapByISIN.set(dh.isin, dh);
    dbMapByNormName.set(normalizeName(dh.symbol), dh);
  });

  // Also match via MasterTickers company names
  masterTickers.forEach(mt => {
    const dh = dbMapBySymbol.get(mt.symbol.toUpperCase());
    if (dh && mt.company_name) {
      dbMapByNormName.set(normalizeName(mt.company_name), dh);
    }
  });

  // Manual known aliases for Complete Circle scrips
  const manualAliases = {
    [normalizeName("AMARA RAJA ENERGY & MOBILITY LIMITED")]: "ARE&M",
    [normalizeName("APL APOLLO TUBES LTD")]: "APLAPOLLO",
    [normalizeName("AZAD ENGINEERING LTD")]: "AZAD",
    [normalizeName("BAJAJ FINANCE LTD")]: "BAJFINANCE",
    [normalizeName("BAJAJ HOUSING FINANCE LTD")]: "BAJAJHFL",
    [normalizeName("BANK OF BARODA")]: "BANKBARODA",
    [normalizeName("BHARAT ELECTRONICS LTD")]: "BEL",
    [normalizeName("BHARTI AIRTEL LTD")]: "BHARTIARTL",
    [normalizeName("BILLIONBRAINS GARAGE VENTURES LTD")]: "BGVL",
    [normalizeName("BLUE JET HEALTHCARE LTD")]: "BLUEJET",
    [normalizeName("CENTRAL DEPOSITORY SERVICES INDIA LTD")]: "CDSL",
    [normalizeName("CG POWER AND INDUSTRIAL SOLUTIONS LTD")]: "CGPOWER",
    [normalizeName("DIVIS LABORATORIES LTD")]: "DIVISLAB",
    [normalizeName("DIXON TECHNOLOGIES INDIA LTD")]: "DIXON",
    [normalizeName("EPL LTD")]: "EPL",
    [normalizeName("ETERNAL LTD")]: "ETERNAL",
    [normalizeName("FEDERAL BANK LTD")]: "FEDERALBNK",
    [normalizeName("FRATELLI VINEYARDS LTD")]: "FRATELLI",
    [normalizeName("GANESHA ECOSPHERE LTD")]: "GANECOS",
    [normalizeName("GOKALDAS EXPORTS LTD")]: "GOKEX",
    [normalizeName("HDFC BANK LTD")]: "HDFCBANK",
    [normalizeName("HINDUSTAN AERONAUTICS LTD")]: "HAL",
    [normalizeName("HIRECT LTD")]: "HIRECT",
    [normalizeName("HOME FIRST FINANCE COMPANY INDIA LTD")]: "HOMEFIRST",
    [normalizeName("J G CHEMICALS LTD")]: "JGCHEM",
    [normalizeName("KPIT TECHNOLOGIES LTD")]: "KPITTECH",
    [normalizeName("LARSEN and TOUBRO LTD")]: "LT",
    [normalizeName("LAURUS LABS LTD")]: "LAURUSLABS",
    [normalizeName("MAHINDRA and MAHINDRA LTD")]: "M&M",
    [normalizeName("MAZAGON DOCK SHIPBUILDERS LTD")]: "MAZDOCK",
    [normalizeName("MEESHO LTD")]: "MEESHO",
    [normalizeName("NARAYANA HRUDAYALAYA LTD")]: "NH",
    [normalizeName("OLECTRA GREENTECH LTD")]: "OLECTRA",
    [normalizeName("ONE 97 COMMUNICATIONS LTD")]: "PAYTM",
    [normalizeName("PIDILITE INDUSTRIES LTD")]: "PIDILITIND",
    [normalizeName("POLYCAB INDIA LTD")]: "POLYCAB",
    [normalizeName("RAJRATAN GLOBAL WIRE LTD")]: "RAJRATAN",
    [normalizeName("RBL BANK LTD")]: "RBLBANK",
    [normalizeName("RELIANCE INDUSTRIES LTD")]: "RELIANCE",
    [normalizeName("SBI FUNDS MANAGEMENT LTD")]: "SBIFML",
    [normalizeName("SOLAR INDUSTRIES INDIA LTD")]: "SOLARINDS",
    [normalizeName("STATE BANK OF INDIA")]: "SBIN",
    [normalizeName("TATA CONSUMER PRODUCTS LTD")]: "TATACONSUM",
    [normalizeName("TATA MOTORS LTD")]: "TATAMOTORS",
    [normalizeName("TATA POWER CO LTD")]: "TATAPOWER",
    [normalizeName("TINNA RUBBER and INFRASTRUCTURE LTD")]: "TINNA",
    [normalizeName("UNO MINDA LTD")]: "UNOMINDA",
    [normalizeName("VEDANTA ALUMINIUM METAL LTD")]: "VEDALUM",
    [normalizeName("ZEN TECHNOLOGIES LTD")]: "ZENTEC"
  };

  console.log("--------------------------------------------------------------------------------");
  console.log("                        HOLDINGS QUANTITY & VALUE AUDIT                         ");
  console.log("--------------------------------------------------------------------------------");
  console.log("Security Name / Symbol                | Stmt Qty | DB Qty | Qty Diff | Stmt Value   | DB Value     | Status");
  console.log("--------------------------------------------------------------------------------------------------------------");

  let totalStmtVal = 0;
  let totalDbVal = 0;
  let totalStmtCost = 0;
  let totalDbCost = 0;
  let matchedCount = 0;
  let discrepancyCount = 0;
  const matchedDbSymbols = new Set();

  stmtHoldings.forEach(sh => {
    let sym = mappingByName.get(sh.normName) || manualAliases[sh.normName];
    let dbH = null;
    if (sym) {
      dbH = dbMapBySymbol.get(sym.toUpperCase()) || dbMapByNormName.get(normalizeName(sym));
    }
    if (!dbH) {
      dbH = dbMapByNormName.get(sh.normName);
    }
    if (!dbH) {
      // try fuzzy symbol search
      for (const [k, v] of dbMapBySymbol.entries()) {
        if (sh.normName.includes(k) || k.includes(sh.normName)) {
          dbH = v;
          break;
        }
      }
    }

    const dbQty = dbH ? dbH.quantity : 0;
    const dbVal = dbH ? dbH.current_value : 0;
    const dbCost = dbH ? dbH.total_cost : 0;
    if (dbH) matchedDbSymbols.add(dbH.symbol);

    const qtyDiff = dbQty - sh.qty;
    const isMatch = Math.abs(qtyDiff) < 0.001;
    if (isMatch) matchedCount++; else discrepancyCount++;

    totalStmtVal += sh.mktVal;
    totalDbVal += dbVal;
    totalStmtCost += sh.totalCost;
    totalDbCost += dbCost;

    const statusStr = isMatch ? "MATCH ✅" : (qtyDiff > 0 ? `DB +${qtyDiff} ⚠️` : `DB ${qtyDiff} ❌`);
    const displayName = (sh.name.length > 35 ? sh.name.substring(0, 32) + '...' : sh.name).padEnd(37);
    const dbSymStr = dbH ? `(${dbH.symbol})` : '(?)';

    console.log(
      `${displayName} | ${String(sh.qty).padStart(8)} | ${String(dbQty).padStart(6)} | ${String(qtyDiff).padStart(8)} | ₹${sh.mktVal.toLocaleString('en-IN').padStart(11)} | ₹${Math.round(dbVal).toLocaleString('en-IN').padStart(11)} | ${statusStr} ${dbSymStr}`
    );
  });

  console.log("--------------------------------------------------------------------------------------------------------------");

  // Check DB holdings that were NOT in the statement
  console.log("\n[HOLDINGS IN DB NOT FOUND IN STATEMENT]");
  let dbOnlyCount = 0;
  dbHoldings.forEach(dh => {
    if (!matchedDbSymbols.has(dh.symbol) && dh.quantity > 0) {
      dbOnlyCount++;
      console.log(`- ${dh.symbol.padEnd(16)} (ISIN: ${String(dh.isin).padEnd(12)}): DB Qty = ${dh.quantity} | DB Cost = ₹${dh.total_cost.toLocaleString('en-IN')} | DB Val = ₹${dh.current_value.toLocaleString('en-IN')}`);
    }
  });
  if (dbOnlyCount === 0) console.log("None! All DB holdings match the statement holdings list. ✅");

  // Total summary comparison
  console.log("\n================================================================================");
  console.log("                            TOTAL VALUATION SUMMARY                             ");
  console.log("================================================================================");
  console.log(`Statement Equity Value : ₹${totalStmtVal.toLocaleString('en-IN')} (₹73,294,562 in header)`);
  console.log(`DB Portfolio Value     : ₹${Math.round(totalDbVal).toLocaleString('en-IN')}`);
  console.log(`Statement Cash Balance : ₹${cashVal.toLocaleString('en-IN')}`);
  
  // Calculate DB cash in hand from PMS transactions
  const dbTxns = (await db.execute("SELECT type, is_cash_flow, is_ca, net_amount FROM Transactions WHERE portfolio='cc9'")).rows;
  let dbDeposits = 0;
  let dbSecuritiesIn = 0;
  let dbIncome = 0;
  let dbSellProceeds = 0;
  let dbWithdrawals = 0;
  let dbSecuritiesOut = 0;
  let dbMgmtFees = 0;
  let dbTds = 0;
  let dbOtherExp = 0;
  let dbBuyCosts = 0;

  dbTxns.forEach(t => {
    const type = (t.type || '').toUpperCase();
    const amt = Math.abs(t.net_amount || 0);
    if (type === 'DEPOSIT') dbDeposits += amt;
    else if (['TRANSFER IN', 'SECURITY IN'].includes(type) && (!t.is_ca) && t.is_cash_flow === 1) dbSecuritiesIn += amt;
    else if (['DIVIDEND', 'CASH_INCOME', 'INTEREST'].includes(type)) dbIncome += amt;
    else if (['SELL', 'SALE', 'BUYBACK'].includes(type)) dbSellProceeds += amt;
    else if (type === 'WITHDRAWAL') dbWithdrawals += amt;
    else if (['TRANSFER OUT', 'SECURITY OUT', 'MERGER_OUT'].includes(type) && (!t.is_ca) && t.is_cash_flow === 1) dbSecuritiesOut += amt;
    else if (['MANAGEMENT_FEE', 'MANAGEMENT'].includes(type)) dbMgmtFees += amt;
    else if (type === 'TDS') dbTds += amt;
    else if (['EXPENSE', 'STT_EXPENSE', 'CHARGES', 'BROKERAGE', 'ENTRY_LOAD', 'CUSTODY_CHARGES', 'AUDIT_CHARGES', 'DP_CHARGES'].includes(type)) dbOtherExp += amt;
    else if (['BUY', 'PURCHASE'].includes(type)) dbBuyCosts += amt;
  });

  const dbCashInHand = (dbDeposits + dbIncome + dbSellProceeds) - (dbWithdrawals + dbMgmtFees + dbTds + dbOtherExp + dbBuyCosts);

  console.log(`DB Cash In Hand Ledger : ₹${Math.round(dbCashInHand).toLocaleString('en-IN')} (Statement Cash: ₹${cashVal.toLocaleString('en-IN')} | Diff: ₹${Math.round(dbCashInHand - cashVal).toLocaleString('en-IN')})`);
  console.log(`Total Stmt Portfolio   : ₹${(totalStmtVal + cashVal).toLocaleString('en-IN')} (₹73,379,897 in header)`);
  console.log(`Total DB Portfolio     : ₹${Math.round(totalDbVal + dbCashInHand).toLocaleString('en-IN')}`);
  console.log(`\nMatched Stocks: ${matchedCount} / ${stmtHoldings.length} (${discrepancyCount} discrepancies)`);
}

reconcileCC9().catch(console.error);
