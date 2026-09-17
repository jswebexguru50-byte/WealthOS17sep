const sqlite3 = require('./node_modules/sqlite3').verbose();
const db = new sqlite3.Database('./portfolio.db');
db.serialize(() => {
  // Row counts per table
  db.all(`
    SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
  `, (e, tables) => {
    let done = 0;
    const results = [];
    if (!tables || tables.length === 0) { db.close(); return; }
    for (const t of tables) {
      db.get(`SELECT COUNT(*) as cnt FROM "${t.name}"`, (err, r) => {
        results.push({ table: t.name, rows: r ? r.cnt : 'error' });
        done++;
        if (done === tables.length) {
          results.sort((a, b) => (b.rows || 0) - (a.rows || 0));
          console.log('Top tables by row count:');
          results.slice(0, 20).forEach(x => console.log(`  ${x.table}: ${x.rows.toLocaleString()}`));
        }
      });
    }
  });
  // DB file sizes
  const fs = require('fs');
  const files = ['portfolio.db', 'portfolio.db-wal', 'portfolio.db-shm', 'database.db', 'database.sqlite', 'nri_wealth.db', 'nri_wealthos.db'];
  console.log('\nDB file sizes:');
  for (const f of files) {
    try { const s = fs.statSync(`./${f}`); console.log(`  ${f}: ${(s.size / 1024 / 1024).toFixed(1)} MB`); } catch {}
  }
  // Page count and size
  db.get('PRAGMA page_count', (e, r) => r && console.log(`\npage_count: ${r.page_count}`));
  db.get('PRAGMA page_size', (e, r) => r && console.log(`page_size: ${r.page_size}`));
  db.get('PRAGMA freelist_count', (e, r) => r && console.log(`freelist (wasted pages): ${r.freelist_count}`));
  db.get('PRAGMA wal_checkpoint', (e, r) => r && console.log(`wal_checkpoint result:`, JSON.stringify(r)));
});
setTimeout(() => db.close(() => console.log('done')), 5000);
