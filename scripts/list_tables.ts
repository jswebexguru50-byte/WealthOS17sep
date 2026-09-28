import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('portfolio.db');
db.all("PRAGMA table_info('MasterTickers')", (err, rows) => {
  console.log(rows);
});
