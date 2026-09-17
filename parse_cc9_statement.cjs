const fs = require('fs');
const { createClient } = require('@libsql/client');

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
  const raw = fs.readFileSync('cc9_portfolio_statement_20260823.csv', 'utf8');
  const rows = parseCSV(raw);

  const stmtHoldings = [];
  let isEquitySection = false;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const col0 = (r[0] || '').replace(/"/g, '').trim();
    if (col0 === 'Security' || col0 === 'Shares') {
      isEquitySection = true;
      continue;
    }
    if (col0 === 'Total' || col0.startsWith('Cash') || col0.startsWith('Other')) {
      isEquitySection = false;
      continue;
    }
    if (isEquitySection && col0 && col0 !== 'Equity' && col0 !== 'Shares') {
      const qty = parseFloat((r[3] || '0').replace(/,/g, ''));
      const unitCost = parseFloat((r[4] || '0').replace(/,/g, ''));
      const totalCost = parseFloat((r[5] || '0').replace(/,/g, ''));
      const mktPrice = parseFloat((r[6] || '0').replace(/,/g, ''));
      const mktVal = parseFloat((r[7] || '0').replace(/,/g, ''));
      if (!isNaN(qty) && qty > 0) {
        stmtHoldings.push({
          securityName: col0,
          qty,
          unitCost,
          totalCost,
          mktPrice,
          mktVal
        });
      }
    }
  }

  console.log(`Parsed ${stmtHoldings.length} equity positions from statement:`);
  let sumStmtVal = 0, sumStmtCost = 0;
  stmtHoldings.forEach(h => {
    sumStmtVal += h.mktVal;
    sumStmtCost += h.totalCost;
    console.log(`${h.securityName.padEnd(42)} | Qty: ${String(h.qty).padStart(8)} | Cost: ${String(Math.round(h.totalCost)).padStart(10)} | MktVal: ${String(Math.round(h.mktVal)).padStart(10)}`);
  });
  console.log(`\nTotal Stmt Cost: ${sumStmtCost}, Total Stmt Value: ${sumStmtVal}`);
}

main().catch(console.error);
