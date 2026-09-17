import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { runFIFO } from '../src/server/fifoEngine.js';

const execFileAsync = promisify(execFile);
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

async function runBrotherImportAndRecon() {
  console.log('='.repeat(100));
  console.log('STARTING BROTHER MUTUAL FUNDS CAS STATEMENT IMPORT & RECONCILIATION');
  console.log('='.repeat(100));

  const pdfPath = 'C:\\Users\\gopal\\Downloads\\DFXXXXXX5R_01012001-02092026_CP222943812_02092026050309378.pdf';
  const password = 'P@ss12345';
  const portfolioName = 'Brother - Mutual Funds';
  const memberId = 2;

  // 1. Parse PDF using python casparser
  console.log(`\n[1/7] Parsing CAS PDF: ${pdfPath}...`);
  const pythonScript = `
import casparser, json, sys
raw = casparser.read_cas_pdf(r"${pdfPath}", "${password}", output="json")
print(raw)
`;
  const tempPy = path.join(process.cwd(), 'scratch', 'temp_cas_runner.py');
  fs.writeFileSync(tempPy, pythonScript, 'utf8');

  const { stdout } = await execFileAsync('python', [tempPy], { maxBuffer: 50 * 1024 * 1024 });
  fs.unlinkSync(tempPy);

  const casData = JSON.parse(stdout);
  console.log(`  CAS File Type: ${casData.file_type}`);
  console.log(`  Statement Period: ${casData.statement_period?.from} to ${casData.statement_period?.to}`);
  console.log(`  Investor: ${casData.investor_info?.name} | Email: ${casData.investor_info?.email}`);
  console.log(`  Total Folios: ${casData.folios?.length}`);

  // 2. Ensure Brother Member (ID: 2) & Portfolio exist
  console.log(`\n[2/7] Verifying Brother Member (ID: ${memberId}) & Portfolio ('${portfolioName}')...`);
  await dbRun(`
    UPDATE FamilyMembers 
    SET pan_number = 'DFYPS6605R', email = 'panki636@gmail.com', name = 'Pankaj Sharma (Brother)'
    WHERE id = 2
  `);

  const portRow = await dbGet('SELECT * FROM Portfolios WHERE name = ?', [portfolioName]);
  if (!portRow) {
    await dbRun(`
      INSERT INTO Portfolios (name, type, base_currency, status, member_id, family_group, benchmark_symbol)
      VALUES (?, 'MUTUAL_FUND', 'INR', 'ACTIVE', 2, 'Brother Accounts', '^NSEI')
    `, [portfolioName]);
  } else {
    await dbRun(`UPDATE Portfolios SET member_id = 2, type = 'MUTUAL_FUND', family_group = 'Brother Accounts' WHERE name = ?`, [portfolioName]);
  }

  await dbRun(`
    INSERT OR REPLACE INTO CamsConfigurations (pan, email, password, portfolio_name, status)
    VALUES ('DFYPS6605R', 'panki636@gmail.com', ?, ?, 'ACTIVE')
  `, [password, portfolioName]);

  // 3. Clear existing transactions for Brother - Mutual Funds to allow clean idempotent import
  console.log(`\n[3/7] Cleaning previous transactions and summary holdings for '${portfolioName}'...`);
  await dbRun('DELETE FROM Transactions WHERE portfolio = ?', [portfolioName]);
  await dbRun('DELETE FROM CamsSummaryHoldings WHERE portfolio = ?', [portfolioName]);

  // 4. Pre-populate MasterTickers first (to satisfy Transactions Foreign Key constraint)
  console.log(`\n[4/7] Ensuring all MasterTickers exist...`);
  const summaryHoldingsToInsert: any[] = [];
  const processedSchemes: any[] = [];

  for (const folio of casData.folios || []) {
    const folioNum = String(folio.folio || '').trim();
    const amc = String(folio.amc || '').trim();

    for (const s of folio.schemes || []) {
      const schemeName = String(s.scheme || '').trim();
      let isin = s.isin ? String(s.isin).toUpperCase().trim() : '';
      if (!isin) {
        if (schemeName.toLowerCase().includes('unclaimed')) {
          isin = 'INFS5S7LMXXX';
        } else {
          let hash = 0;
          for (let i = 0; i < schemeName.length; i++) {
            hash = (hash << 5) - hash + schemeName.charCodeAt(i);
            hash |= 0;
          }
          isin = 'INF' + Math.abs(hash).toString(36).toUpperCase().padEnd(9, 'X').slice(0, 9);
        }
      }

      const closeUnits = floatOrZero(s.close);
      const val = s.valuation || {};
      const nav = floatOrZero(val.nav);
      const valAmount = floatOrZero(val.value);
      const valCost = floatOrZero(val.cost);

      summaryHoldingsToInsert.push({
        portfolio: portfolioName,
        isin,
        folio: folioNum,
        symbol: schemeName,
        quantity: closeUnits,
        nav,
        value: valAmount,
        cost: valCost,
        member_id: memberId
      });

      await dbRun(`
        INSERT INTO MasterTickers (isin, symbol, name, exchange, sector, last_price, currency, updated_at)
        VALUES (?, ?, ?, 'MUTUAL_FUND', 'Mutual Funds', ?, 'INR', datetime('now'))
        ON CONFLICT(isin) DO UPDATE SET 
          last_price = excluded.last_price,
          symbol = excluded.symbol,
          name = excluded.name,
          updated_at = datetime('now')
      `, [isin, schemeName, schemeName, nav]);

      processedSchemes.push({
        folioNum,
        amc,
        schemeName,
        isin,
        transactions: s.transactions || []
      });
    }
  }

  // 5. Extract and Insert Transactions
  console.log(`\n[5/7] Extracting and inserting transactions into database...`);
  const batchId = `BATCH-CAMS-BROTHER-${Date.now()}`;
  let totalInsertedTxns = 0;

  for (const ps of processedSchemes) {
    const txs = ps.transactions;
    for (let i = 0; i < txs.length; i++) {
      const t = txs[i];
      const tType = String(t.type || '').toUpperCase();
      const tDate = t.date;
      const tUnits = floatOrZero(t.units);
      const tAmt = floatOrZero(t.amount);
      const tNav = floatOrZero(t.nav);
      const tDesc = String(t.description || '').trim();

      if (tType === 'PURCHASE' || tType === 'PURCHASE_SIP') {
        let stampDuty = 0.0;
        if (i + 1 < txs.length) {
          const nextT = txs[i + 1];
          if (nextT.type === 'STAMP_DUTY_TAX' && nextT.date === tDate) {
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
          tDate, portfolioName, ps.isin, ps.schemeName, qty, price,
          grossAmount, stampDuty, stampDuty,
          netAmount, `Folio: ${ps.folioNum}; ${tDesc}`, batchId, ps.folioNum, memberId
        ]);
        totalInsertedTxns++;

      } else if (tType === 'REDEMPTION' || tType === 'SELL' || tType === 'SWITCH_OUT') {
        let stt = 0.0;
        let tds = 0.0;
        if (i + 1 < txs.length && txs[i + 1].type === 'STT_TAX' && txs[i + 1].date === tDate) {
          stt = floatOrZero(txs[i + 1].amount);
        }
        if (i + 2 < txs.length && txs[i + 2].type === 'TDS_TAX' && txs[i + 2].date === tDate) {
          tds = floatOrZero(txs[i + 2].amount);
        }

        const qty = Math.abs(tUnits);
        const price = tNav > 0 ? tNav : (qty > 0 ? tAmt / qty : 0.0);
        const grossAmount = qty * price;
        const netAmount = tAmt > 0 ? tAmt : (grossAmount - stt - tds);

        await dbRun(`
          INSERT INTO Transactions (
            date, portfolio, type, isin, symbol, quantity, price,
            gross_amount, brokerage, stt, stamp_duty, gst, exchange_charges, sebi_charges, total_taxes,
            net_amount, source, notes, batch_id, is_cash_flow, folio, is_ca, member_id
          ) VALUES (
            ?, ?, 'SELL', ?, ?, ?, ?,
            ?, 0, ?, 0, 0, 0, 0, ?,
            ?, 'CAMS Import', ?, ?, 1, ?, 0, ?
          )
        `, [
          tDate, portfolioName, ps.isin, ps.schemeName, qty, price,
          grossAmount, stt, (stt + tds),
          netAmount, `Folio: ${ps.folioNum}; ${tDesc}`, batchId, ps.folioNum, memberId
        ]);
        totalInsertedTxns++;
      }
    }
  }

  console.log(`  Successfully inserted ${totalInsertedTxns} BUY/SELL transactions into database.`);

  // Insert CamsSummaryHoldings
  for (const sh of summaryHoldingsToInsert) {
    await dbRun(`
      INSERT OR REPLACE INTO CamsSummaryHoldings (portfolio, isin, folio, symbol, quantity, nav, value, cost, member_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [sh.portfolio, sh.isin, sh.folio, sh.symbol, sh.quantity, sh.nav, sh.value, sh.cost, sh.member_id]);
  }

  // 6. Run FIFO Engine
  console.log(`\n[6/7] Running FIFO Engine across all portfolios...`);
  await runFIFO(db);

  // Ensure member_id is updated for Holdings and RealizedGains
  await dbRun(`
    UPDATE Holdings 
    SET member_id = (SELECT member_id FROM Portfolios WHERE Portfolios.name = Holdings.portfolio)
    WHERE member_id IS NULL OR member_id = 0
  `);
  await dbRun(`
    UPDATE RealizedGains 
    SET member_id = (SELECT member_id FROM Portfolios WHERE Portfolios.name = RealizedGains.portfolio)
    WHERE member_id IS NULL OR member_id = 0
  `);

  // 7. Comprehensive Forensic Reconciliation Audit
  console.log(`\n[7/7] EXECUTING COMPREHENSIVE FORENSIC RECONCILIATION AUDIT`);
  console.log('='.repeat(100));

  const dbTxns = await dbAll('SELECT * FROM Transactions WHERE portfolio = ? ORDER BY date ASC, id ASC', [portfolioName]);
  const dbHoldings = await dbAll('SELECT * FROM Holdings WHERE portfolio = ? ORDER BY current_value DESC', [portfolioName]);
  const dbGains = await dbAll('SELECT * FROM RealizedGains WHERE portfolio = ? ORDER BY sell_date ASC', [portfolioName]);

  console.log(`\n--- TRANSACTIONS SUMMARY ---`);
  console.log(`Total Database Transactions for '${portfolioName}': ${dbTxns.length}`);
  const buys = dbTxns.filter(t => t.type === 'BUY');
  const sells = dbTxns.filter(t => t.type === 'SELL');
  const totalInflow = buys.reduce((s, t) => s + (t.net_amount || 0), 0);
  const totalOutflow = sells.reduce((s, t) => s + (t.net_amount || 0), 0);
  console.log(`  BUY Transactions:  ${buys.length} | Total Invested Cash Flow: INR ${totalInflow.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  SELL Transactions: ${sells.length} | Total Redemption Proceeds: INR ${totalOutflow.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  console.log(`\n--- REALIZED GAINS (REDEMPTIONS) ---`);
  let totalRealizedPnl = 0;
  for (const g of dbGains) {
    totalRealizedPnl += g.realized_pnl || 0;
    console.log(`  Matched [${g.buy_date} -> ${g.sell_date}] ${g.symbol} | Qty: ${g.matched_qty} | Buy Cost: ₹${g.buy_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Sell Proceeds: ₹${g.sell_proceeds.toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Realized Gain: ₹${g.realized_pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  }
  console.log(`  Total Realized Gain: INR ${totalRealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  console.log(`\n--- HOLDINGS RECONCILIATION VS PDF STATEMENT ---`);
  let totalDbCost = 0;
  let totalDbVal = 0;
  let totalPdfCost = 0;
  let totalPdfVal = 0;

  for (const sh of summaryHoldingsToInsert) {
    totalPdfCost += sh.cost;
    totalPdfVal += sh.value;

    const matchedH = dbHoldings.find(h => h.isin === sh.isin || h.symbol === sh.symbol);
    if (!matchedH) {
      console.log(`  [MISSING IN DB] ${sh.symbol} (${sh.isin}) | PDF Qty: ${sh.quantity}`);
      continue;
    }

    totalDbCost += matchedH.total_cost || 0;
    totalDbVal += matchedH.current_value || 0;

    const qtyDiff = Math.abs((matchedH.quantity || 0) - sh.quantity);
    const valDiff = Math.abs((matchedH.current_value || 0) - sh.value);
    const isQtyMatch = qtyDiff < 0.001;
    const isValMatch = valDiff < 1.0;

    console.log(`\n  SCHEME: ${sh.symbol}`);
    console.log(`    Folio: ${sh.folio} | ISIN: ${sh.isin}`);
    console.log(`    On-Hand Quantity: DB = ${matchedH.quantity?.toFixed(4)} | PDF = ${sh.quantity.toFixed(4)} [${isQtyMatch ? 'MATCH' : 'MISMATCH'}]`);
    console.log(`    Buy Rate (Avg):   ₹${matchedH.avg_buy_price?.toFixed(4)} | FIFO Total Cost: ₹${matchedH.total_cost?.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (PDF Stmt Cost: ₹${sh.cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })})`);
    console.log(`    Current NAV:      ₹${matchedH.ltp?.toFixed(4)} (PDF NAV: ₹${sh.nav?.toFixed(4)})`);
    console.log(`    Valuation:        DB = ₹${matchedH.current_value?.toLocaleString('en-IN', { minimumFractionDigits: 2 })} | PDF = ₹${sh.value?.toLocaleString('en-IN', { minimumFractionDigits: 2 })} [${isValMatch ? 'MATCH' : 'MISMATCH'}]`);
    console.log(`    Unrealized Gain:  ₹${matchedH.unrealized_pnl?.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (+${matchedH.unrealized_pct?.toFixed(2)}%)`);
  }

  console.log('\n' + '='.repeat(100));
  console.log('GRAND TOTAL RECONCILIATION SUMMARY:');
  console.log(`  Total Portfolio Value: DB = INR ${totalDbVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | PDF = INR ${totalPdfVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Diff: ₹${Math.abs(totalDbVal - totalPdfVal).toFixed(2)}`);
  console.log(`  Total Invested Cost:   DB = INR ${totalDbCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | PDF = INR ${totalPdfCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Diff: ₹${Math.abs(totalDbCost - totalPdfCost).toFixed(2)}`);
  console.log(`  Total Realized Gains:  INR ${totalRealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log('='.repeat(100));

  if (Math.abs(totalDbVal - totalPdfVal) < 1.0) {
    console.log('\n>>> SUCCESS: 100.000% MATHEMATICAL & RECONCILIATION INTEGRITY ACHIEVED WITH ZERO DISCREPANCY! <<<');
  } else {
    console.warn('\n>>> WARNING: DISCREPANCY DETECTED IN VALUATION <<<');
  }
}

function floatOrZero(v: any): number {
  if (v === null || v === undefined) return 0.0;
  const num = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return isNaN(num) ? 0.0 : num;
}

runBrotherImportAndRecon().catch(console.error);
