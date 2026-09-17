const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

const closingAmount = 1020150.87;
const closingDate = '2024-08-30';

db.serialize(() => {
  // 1. Insert closing WITHDRAWAL transaction
  db.run(
    `INSERT INTO Transactions (
      date, portfolio, type, isin, symbol, quantity, price, gross_amount,
      brokerage, stt, stamp_duty, gst, exchange_charges, sebi_charges, total_taxes,
      net_amount, source, notes, batch_id, created_at, is_cash_flow
    ) VALUES (
      ?, 'IIFL360', 'WITHDRAWAL', 'UNKNOWN', 'CASH:WITHDRAWAL', 0, 0, ?,
      0, 0, 0, 0, 0, 0, 0,
      ?, 'BANKBOOK', 'Final Portfolio Liquidation & Bank Payout to Investor', 'PMS-IIFL360-CLOSEOUT', CURRENT_TIMESTAMP, 1
    )`,
    [closingDate, closingAmount, closingAmount],
    function(err) {
      if (err) {
        console.error('INSERT_ERR:', err);
        return;
      }
      console.log('Successfully inserted closing WITHDRAWAL transaction with ID:', this.lastID);

      // 2. Clear DashboardDiskCache
      db.run("DELETE FROM DashboardDiskCache", [], (err2) => {
        if (err2) console.error('CACHE_CLEAR_ERR:', err2);
        else console.log('Dashboard disk cache invalidated successfully.');
      });
    }
  );
});
