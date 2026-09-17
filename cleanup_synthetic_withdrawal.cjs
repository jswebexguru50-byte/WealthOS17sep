const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.run("DELETE FROM Transactions WHERE batch_id = 'PMS-IIFL360-CLOSEOUT'", [], function(err) {
  if (err) console.error('ERR:', err);
  else console.log('Removed synthetic closeout withdrawal rows:', this.changes);

  db.run("DELETE FROM DashboardDiskCache", [], () => {
    console.log('Cache cleared.');
  });
});
