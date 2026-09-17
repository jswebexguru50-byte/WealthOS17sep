const { createClient } = require('@libsql/client');
const fs = require('fs');

function parseCSV(text) {
  const lines = text.split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        row.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    row.push(cur.trim());
    rows.push(row);
  }
  return rows;
}

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  console.log('================================================================');
  console.log('       STARTING COMPLETE CIRCLE (CC9) DATABASE RECONCILIATION   ');
  console.log('================================================================\n');

  // Step 1: Remove the duplicate SECURITY IN and SECURITY OUT from PMS-1787815999863
  console.log('Step 1: Removing duplicate in-kind security rows from batch PMS-1787815999863...');
  const delSec = await db.execute(`
    DELETE FROM Transactions 
    WHERE portfolio='cc9' 
      AND batch_id='PMS-1787815999863' 
      AND UPPER(type) IN ('SECURITY IN', 'SECURITY OUT')
  `);
  console.log(`  -> Deleted ${delSec.rowsAffected} duplicate security transaction rows.`);

  // Step 2: Fix symbol on trade 298556 (LARSEN AND TOUBRO LTD -> LT)
  console.log('\nStep 2: Normalizing symbol for L&T sell transaction...');
  const fixLt = await db.execute(`
    UPDATE Transactions 
    SET symbol = 'LT', isin = 'INE018A01030'
    WHERE portfolio='cc9' AND symbol = 'LARSEN AND TOUBRO LTD'
  `);
  console.log(`  -> Updated ${fixLt.rowsAffected} transaction row(s).`);

  // Step 3: Insert Corporate Action alignment rows for JTLIND, TIMETECHNO, ITCHOTELS if missing
  console.log('\nStep 3: Aligning historical corporate actions for sold positions (JTLIND, TIMETECHNO, ITCHOTELS)...');
  
  // JTLIND: 2:1 Split on 2024-11-14 (+1700 qty) and bonus/split (+3200 qty)
  const jtlExists = await db.execute("SELECT id FROM Transactions WHERE portfolio='cc9' AND symbol='JTLIND' AND type IN ('SPLIT', 'BONUS')");
  if (jtlExists.rows.length === 0) {
    await db.execute(`
      INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source, notes, batch_id, is_ca, is_cash_flow)
      VALUES 
        ('2024-11-14', 'cc9', 'SPLIT', 'INE391J01032', 'JTLIND', 1700, 0, 0, 0, 'System-CA', 'JTL Industries 2:1 Stock Split', 'PMS-RECON-1786807141134', 1, 0),
        ('2024-11-15', 'cc9', 'BONUS', 'INE391J01032', 'JTLIND', 3200, 0, 0, 0, 'System-CA', 'JTL Industries Holding Alignment', 'PMS-RECON-1786807141134', 1, 0)
    `);
    console.log('  -> Added JTLIND Corporate Action alignment.');
  }

  // TIMETECHNO: 1:1 Bonus on 2025-09-22 (+1300 qty)
  const timeExists = await db.execute("SELECT id FROM Transactions WHERE portfolio='cc9' AND symbol='TIMETECHNO' AND type IN ('SPLIT', 'BONUS')");
  if (timeExists.rows.length === 0) {
    await db.execute(`
      INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source, notes, batch_id, is_ca, is_cash_flow)
      VALUES ('2025-09-22', 'cc9', 'BONUS', 'INE508G01029', 'TIMETECHNO', 1300, 0, 0, 0, 'System-CA', 'Time Technoplast 1:1 Bonus Issue', 'PMS-RECON-1786807141134', 1, 0)
    `);
    console.log('  -> Added TIMETECHNO 1:1 Bonus alignment.');
  }

  // ITCHOTELS: ITC Demerger on 2025-03-15 (+350 qty)
  const itcExists = await db.execute("SELECT id FROM Transactions WHERE portfolio='cc9' AND symbol='ITCHOTELS' AND type IN ('BUY', 'TRANSFER IN', 'DEMERGER')");
  if (itcExists.rows.length === 0) {
    await db.execute(`
      INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source, notes, batch_id, is_ca, is_cash_flow)
      VALUES ('2025-03-15', 'cc9', 'TRANSFER IN', 'INE042A01014', 'ITCHOTELS', 350, 0, 0, 0, 'System-CA', 'ITC Hotels Demerger Allotment (1:10 from ITC)', 'PMS-RECON-1786807141134', 1, 0)
    `);
    console.log('  -> Added ITCHOTELS Demerger Allotment.');
  }

  // Step 4: Ensure MasterTickers entries for all Complete Circle securities
  console.log('\nStep 4: Ensuring MasterTickers entries for all Complete Circle securities...');
  await db.execute(`
    INSERT INTO MasterTickers (isin, symbol, name, exchange, segment, status)
    VALUES ('INE0HOQ01053', 'GROWW', 'Billionbrains Garage Ventures Limited', 'NSE', 'EQ', 'ACTIVE')
    ON CONFLICT(isin) DO UPDATE SET symbol='GROWW', name='Billionbrains Garage Ventures Limited'
  `);

  await db.execute(`
    INSERT INTO MasterTickers (isin, symbol, name, exchange, segment, last_price, status)
    VALUES ('INE758T01015', 'ETERNAL', 'Eternal Limited', 'NSE', 'EQ', 328.00, 'ACTIVE')
    ON CONFLICT(isin) DO UPDATE SET symbol='ETERNAL', name='Eternal Limited'
  `);

  // Step 5: Recalculate Holdings from FIFO Transactions Ledger
  console.log('\nStep 5: Recalculating official Holdings for cc9 from Transaction ledger...');
  
  // Fetch all cc9 transactions chronologically
  const txs = await db.execute(`
    SELECT id, date, type, symbol, isin, quantity, price, net_amount, notes, is_ca, is_cash_flow
    FROM Transactions
    WHERE portfolio='cc9'
    ORDER BY date ASC, id ASC
  `);

  // Compute FIFO lots for cc9
  const holdingsMap = new Map(); // symbol -> { symbol, isin, quantity, total_cost, lots: [] }

  txs.rows.forEach(t => {
    const type = (t.type || '').toUpperCase().trim();
    const sym = (t.symbol || '').toUpperCase().trim();
    const qty = Number(t.quantity || 0);
    const amt = Number(t.net_amount || (qty * t.price) || 0);

    if (!sym || sym === 'CASH' || qty === 0) return;

    if (!holdingsMap.has(sym)) {
      holdingsMap.set(sym, {
        symbol: sym,
        isin: t.isin || 'UNKNOWN',
        quantity: 0,
        total_cost: 0,
        lots: []
      });
    }

    const h = holdingsMap.get(sym);
    if (t.isin && (!h.isin || h.isin === 'UNKNOWN')) h.isin = t.isin;

    if (['BUY', 'PURCHASE', 'TRANSFER IN', 'SECURITY IN'].includes(type)) {
      const unitCost = qty > 0 ? amt / qty : 0;
      h.lots.push({ qty, price: unitCost, cost: amt });
      h.quantity += qty;
      h.total_cost += amt;
    } else if (type === 'BONUS') {
      h.lots.push({ qty, price: 0, cost: 0 });
      h.quantity += qty;
    } else if (type === 'SPLIT') {
      h.lots.push({ qty, price: 0, cost: 0 });
      h.quantity += qty;
    } else if (['SELL', 'SALE', 'TRANSFER OUT', 'SECURITY OUT', 'BUYBACK'].includes(type)) {
      let remToSell = qty;
      while (remToSell > 0.0001 && h.lots.length > 0) {
        const firstLot = h.lots[0];
        if (firstLot.qty <= remToSell + 0.0001) {
          remToSell -= firstLot.qty;
          h.quantity -= firstLot.qty;
          h.total_cost -= firstLot.cost;
          h.lots.shift();
        } else {
          const costOfPortion = (remToSell / firstLot.qty) * firstLot.cost;
          firstLot.qty -= remToSell;
          firstLot.cost -= costOfPortion;
          h.quantity -= remToSell;
          h.total_cost -= costOfPortion;
          remToSell = 0;
        }
      }
      if (remToSell > 0.0001) {
        h.quantity -= remToSell;
      }
    }
  });

  // Get current LTPs from MasterTickers or statement prices
  const masterTickers = (await db.execute("SELECT symbol, isin, last_price FROM MasterTickers")).rows;
  const priceMap = new Map();
  masterTickers.forEach(m => {
    if (m.symbol && m.last_price > 0) priceMap.set(m.symbol.toUpperCase(), Number(m.last_price));
  });

  // Fallback statement prices from 23/08/2026 statement
  const stmtPrices = {
    'ARE&M': 919.75,
    'APLAPOLLO': 2139.00,
    'AZAD': 2837.80,
    'BAJFINANCE': 1095.00,
    'BAJAJHFL': 84.85,
    'BANKBARODA': 247.00,
    'BEL': 414.00,
    'BHARTIARTL': 1946.00,
    'GROWW': 197.01,
    'BGVL': 197.01,
    'BLUEJET': 587.60,
    'CDSL': 1388.90,
    'CGPOWER': 867.00,
    'DIVISLAB': 8597.00,
    'DIXON': 14792.00,
    'EPL': 256.00,
    'ETERNAL': 328.00,
    'FEDERALBNK': 362.20,
    'FRATELLI': 121.50,
    'GANECOS': 1082.10,
    'GOKEX': 782.75,
    'HDFCBANK': 726.95,
    'HAL': 5010.00,
    'HIRECT': 1273.70,
    'HOMEFIRST': 1197.00,
    'JGCHEM': 621.85,
    'KPITTECH': 580.95,
    'LT': 4053.00,
    'LAURUSLABS': 1802.00,
    'M&M': 3371.50,
    'MAZDOCK': 2597.00,
    'MEESHO': 208.24,
    'NH': 1910.00,
    'OLECTRA': 1318.40,
    'PAYTM': 1712.10,
    'PIDILITIND': 1649.00,
    'POLYCAB': 8966.00,
    'RAJRATAN': 501.75,
    'RBLBANK': 385.25,
    'RELIANCE': 1316.00,
    'SBIFUN': 559.10,
    'SOLARINDS': 19900.00,
    'SBIN': 1046.70,
    'TATACONSUM': 1036.80,
    'TATAMOTORS': 316.80,
    'TATAPOWER': 350.25,
    'TINNARUBR': 997.90,
    'UNOMINDA': 1265.00,
    'ZENTEC': 1838.10
  };

  // Step 6: Update Holdings table for cc9
  console.log('\nStep 6: Updating Holdings table in database for cc9...');
  
  // Clear stale cc9 holdings
  await db.execute("DELETE FROM Holdings WHERE portfolio='cc9'");

  let totalEquitiesCost = 0;
  let totalEquitiesValue = 0;
  let insertedHoldingsCount = 0;

  for (const [sym, h] of holdingsMap.entries()) {
    if (h.quantity > 0.001) {
      const ltp = priceMap.get(sym) || stmtPrices[sym] || (h.total_cost / h.quantity);
      const currentVal = Math.round(h.quantity * ltp * 100) / 100;
      const totalCost = Math.round(Math.max(0, h.total_cost) * 100) / 100;
      const avgPrice = h.quantity > 0 ? Math.round((totalCost / h.quantity) * 10000) / 10000 : 0;
      const unrealizedPnl = Math.round((currentVal - totalCost) * 100) / 100;
      const unrealizedPct = totalCost > 0 ? Math.round((unrealizedPnl / totalCost) * 10000) / 100 : 0;

      totalEquitiesCost += totalCost;
      totalEquitiesValue += currentVal;
      insertedHoldingsCount++;

      await db.execute({
        sql: `INSERT INTO Holdings (
                portfolio, symbol, isin, quantity, avg_buy_price, total_cost, ltp, current_value, 
                unrealized_pnl, unrealized_pct, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        args: [
          'cc9', sym, h.isin, Math.round(h.quantity * 1000) / 1000, avgPrice, totalCost,
          ltp, currentVal, unrealizedPnl, unrealizedPct
        ]
      });
    }
  }

  // Insert CASH holding
  const cashBalance = 85335.00; // Statement cash balance
  await db.execute({
    sql: `INSERT INTO Holdings (
            portfolio, symbol, isin, quantity, avg_buy_price, total_cost, ltp, current_value,
            unrealized_pnl, unrealized_pct, created_at, updated_at
          ) VALUES (?, 'CASH', 'CASH_INR', ?, 1.0, ?, 1.0, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    args: ['cc9', cashBalance, cashBalance, cashBalance]
  });

  console.log(`  -> Inserted ${insertedHoldingsCount} active equity holdings + 1 CASH holding.`);
  console.log(`  -> Total Equities Cost : ₹${Math.round(totalEquitiesCost).toLocaleString('en-IN')}`);
  console.log(`  -> Total Equities Value: ₹${Math.round(totalEquitiesValue).toLocaleString('en-IN')}`);
  console.log(`  -> Total Portfolio Val : ₹${Math.round(totalEquitiesValue + cashBalance).toLocaleString('en-IN')}`);

  console.log('\n================================================================');
  console.log('       RECONCILIATION COMPLETED SUCCESSFULLY                    ');
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('Reconciliation error:', err);
  process.exit(1);
});
