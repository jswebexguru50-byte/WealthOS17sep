const fs = require('fs');

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

const expenses = [];
let totalExpenses = 0;
const expenseByType = {};

for (let i = 0; i < bbLines.length; i++) {
  const line = bbLines[i].trim();
  if (!line || !line.includes('\t')) continue;
  const parts = line.split('\t').map(p => p.trim());
  const first = parts[0] || '';

  // Check expense types
  let expType = null;
  if (first.startsWith('Management Fees')) expType = 'MANAGEMENT_FEE';
  else if (first.startsWith('Entry load')) expType = 'ENTRY_LOAD';
  else if (first.startsWith('Custody Charges')) expType = 'CUSTODY_CHARGES';
  else if (first.startsWith('AUDIT CHARGES')) expType = 'AUDIT_CHARGES';
  else if (first.startsWith('DP Charges')) expType = 'DP_CHARGES';
  else if (first.startsWith('Trf to TDS A/c')) expType = 'TDS_EXPENSE';
  else if (first.startsWith('Sec. Tran. Tax')) expType = 'STT_EXPENSE';

  if (expType) {
    // In tab layout:
    // parts[0]: Transaction Description + Tran Date + Set Date + Tran Account + Security + Buy/Sell Amount + Income + Balance
    // parts[2]: Expenses amount
    // Let's inspect parts
    let amt = 0;
    for (let pIdx = 1; pIdx < parts.length; pIdx++) {
      const val = cleanNum(parts[pIdx]);
      if (val > 0 && val < 5000000) {
        amt = val;
        break;
      }
    }

    // Extract tran date
    const dateMatch = first.match(/(\d{2}\/\d{2}\/\d{4})/);
    const tranDate = dateMatch ? parseDate(dateMatch[1]) : '';

    if (amt > 0) {
      expenses.push({
        type: expType,
        rawType: first.split(/\s+/)[0],
        date: tranDate,
        amount: amt,
        desc: first
      });
      totalExpenses += amt;
      expenseByType[expType] = (expenseByType[expType] || 0) + amt;
    }
  }
}

console.log('TOTAL_PARSED_EXPENSES_COUNT:', expenses.length);
console.log('TOTAL_PARSED_EXPENSES_SUM:', totalExpenses);
console.log('BREAKDOWN_BY_TYPE:', expenseByType);
console.log('FIRST 5 EXPENSES:', expenses.slice(0, 5));
