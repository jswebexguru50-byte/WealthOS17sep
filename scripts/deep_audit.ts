import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const db = new sqlite3.Database('portfolio.db');

async function audit() {
  console.log('=== FORENSIC INVESTIGATION ===\n');

  // 1. IBKR holdings in database
  db.all("SELECT portfolio, isin, symbol, quantity, avg_buy_price, ltp, total_cost, current_value, native_ltp, native_current_value, native_total_cost, currency, data_source FROM Holdings WHERE portfolio = 'US - IBKR'", (err, ibkrHoldings) => {
    console.log('--- US - IBKR Holdings in DB ---');
    console.table(ibkrHoldings);

    // 2. IBKR transactions in database
    db.all("SELECT id, date, portfolio, type, symbol, isin, quantity, price, net_amount, notes FROM Transactions WHERE portfolio = 'US - IBKR' ORDER BY date ASC", (err2, ibkrTxns) => {
      console.log('\n--- US - IBKR Transactions in DB (Count: ' + (ibkrTxns ? ibkrTxns.length : 0) + ') ---');
      console.table(ibkrTxns);

      // 3. Scan Downloads for IBKR files
      const dlDir = 'C:\\Users\\gopal\\Downloads';
      const ibkrFiles = fs.readdirSync(dlDir).filter(f => {
        const u = f.toUpperCase();
        return u.includes('IBKR') || u.includes('U121') || u.includes('ACTIVITY') || u.includes('US ETF') || u.includes('INTERACTIVE');
      });
      console.log('\n--- IBKR Files in Downloads ---');
      ibkrFiles.forEach(f => {
        const full = path.join(dlDir, f);
        const stat = fs.statSync(full);
        console.log(`  File: ${f} | Size: ${(stat.size/1024).toFixed(1)} KB | Modified: ${stat.mtime.toISOString().replace('T', ' ').slice(0, 19)}`);
      });

      // 4. CC9 in PmsSummaryHoldings vs Holdings
      db.all("SELECT COUNT(*) as cnt, SUM(total_cost) as cost_sum, SUM(current_value) as val_sum FROM PmsSummaryHoldings WHERE portfolio = 'cc9'", (err3, pmsSum) => {
        console.log('\n--- cc9 PmsSummaryHoldings (Statement Ground Truth) ---');
        console.table(pmsSum);

        db.all("SELECT COUNT(*) as cnt, SUM(total_cost) as cost_sum, SUM(current_value) as val_sum FROM Holdings WHERE portfolio = 'cc9'", (err4, holdSum) => {
          console.log('\n--- cc9 Holdings (What FIFO produced) ---');
          console.table(holdSum);

          db.all("SELECT symbol, isin, quantity, avg_buy_price, ltp, total_cost, current_value, data_source FROM Holdings WHERE portfolio = 'cc9' ORDER BY symbol ASC", (err5, cc9Holdings) => {
            console.log('\n--- cc9 Holdings Detail (Count: ' + cc9Holdings.length + ') ---');
            console.table(cc9Holdings);
          });
        });
      });
    });
  });
}

audit();
