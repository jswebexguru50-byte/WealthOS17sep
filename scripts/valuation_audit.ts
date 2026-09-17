import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const db = new sqlite3.Database('portfolio.db');

async function runAudit() {
  console.log('====================================');
  console.log('  VALUATION FORENSIC BREAKDOWN');
  console.log('====================================\n');

  // 1. Portfolio by Portfolio breakdown
  db.all(`
    SELECT 
      portfolio, 
      COUNT(*) as positions,
      SUM(total_cost) as cost_sum,
      SUM(current_value) as value_sum,
      SUM(native_current_value) as native_val_sum,
      SUM(unrealized_pnl) as pnl_sum
    FROM Holdings
    GROUP BY portfolio
    ORDER BY value_sum DESC
  `, (err, rows) => {
    if (err) console.error(err);
    console.log('--- Holdings Breakdown by Portfolio ---');
    const formatted = (rows || []).map(r => ({
      portfolio: r.portfolio,
      positions: r.positions,
      total_cost_L: (r.cost_sum / 100000).toFixed(2),
      current_value_L: (r.value_sum / 100000).toFixed(2),
      current_value_Cr: (r.value_sum / 10000000).toFixed(4),
      pnl_L: (r.pnl_sum / 100000).toFixed(2)
    }));
    console.table(formatted);

    const totalVal = (rows || []).reduce((s, r) => s + (r.value_sum || 0), 0);
    const totalCost = (rows || []).reduce((s, r) => s + (r.cost_sum || 0), 0);
    console.log(`TOTAL HOLDINGS VALUE: ₹${(totalVal/10000000).toFixed(4)} Cr (Cost: ₹${(totalCost/10000000).toFixed(4)} Cr)`);

    // 2. Bank Accounts & FDs
    db.all(`SELECT * FROM BankAccountsAndFDs`, (err2, bankRows) => {
      console.log('\n--- Bank Accounts & FDs ---');
      console.table(bankRows);

      // 3. Currency Rates
      db.all(`SELECT * FROM CurrencyRates`, (err3, fxRows) => {
        console.log('\n--- FX Currency Rates ---');
        console.table(fxRows);

        // 4. Check Top 20 holdings by valuation
        db.all(`SELECT portfolio, symbol, isin, quantity, avg_buy_price, ltp, total_cost, current_value, data_source FROM Holdings ORDER BY current_value DESC LIMIT 20`, (err4, topH) => {
          console.log('\n--- Top 20 Holdings by Valuation ---');
          console.table((topH || []).map(h => ({
            portfolio: h.portfolio,
            symbol: h.symbol,
            qty: h.quantity,
            avg_price: h.avg_buy_price,
            ltp: h.ltp,
            cost_L: (h.total_cost / 100000).toFixed(2),
            value_L: (h.current_value / 100000).toFixed(2),
            data_source: h.data_source
          })));

          // 5. Scan Downloads folder for latest statements
          const dlDir = 'C:\\Users\\gopal\\Downloads';
          if (fs.existsSync(dlDir)) {
            const files = fs.readdirSync(dlDir).filter(f => {
              const ext = path.extname(f).toLowerCase();
              return ['.csv', '.xlsx', '.xls', '.pdf'].includes(ext);
            });
            console.log(`\n--- Latest Statements in Downloads (${files.length} found) ---`);
            const fileStats = files.map(f => {
              const full = path.join(dlDir, f);
              const stat = fs.statSync(full);
              return {
                filename: f,
                sizeKB: (stat.size / 1024).toFixed(1),
                modified: stat.mtime.toISOString().replace('T', ' ').slice(0, 19)
              };
            }).sort((a, b) => b.modified.localeCompare(a.modified));
            console.table(fileStats.slice(0, 25));
          }
        });
      });
    });
  });
}

runAudit();
