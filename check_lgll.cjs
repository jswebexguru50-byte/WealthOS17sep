const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./portfolio.db', sqlite3.OPEN_READONLY);
db.all(
  "SELECT id, isin, symbol, name, exchange, sector, upstox_key_nse, upstox_key_bse FROM MasterTickers WHERE upper(name) LIKE '%LANDMARK%' ORDER BY id",
  (err, rows) => {
    if (err) { console.error(err.message); db.close(); return; }
    console.log('\n===== All Landmark entries in MasterTickers =====\n');
    rows.forEach(r => {
      console.log('  ID:', r.id, '| ISIN:', r.isin, '| Symbol:', r.symbol);
      console.log('  Name:', r.name);
      console.log('  Exchange:', r.exchange, '| Sector:', r.sector);
      console.log('  NSE key:', r.upstox_key_nse, '| BSE key:', r.upstox_key_bse);
      console.log('');
    });

    // Also show Papa's LGLL holding
    db.get(
      "SELECT portfolio, isin, symbol, quantity, avg_buy_price, total_cost, ltp, current_value FROM Holdings WHERE isin='INE12QA01010'",
      (e2, h) => {
        if (h) {
          console.log('Papa LGLL Holding:');
          console.log('  Portfolio:', h.portfolio);
          console.log('  Symbol:', h.symbol, '| Qty:', h.quantity, '| Avg:', h.avg_buy_price);
          console.log('  LTP:', h.ltp, '| Current Value:', h.current_value);
        }
        db.close();
      }
    );
  }
);
