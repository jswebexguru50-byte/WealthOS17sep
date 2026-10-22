const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const db = new sqlite3.Database('portfolio.db');

async function comprehensiveAudit() {
  console.log('================================================================');
  console.log('       COMPREHENSIVE MULTI-PORTFOLIO STATEMENT FORENSIC AUDIT    ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // PART 1: IBKR INVESTIGATION
  // -------------------------------------------------------------
  console.log('-------------------------------------------------------------');
  console.log('1. US - IBKR DEEP DIVE');
  console.log('-------------------------------------------------------------');
  
  db.all("SELECT * FROM Holdings WHERE portfolio = 'US - IBKR'", (err, ibkrHoldings) => {
    console.log('Current DB Holdings for US - IBKR:');
    console.table(ibkrHoldings.map(h => ({
      symbol: h.symbol,
      isin: h.isin,
      qty: h.quantity,
      avg_price_usd: (h.total_cost / h.quantity / (h.currency === 'USD' ? 1 : 94.94)).toFixed(2),
      ltp_usd: h.native_ltp,
      cost_usd: (h.total_cost / 94.94).toFixed(2),
      val_usd: (h.current_value / 94.94).toFixed(2),
      val_inr: h.current_value,
      data_source: h.data_source
    })));

    const totalSecuritiesValUsd = ibkrHoldings.reduce((s, h) => s + (h.native_current_value || (h.current_value / 94.94)), 0);
    console.log(`Current Total Securities USD Valuation: $${totalSecuritiesValUsd.toFixed(2)}`);
    console.log(`Target Total IBKR Value: $390,268.00`);
    console.log(`User Uninvested Cash: $5,280.00`);
    console.log(`Target Securities Valuation: $${(390268 - 5280).toFixed(2)}`);
    console.log(`Securities Gap: $${(390268 - 5280 - totalSecuritiesValUsd).toFixed(2)}`);

    // Let's check live market price of these ETFs right now
    // VGT, VOO, SCHG, QQQ
    console.log('\nChecking IBKR Transactions in DB:');
    db.all("SELECT date, type, symbol, quantity, price, net_amount, notes FROM Transactions WHERE portfolio = 'US - IBKR' AND type IN ('BUY','SELL','SPLIT') ORDER BY symbol, date ASC", (err2, ibkrTx) => {
      console.table(ibkrTx);

      // Check if there are any other IBKR statements in Downloads or project
      const dlDir = 'C:\\Users\\gopal\\Downloads';
      const allFiles = fs.readdirSync(dlDir);
      console.log('\nAll files in Downloads matching IBKR / U121 / US / Activity:');
      allFiles.filter(f => {
        const u = f.toUpperCase();
        return u.includes('IBKR') || u.includes('U121') || u.includes('ACTIVITY') || u.includes('STATEMENT') || u.includes('TRADES');
      }).forEach(f => {
        const stat = fs.statSync(path.join(dlDir, f));
        console.log(`  ${f} (${(stat.size/1024).toFixed(1)} KB, ${stat.mtime.toISOString().slice(0, 19)})`);
      });

      // -------------------------------------------------------------
      // PART 2: CC9 FORENSIC COMPARISON
      // -------------------------------------------------------------
      console.log('\n-------------------------------------------------------------');
      console.log('2. CC9 (PMS) STATEMENT VS HOLDINGS AUDIT');
      console.log('-------------------------------------------------------------');

      db.all("SELECT * FROM PmsSummaryHoldings WHERE portfolio = 'cc9' ORDER BY symbol ASC", (err3, pmsRows) => {
        console.log(`Official PmsSummaryHoldings Count: ${pmsRows.length}`);
        const pmsVal = pmsRows.reduce((s, r) => s + r.current_value, 0);
        const pmsCost = pmsRows.reduce((s, r) => s + r.total_cost, 0);
        console.log(`Official Statement Valuation: ₹${(pmsVal/10000000).toFixed(4)} Cr (Cost: ₹${(pmsCost/10000000).toFixed(4)} Cr)`);

        db.all("SELECT * FROM Holdings WHERE portfolio = 'cc9' ORDER BY symbol ASC", (err4, hRows) => {
          console.log(`Current DB Holdings for cc9 Count: ${hRows.length}`);
          const hVal = hRows.reduce((s, r) => s + r.current_value, 0);
          const hCost = hRows.reduce((s, r) => s + r.total_cost, 0);
          console.log(`Current DB Holdings Valuation: ₹${(hVal/10000000).toFixed(4)} Cr (Cost: ₹${(hCost/10000000).toFixed(4)} Cr)`);

          const pmsIsins = new Set(pmsRows.map(r => r.isin));
          const pmsSymbols = new Set(pmsRows.map(r => r.symbol));

          const extraInHoldings = hRows.filter(h => h.symbol !== 'CASH' && !pmsIsins.has(h.isin) && !pmsSymbols.has(h.symbol));
          console.log(`\nExtra Positions in Holdings (NOT in Statement): ${extraInHoldings.length}`);
          console.table(extraInHoldings.map(h => ({
            symbol: h.symbol,
            isin: h.isin,
            qty: h.quantity,
            cost_L: (h.total_cost/100000).toFixed(2),
            val_L: (h.current_value/100000).toFixed(2),
            data_source: h.data_source
          })));

          const extraVal = extraInHoldings.reduce((s, h) => s + h.current_value, 0);
          console.log(`Total Extra Phantom Value in cc9: ₹${(extraVal/10000000).toFixed(4)} Cr`);

          // Check duplicate positions in Holdings for cc9
          const symbolCounts = {};
          hRows.forEach(h => {
            symbolCounts[h.symbol] = (symbolCounts[h.symbol] || 0) + 1;
          });
          const duplicates = hRows.filter(h => symbolCounts[h.symbol] > 1);
          console.log(`\nDuplicate Symbol Rows in cc9 Holdings: ${duplicates.length}`);
          console.table(duplicates.map(h => ({
            symbol: h.symbol,
            isin: h.isin,
            qty: h.quantity,
            ltp: h.ltp,
            val_L: (h.current_value/100000).toFixed(2),
            source: h.data_source
          })));

          // Check where these extra positions in cc9 came from in Transactions
          const extraIsins = extraInHoldings.map(h => h.isin);
          const placeholders = extraIsins.map(() => '?').join(',');
          if (extraIsins.length > 0) {
            db.all(`SELECT id, date, portfolio, type, symbol, isin, quantity, price, net_amount, notes FROM Transactions WHERE portfolio = 'cc9' AND isin IN (${placeholders})`, extraIsins, (err5, extraTx) => {
              console.log('\nTransactions that caused these extra cc9 holdings:');
              console.table(extraTx);

              // -------------------------------------------------------------
              // PART 3: PAPA & MAA BROKER STATEMENTS VS DB HOLDINGS
              // -------------------------------------------------------------
              auditPapaAndMaa();
            });
          } else {
            auditPapaAndMaa();
          }
        });
      });
    });
  });
}

function auditPapaAndMaa() {
  console.log('\n-------------------------------------------------------------');
  console.log('3. PAPA STATEMENT AUDIT');
  console.log('-------------------------------------------------------------');
  
  db.all("SELECT symbol, isin, quantity, avg_buy_price, ltp, total_cost, current_value FROM Holdings WHERE portfolio = 'Papa' ORDER BY current_value DESC", (err, papaHoldings) => {
    console.table(papaHoldings.map(h => ({
      symbol: h.symbol,
      isin: h.isin,
      qty: h.quantity,
      ltp: h.ltp,
      cost_L: (h.total_cost/100000).toFixed(2),
      val_L: (h.current_value/100000).toFixed(2)
    })));
    const papaVal = papaHoldings.reduce((s, h) => s + h.current_value, 0);
    console.log(`Papa Total DB Valuation: ₹${(papaVal/10000000).toFixed(4)} Cr`);

    console.log('\n-------------------------------------------------------------');
    console.log('4. MAA STATEMENT AUDIT');
    console.log('-------------------------------------------------------------');
    db.all("SELECT symbol, isin, quantity, avg_buy_price, ltp, total_cost, current_value FROM Holdings WHERE portfolio = 'Maa' ORDER BY current_value DESC", (err2, maaHoldings) => {
      console.table(maaHoldings.map(h => ({
        symbol: h.symbol,
        isin: h.isin,
        qty: h.quantity,
        ltp: h.ltp,
        cost_L: (h.total_cost/100000).toFixed(2),
        val_L: (h.current_value/100000).toFixed(2)
      })));
      const maaVal = maaHoldings.reduce((s, h) => s + h.current_value, 0);
      console.log(`Maa Total DB Valuation: ₹${(maaVal/10000000).toFixed(4)} Cr`);

      console.log('\n-------------------------------------------------------------');
      console.log('5. UNLISTED PORTFOLIO AUDIT');
      console.log('-------------------------------------------------------------');
      db.all("SELECT symbol, isin, quantity, avg_buy_price, ltp, total_cost, current_value, data_source FROM Holdings WHERE portfolio = 'Unlisted' ORDER BY current_value DESC", (err3, unlistedH) => {
        console.table(unlistedH.map(h => ({
          symbol: h.symbol,
          isin: h.isin,
          qty: h.quantity,
          ltp: h.ltp,
          cost_L: (h.total_cost/100000).toFixed(2),
          val_L: (h.current_value/100000).toFixed(2),
          source: h.data_source
        })));
        const unlistedVal = unlistedH.reduce((s, h) => s + h.current_value, 0);
        console.log(`Unlisted Total DB Valuation: ₹${(unlistedVal/10000000).toFixed(4)} Cr`);
      });
    });
  });
}

comprehensiveAudit();
