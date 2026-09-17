const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

const bbText = fs.readFileSync('C:\\Users\\QB661XW\\.gemini\\antigravity\\brain\\614dcefa-2cb4-4d0c-9491-f455a709b364\\scratch\\bankbook_text.txt', 'utf8');
const bbLines = bbText.split('\n');

function cleanNum(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/,/g, '').trim()) || 0;
}

function parseDate(dStr) {
  if (!dStr) return '';
  const parts = dStr.trim().split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return dStr;
}

const expenseTxns = [];

for (let i = 0; i < bbLines.length; i++) {
  const line = bbLines[i].trim();
  if (!line || !line.includes('\t')) continue;
  const parts = line.split('\t').map(p => p.trim());
  const first = parts[0] || '';

  let expType = null;
  let symbol = 'CASH:EXPENSE';
  let notes = first;

  if (first.startsWith('Management Fees')) {
    expType = 'MANAGEMENT_FEE';
    symbol = 'CASH:MGMT_FEE';
    notes = 'IIFL Wealth Management Fees';
  } else if (first.startsWith('Entry load')) {
    expType = 'ENTRY_LOAD';
    symbol = 'CASH:ENTRY_LOAD';
    notes = 'IIFL Wealth Entry Load';
  } else if (first.startsWith('Custody Charges')) {
    expType = 'CUSTODY_CHARGES';
    symbol = 'CASH:CUSTODY';
    notes = 'Indusind Bank Orbis Custody Charges';
  } else if (first.startsWith('AUDIT CHARGES')) {
    expType = 'AUDIT_CHARGES';
    symbol = 'CASH:AUDIT';
    notes = 'Provisional Audit Certification Charges';
  } else if (first.startsWith('DP Charges')) {
    expType = 'DP_CHARGES';
    symbol = 'CASH:DP_CHARGES';
    notes = 'Depository Participant Charges';
  } else if (first.startsWith('Trf to TDS A/c')) {
    expType = 'TDS';
    symbol = 'CASH:TDS';
    notes = 'Tax Deducted at Source Transfer';
  }

  if (expType) {
    // Find amount
    let amt = 0;
    if (expType === 'TDS') {
      const nums = line.match(/-?[\d,]+\.\d{2}/g);
      if (nums) {
        for (const n of nums) {
          const val = cleanNum(n);
          if (val < 0 && val > -100000) {
            amt = Math.abs(val);
            break;
          }
        }
      }
    } else {
      for (let pIdx = 1; pIdx < parts.length; pIdx++) {
        const val = cleanNum(parts[pIdx]);
        if (val > 0 && val < 5000000) {
          amt = val;
          break;
        }
      }
    }

    const dateMatch = first.match(/(\d{2}\/\d{2}\/\d{4})/);
    const tranDate = dateMatch ? parseDate(dateMatch[1]) : '2020-01-01';

    if (amt > 0) {
      expenseTxns.push({
        date: tranDate,
        portfolio: 'IIFL360',
        type: expType,
        isin: 'UNKNOWN',
        symbol,
        quantity: 0,
        price: 0,
        gross_amount: amt,
        net_amount: amt,
        source: 'BANKBOOK',
        notes,
        batch_id: 'PMS-IIFL360-BANKBOOK-EXP'
      });
    }
  }
}

console.log('TOTAL_EXPENSE_TRANSACTIONS_TO_INSERT:', expenseTxns.length);
const totalAmt = expenseTxns.reduce((s, t) => s + t.net_amount, 0);
console.log('TOTAL_EXPENSE_AMOUNT:', totalAmt);

// Insert into Transactions
db.serialize(() => {
  db.run("DELETE FROM Transactions WHERE portfolio = 'IIFL360' AND batch_id = 'PMS-IIFL360-BANKBOOK-EXP'", [], (err) => {
    if (err) console.error('DELETE_ERR:', err);

    const stmt = db.prepare(`
      INSERT INTO Transactions (
        date, portfolio, type, isin, symbol, quantity, price, gross_amount,
        brokerage, stt, stamp_duty, gst, exchange_charges, sebi_charges, total_taxes,
        net_amount, source, notes, batch_id, created_at, is_cash_flow
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        0, 0, 0, 0, 0, 0, 0,
        ?, ?, ?, ?, CURRENT_TIMESTAMP, 1
      )
    `);

    for (const t of expenseTxns) {
      stmt.run([
        t.date, t.portfolio, t.type, t.isin, t.symbol, t.quantity, t.price, t.gross_amount,
        t.net_amount, t.source, t.notes, t.batch_id
      ]);
    }

    stmt.finalize(() => {
      console.log('Successfully inserted all IIFL360 bank book expenses into Transactions table!');
      db.run("DELETE FROM DashboardDiskCache", [], () => {
        console.log('Dashboard cache cleared.');
      });
    });
  });
});
