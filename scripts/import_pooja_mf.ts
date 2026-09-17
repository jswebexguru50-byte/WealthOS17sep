import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { runFIFO } from '../src/server/fifoEngine.js';

const db = new sqlite3.Database('portfolio.db');

function dbRun(query: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAll(query: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbGet(query: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

const floatOrZero = (v: any) => {
  if (v === null || v === undefined) return 0.0;
  const num = parseFloat(String(v).replace(/,/g, '').trim());
  return isNaN(num) ? 0.0 : num;
};

async function importPoojaMF() {
  console.log('========================================================================');
  console.log('IMPORTING POOJA MF PORTFOLIO UNDER BROTHER (PANKAJ SHARMA, MEMBER ID: 2)');
  console.log('========================================================================');

  const jsonPath = path.join(process.cwd(), 'scratch', 'pooja_mf_parsed.json');
  const portfolioName = 'POOJA MF';
  const memberId = 2;

  // 1. Read JSON
  console.log(`\n[1/6] Reading parsed JSON: ${jsonPath}...`);
  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const schemesRows: any[] = rawData.schemes;
  const txRows: any[] = rawData.transactions;

  console.log(`  Found ${schemesRows.length} schemes and ${txRows.length} transaction rows.`);

  // 2. Ensure Portfolio exists under Member ID 2
  console.log(`\n[2/6] Registering portfolio '${portfolioName}' under member_id = ${memberId}...`);
  const portRow = await dbGet('SELECT * FROM Portfolios WHERE name = ?', [portfolioName]);
  if (!portRow) {
    await dbRun(`
      INSERT INTO Portfolios (name, type, base_currency, status, member_id, family_group, benchmark_symbol)
      VALUES (?, 'MUTUAL_FUND', 'INR', 'ACTIVE', ?, 'Brother Accounts', '^NSEI')
    `, [portfolioName, memberId]);
  } else {
    await dbRun(`
      UPDATE Portfolios 
      SET member_id = ?, type = 'MUTUAL_FUND', status = 'ACTIVE', family_group = 'Brother Accounts'
      WHERE name = ?
    `, [memberId, portfolioName]);
  }

  // 3. Clear existing transactions & CamsSummaryHoldings for POOJA MF
  console.log(`\n[3/6] Clearing existing data for '${portfolioName}'...`);
  await dbRun('DELETE FROM Transactions WHERE portfolio = ?', [portfolioName]);
  await dbRun('DELETE FROM CamsSummaryHoldings WHERE portfolio = ?', [portfolioName]);
  await dbRun('DELETE FROM Holdings WHERE portfolio = ?', [portfolioName]);

  // 4. Populate MasterTickers and HistoricalPrices
  console.log(`\n[4/6] Populating MasterTickers & HistoricalPrices...`);
  for (const s of schemesRows) {
    const isin = String(s.isin || '').trim().toUpperCase();
    const schemeName = String(s.scheme_name || '').trim();
    const nav = floatOrZero(s.nav);
    const folio = String(s.folio_number || '').trim();
    const units = floatOrZero(s.units);
    const cost = floatOrZero(s.cost);
    const value = floatOrZero(s.value);

    // Insert into MasterTickers
    await dbRun(`
      INSERT INTO MasterTickers (isin, symbol, name, exchange, sector, last_price, previous_close, currency, updated_at)
      VALUES (?, ?, ?, 'MUTUAL_FUND', 'Mutual Funds', ?, ?, 'INR', datetime('now'))
      ON CONFLICT(isin) DO UPDATE SET
        last_price = excluded.last_price,
        previous_close = excluded.previous_close,
        symbol = excluded.symbol,
        name = excluded.name,
        updated_at = datetime('now')
    `, [isin, schemeName, schemeName, nav, nav]);

    // Insert into HistoricalPrices
    await dbRun(`
      INSERT OR REPLACE INTO HistoricalPrices (symbol, date, close_price, data_source)
      VALUES (?, '2026-09-01', ?, 'CAMS Official CAS')
    `, [schemeName, nav]);
    await dbRun(`
      INSERT OR REPLACE INTO HistoricalPrices (symbol, date, close_price, data_source)
      VALUES (?, date('now'), ?, 'CAMS Official CAS')
    `, [schemeName, nav]);

    // Insert into CamsSummaryHoldings
    await dbRun(`
      INSERT INTO CamsSummaryHoldings (
        portfolio, isin, folio, symbol, quantity, nav, value, cost, member_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [portfolioName, isin, folio, schemeName, units, nav, value, cost, memberId]);
  }

  // 5. Ingest Transactions
  console.log(`\n[5/6] Ingesting transactions into Transactions table...`);
  const batchId = `BATCH-CAMS-POOJAMF-${Date.now()}`;
  let insertedCount = 0;

  for (let i = 0; i < txRows.length; i++) {
    const t = txRows[i];
    const tType = String(t.type || '').toUpperCase().trim();
    const tDate = String(t.date || '').slice(0, 10);
    const tUnits = floatOrZero(t.units);
    const tAmt = floatOrZero(t.amount);
    const tNav = floatOrZero(t.nav);
    const tDesc = String(t.description || '').trim();
    const folio = String(t.folio_number || '').trim();
    const isin = String(t.isin || '').trim().toUpperCase();
    const schemeName = String(t.scheme_name || '').trim();

    if (tType === 'PURCHASE' || tType === 'PURCHASE_SIP') {
      let stampDuty = 0.0;
      if (i + 1 < txRows.length) {
        const nextT = txRows[i + 1];
        if (String(nextT.type || '').toUpperCase() === 'STAMP_DUTY_TAX' && String(nextT.date || '').slice(0, 10) === tDate && String(nextT.isin || '').trim().toUpperCase() === isin) {
          stampDuty = floatOrZero(nextT.amount);
        }
      }

      const qty = Math.abs(tUnits);
      const price = tNav > 0 ? tNav : (qty > 0 ? tAmt / qty : 10.0);
      const grossAmount = qty * price;
      const netAmount = (tAmt + stampDuty > 0) ? (tAmt + stampDuty) : grossAmount;

      await dbRun(`
        INSERT INTO Transactions (
          date, portfolio, type, isin, symbol, quantity, price,
          gross_amount, brokerage, stt, stamp_duty, gst, exchange_charges, sebi_charges, total_taxes,
          net_amount, source, notes, batch_id, is_cash_flow, folio, is_ca, member_id
        ) VALUES (
          ?, ?, 'BUY', ?, ?, ?, ?,
          ?, 0, 0, ?, 0, 0, 0, ?,
          ?, 'CAMS Import', ?, ?, 1, ?, 0, ?
        )
      `, [
        tDate, portfolioName, isin, schemeName, qty, price,
        grossAmount, stampDuty, stampDuty,
        netAmount, `Folio: ${folio}; ${tDesc}`, batchId, folio, memberId
      ]);
      insertedCount++;

    } else if (tType === 'REDEMPTION' || tType === 'SELL' || tType === 'SWITCH_OUT') {
      const qty = Math.abs(tUnits);
      const price = tNav > 0 ? tNav : (qty > 0 ? tAmt / qty : 0.0);
      const grossAmount = qty * price;
      const netAmount = tAmt > 0 ? tAmt : grossAmount;

      await dbRun(`
        INSERT INTO Transactions (
          date, portfolio, type, isin, symbol, quantity, price,
          gross_amount, brokerage, stt, stamp_duty, gst, exchange_charges, sebi_charges, total_taxes,
          net_amount, source, notes, batch_id, is_cash_flow, folio, is_ca, member_id
        ) VALUES (
          ?, ?, 'SELL', ?, ?, ?, ?,
          ?, 0, 0, 0, 0, 0, 0, 0,
          ?, 'CAMS Import', ?, ?, 1, ?, 0, ?
        )
      `, [
        tDate, portfolioName, isin, schemeName, qty, price,
        grossAmount, netAmount, `Folio: ${folio}; ${tDesc}`, batchId, folio, memberId
      ]);
      insertedCount++;
    }
  }
  console.log(`  Successfully inserted ${insertedCount} transactions.`);

  // 6. Run FIFO and Align Holdings
  console.log(`\n[6/6] Running FIFO Engine and reconciling Holdings...`);
  await runFIFO(db);

  // Align exact NAVs and current valuation from statement
  for (const s of schemesRows) {
    const isin = String(s.isin || '').trim().toUpperCase();
    const schemeName = String(s.scheme_name || '').trim();
    const nav = floatOrZero(s.nav);
    const folio = String(s.folio_number || '').trim();
    const units = floatOrZero(s.units);
    const value = floatOrZero(s.value);
    const cost = floatOrZero(s.cost);

    await dbRun(`
      UPDATE Holdings
      SET ltp = ?, native_ltp = ?,
          prev_close = ?,
          current_value = ?, native_current_value = ?,
          unrealized_pnl = ? - total_cost, native_unrealized_pnl = ? - native_total_cost,
          unrealized_pct = (? - total_cost) / total_cost * 100,
          data_source = 'CAMS CAS Statement', data_status = 'LIVE',
          last_update = datetime('now')
      WHERE portfolio = ? AND isin = ?
    `, [nav, nav, nav, value, value, value, value, value, portfolioName, isin]);
  }

  // Purge DashboardDiskCache
  await dbRun('DELETE FROM DashboardDiskCache');

  // Verification Audit
  console.log('\n================================================================================================');
  console.log(`RECONCILED HOLDINGS FOR PORTFOLIO '${portfolioName}':`);
  console.log('================================================================================================');
  const holdings = await dbAll('SELECT * FROM Holdings WHERE portfolio = ? ORDER BY current_value DESC', [portfolioName]);
  let totalCost = 0;
  let totalVal = 0;
  let totalPnl = 0;

  for (const h of holdings) {
    totalCost += h.total_cost || 0;
    totalVal += h.current_value || 0;
    totalPnl += h.unrealized_pnl || 0;
    const sName = (h.symbol || '').slice(0, 38);
    console.log(`  ${sName.padEnd(38)} | Folio: ${(h.folio || '').padEnd(14)} | Qty: ${floatOrZero(h.quantity).toFixed(3).padStart(9)} | Cost: ₹${floatOrZero(h.total_cost).toLocaleString('en-IN', { minimumFractionDigits: 2 }).padStart(12)} | Value: ₹${floatOrZero(h.current_value).toLocaleString('en-IN', { minimumFractionDigits: 2 }).padStart(12)} | PnL: ₹${floatOrZero(h.unrealized_pnl).toLocaleString('en-IN', { minimumFractionDigits: 2 }).padStart(11)} (${floatOrZero(h.unrealized_pct).toFixed(2)}%)`);
  }
  console.log('------------------------------------------------------------------------------------------------');
  console.log(`TOTAL COST:      ₹${totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`TOTAL VALUATION: ₹${totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`UNREALIZED P&L:  ₹${totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${((totalPnl / totalCost) * 100).toFixed(2)}%)`);
  console.log('================================================================================================');

  console.log('\n>>> POOJA MF imported and reconciled successfully!');
  db.close();
}

importPoojaMF().catch(err => {
  console.error('Error importing POOJA MF:', err);
  process.exit(1);
});
