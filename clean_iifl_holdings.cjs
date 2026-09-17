const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

db.serialize(() => {
  db.run("DELETE FROM Holdings WHERE portfolio = 'IIFL360'", [], function(err) {
    if (err) console.error('DEL_ERR:', err);
    else console.log('Deleted IIFL360 rows from Holdings:', this.changes);
  });

  db.run("DELETE FROM DashboardDiskCache", [], () => {
    console.log('Cache cleared.');
  });
});
