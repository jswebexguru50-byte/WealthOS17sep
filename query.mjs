import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('portfolio.db');
db.all("SELECT provider_token FROM field_mapping_catalog", [], (err, rows) => {
  console.log(rows.map(r => r.provider_token).join(', '));
});
