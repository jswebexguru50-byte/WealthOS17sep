const { createClient } = require('@libsql/client');

async function seedCC9Baseline() {
  const db = createClient({ url: 'file:./portfolio.db' });
  console.log("=== CREATING & PERSISTING CC9 RECONCILIATION BASELINE ===");

  // 1. Create Baseline Tables
  await db.execute(`
    CREATE TABLE IF NOT EXISTS PmsReconciliationBaseline (
      portfolio TEXT PRIMARY KEY,
      baseline_date TEXT NOT NULL,
      last_reconciled_txn_id INTEGER NOT NULL,
      cash_in_hand REAL NOT NULL,
      initial_cash_deposits REAL NOT NULL,
      in_kind_market_val REAL NOT NULL,
      in_kind_cost_val REAL NOT NULL,
      total_withdrawals REAL DEFAULT 0,
      net_trading_cash REAL NOT NULL,
      gross_dividends REAL NOT NULL,
      tds_paid REAL NOT NULL,
      management_fees_paid REAL NOT NULL,
      operating_expenses REAL NOT NULL,
      reconciled_at TEXT DEFAULT CURRENT_TIMESTAMP,
      notes TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS PmsReconciliationBaselineHoldings (
      portfolio TEXT NOT NULL,
      symbol TEXT NOT NULL,
      isin TEXT NOT NULL,
      name TEXT,
      quantity REAL NOT NULL,
      avg_buy_price REAL NOT NULL,
      total_cost REAL NOT NULL,
      tax_avg_price REAL,
      tax_cost_basis REAL,
      PRIMARY KEY (portfolio, symbol, isin)
    )
  `);

  // 2. Fetch the max transaction ID on or before 2026-08-23
  const maxTxnRes = await db.execute("SELECT MAX(id) as max_id FROM Transactions WHERE portfolio='cc9' AND date <= '2026-08-23'");
  const lastReconciledTxnId = maxTxnRes.rows[0].max_id || 286705;

  // 3. Clear existing baseline for cc9
  await db.execute("DELETE FROM PmsReconciliationBaseline WHERE portfolio='cc9'");
  await db.execute("DELETE FROM PmsReconciliationBaselineHoldings WHERE portfolio='cc9'");

  // 4. Insert Master Summary Baseline (as of 23/08/2026 Statement)
  await db.execute({
    sql: `
      INSERT INTO PmsReconciliationBaseline (
        portfolio, baseline_date, last_reconciled_txn_id, cash_in_hand,
        initial_cash_deposits, in_kind_market_val, in_kind_cost_val, total_withdrawals,
        net_trading_cash, gross_dividends, tds_paid, management_fees_paid, operating_expenses,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      'cc9',
      '2026-08-23',
      lastReconciledTxnId,
      85335.00, // Statement Cash as of 23/08/2026
      14000000.00, // Cash Deposits
      37380237.85, // In-kind Market Value
      36894225.46, // In-kind Cost Basis
      0.00,        // Total Cash Withdrawals Returned to User
      -11887840.40, // Net Trading Cash flow on or before 23/08/2026
      1176618.38,   // Gross Dividends
      92435.75,     // TDS Paid
      2945792.00,   // Management Fees
      165256.43,    // Operating Expenses
      'Audited Statement Checkpoint as on 23-Aug-2026 (48 Equity Positions + Bank Cash ₹85,335.00)'
    ]
  });

  // 5. Statement Securities as on 23/08/2026 (Ground Truth Baseline Holdings)
  const statementHoldings = [
    { symbol: 'AMARA RAJA ENERGY & MOBILITY LIMITED', isin: 'INE885A01032', sym: 'ARE&M', qty: 777, avgPrice: 669.9759, taxAvgPrice: 674.65 },
    { symbol: 'APL APOLLO TUBES LTD', isin: 'INE702C01027', sym: 'APLAPOLLO', qty: 500, avgPrice: 1614.9, taxAvgPrice: 1296.4 },
    { symbol: 'AZAD ENGINEERING LTD', isin: 'INE02IJ01035', sym: 'AZAD', qty: 605, avgPrice: 2188.0406, taxAvgPrice: 2188.0406 },
    { symbol: 'BAJAJ FINANCE LTD', isin: 'INE296A01024', sym: 'BAJFINANCE', qty: 1150, avgPrice: 175.7304, taxAvgPrice: 527.19 },
    { symbol: 'BAJAJ HOUSING FINANCE LTD', isin: 'INE377Y01014', sym: 'BAJAJHFL', qty: 6600, avgPrice: 87.1473, taxAvgPrice: 87.1473 },
    { symbol: 'BANK OF BARODA', isin: 'INE028A01039', sym: 'BANKBARODA', qty: 3000, avgPrice: 214.3, taxAvgPrice: 167.87 },
    { symbol: 'BHARAT ELECTRONICS LTD', isin: 'INE263A01024', sym: 'BEL', qty: 2800, avgPrice: 389.2817, taxAvgPrice: 389.2817 },
    { symbol: 'BHARTI AIRTEL LTD', isin: 'INE397D01024', sym: 'BHARTIARTL', qty: 1500, avgPrice: 963.1542, taxAvgPrice: 963.1542 },
    { symbol: 'BILLIONBRAINS GARAGE VENTURES LTD', isin: 'INE0HOQ01053', sym: 'GROWW', qty: 7000, avgPrice: 165.6318, taxAvgPrice: 165.6318 },
    { symbol: 'BLUE JET HEALTHCARE LTD', isin: 'INE0KBH01020', sym: 'BLUEJET', qty: 2000, avgPrice: 593.8091, taxAvgPrice: 593.8091 },
    { symbol: 'CENTRAL DEPOSITORY SERVICES INDIA LTD', isin: 'INE736A01011', sym: 'CDSL', qty: 1394, avgPrice: 793.0596, taxAvgPrice: 1410.62 },
    { symbol: 'CG POWER AND INDUSTRIAL SOLUTIONS LTD', isin: 'INE067A01029', sym: 'CGPOWER', qty: 1200, avgPrice: 679.4631, taxAvgPrice: 679.4631 },
    { symbol: 'DIVIS LABORATORIES LTD', isin: 'INE361B01024', sym: 'DIVISLAB', qty: 160, avgPrice: 3713.65, taxAvgPrice: 3258.04 },
    { symbol: 'DIXON TECHNOLOGIES INDIA LTD', isin: 'INE935N01020', sym: 'DIXON', qty: 70, avgPrice: 5259.3613, taxAvgPrice: 5259.3613 },
    { symbol: 'EPL LTD', isin: 'INE255A01020', sym: 'EPL', qty: 4000, avgPrice: 211.0293, taxAvgPrice: 211.0293 },
    { symbol: 'ETERNAL LTD', isin: 'INE758T01015', sym: 'ETERNAL', qty: 4700, avgPrice: 233.4775, taxAvgPrice: 233.4775 },
    { symbol: 'FEDERAL BANK LTD', isin: 'INE171A01029', sym: 'FEDERALBNK', qty: 7500, avgPrice: 147.95, taxAvgPrice: 129.0 },
    { symbol: 'FRATELLI VINEYARDS LTD', isin: 'INE00VR01012', sym: 'FRATELLI', qty: 1000, avgPrice: 109.5918, taxAvgPrice: 109.5918 },
    { symbol: 'GANESHA ECOSPHERE LTD', isin: 'INE845D01014', sym: 'GANECOS', qty: 1425, avgPrice: 1087.21, taxAvgPrice: 1087.21 },
    { symbol: 'GOKALDAS EXPORTS LTD', isin: 'INE887G01027', sym: 'GOKEX', qty: 1300, avgPrice: 850.9965, taxAvgPrice: 850.9965 },
    { symbol: 'HDFC BANK LTD', isin: 'INE040A01034', sym: 'HDFCBANK', qty: 2296, avgPrice: 537.2277, taxAvgPrice: 1500.71 },
    { symbol: 'HINDUSTAN AERONAUTICS LTD', isin: 'INE066F01020', sym: 'HAL', qty: 300, avgPrice: 1891.1827, taxAvgPrice: 1113.0 },
    { symbol: 'HIRECT LTD', isin: 'INE447A01017', sym: 'HIRECT', qty: 2400, avgPrice: 1053.0802, taxAvgPrice: 1053.0802 },
    { symbol: 'HOME FIRST FINANCE COMPANY INDIA LTD', isin: 'INE481N01025', sym: 'HOMEFIRST', qty: 1000, avgPrice: 927.006, taxAvgPrice: 927.006 },
    { symbol: 'J G CHEMICALS LTD', isin: 'INE0B0601014', sym: 'JGCHEM', qty: 4500, avgPrice: 389.8799, taxAvgPrice: 389.8799 },
    { symbol: 'KPIT TECHNOLOGIES LTD', isin: 'INE04I401011', sym: 'KPITTECH', qty: 1200, avgPrice: 1241.6672, taxAvgPrice: 1241.6672 },
    { symbol: 'LARSEN and TOUBRO LTD', isin: 'INE018A01030', sym: 'LT', qty: 535, avgPrice: 3048.9479, taxAvgPrice: 3048.9479 },
    { symbol: 'LAURUS LABS LTD', isin: 'INE947Q01028', sym: 'LAURUSLABS', qty: 2100, avgPrice: 374.8505, taxAvgPrice: 374.8505 },
    { symbol: 'MAHINDRA and MAHINDRA LTD', isin: 'INE101A01026', sym: 'M&M', qty: 355, avgPrice: 3438.9847, taxAvgPrice: 3438.9847 },
    { symbol: 'MAZAGON DOCK SHIPBUILDERS LTD', isin: 'INE249Z01012', sym: 'MAZDOCK', qty: 900, avgPrice: 879.0619, taxAvgPrice: 1855.02 },
    { symbol: 'MEESHO LTD', isin: 'INE0VDM01015', sym: 'MEESHO', qty: 950, avgPrice: 191.7761, taxAvgPrice: 191.7761 },
    { symbol: 'NARAYANA HRUDAYALAYA LTD', isin: 'INE410P01024', sym: 'NH', qty: 625, avgPrice: 1064.8728, taxAvgPrice: 1064.8728 },
    { symbol: 'OLECTRA GREENTECH LTD', isin: 'INE260D01016', sym: 'OLECTRA', qty: 700, avgPrice: 1174.7, taxAvgPrice: 1120.89 },
    { symbol: 'ONE 97 COMMUNICATIONS LTD', isin: 'INE982J01020', sym: 'PAYTM', qty: 800, avgPrice: 1072.8986, taxAvgPrice: 1072.8986 },
    { symbol: 'PIDILITE INDUSTRIES LTD', isin: 'INE318A01026', sym: 'PIDILITIND', qty: 900, avgPrice: 971.873, taxAvgPrice: 2406.88 },
    { symbol: 'POLYCAB INDIA LTD', isin: 'INE455K01017', sym: 'POLYCAB', qty: 330, avgPrice: 5185.3302, taxAvgPrice: 5185.3302 },
    { symbol: 'RAJRATAN GLOBAL WIRE LTD', isin: 'INE451D01029', sym: 'RAJRATAN', qty: 2925, avgPrice: 435.3963, taxAvgPrice: 435.3963 },
    { symbol: 'RBL BANK LTD', isin: 'INE976G01028', sym: 'RBLBANK', qty: 2000, avgPrice: 273.9374, taxAvgPrice: 273.9374 },
    { symbol: 'RELIANCE INDUSTRIES LTD', isin: 'INE002A01018', sym: 'RELIANCE', qty: 1340, avgPrice: 1201.743, taxAvgPrice: 1201.743 },
    { symbol: 'SBI FUNDS MANAGEMENT LTD', isin: 'INE045L01017', sym: 'SBIFUN', qty: 1550, avgPrice: 578.0335, taxAvgPrice: 578.0335 },
    { symbol: 'SOLAR INDUSTRIES INDIA LTD', isin: 'INE343H01029', sym: 'SOLARINDS', qty: 307, avgPrice: 7508.141, taxAvgPrice: 7508.141 },
    { symbol: 'STATE BANK OF INDIA', isin: 'INE062A01020', sym: 'SBIN', qty: 850, avgPrice: 665.9906, taxAvgPrice: 665.9906 },
    { symbol: 'TATA CONSUMER PRODUCTS LTD', isin: 'INE192A01025', sym: 'TATACONSUM', qty: 600, avgPrice: 1129.3006, taxAvgPrice: 1129.3006 },
    { symbol: 'TATA MOTORS LTD', isin: 'INE155A01022', sym: 'TATAMOTORS', qty: 1399, avgPrice: 33.318, taxAvgPrice: 507.32 },
    { symbol: 'TATA POWER CO LTD', isin: 'INE245A01021', sym: 'TATAPOWER', qty: 1500, avgPrice: 247.2114, taxAvgPrice: 222.45 },
    { symbol: 'TINNA RUBBER and INFRASTRUCTURE LTD', isin: 'INE434B01034', sym: 'TINNARUBR', qty: 550, avgPrice: 948.8919, taxAvgPrice: 948.8919 },
    { symbol: 'UNO MINDA LTD', isin: 'INE405E01023', sym: 'UNOMINDA', qty: 2425, avgPrice: 654.5995, taxAvgPrice: 612.95 },
    { symbol: 'ZEN TECHNOLOGIES LTD', isin: 'INE251B01027', sym: 'ZENTEC', qty: 725, avgPrice: 1081.7762, taxAvgPrice: 1081.7762 }
  ];

  for (const h of statementHoldings) {
    const totalCost = h.qty * h.avgPrice;
    const taxCostBasis = h.qty * (h.taxAvgPrice || h.avgPrice);
    await db.execute({
      sql: `
        INSERT INTO PmsReconciliationBaselineHoldings (
          portfolio, symbol, isin, name, quantity, avg_buy_price, total_cost, tax_avg_price, tax_cost_basis
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: ['cc9', h.sym, h.isin, h.symbol, h.qty, h.avgPrice, totalCost, h.taxAvgPrice, taxCostBasis]
    });
  }

  console.log(`✅ Seeded CC9 Baseline Checkpoint with ${statementHoldings.length} holdings and cash balance ₹85,335.00.`);
  process.exit(0);
}

seedCC9Baseline().catch(console.error);
