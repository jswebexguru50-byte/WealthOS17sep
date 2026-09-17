const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./portfolio.db');

db.all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('strategy_scan_cache', 'strategy_scan_metadata')", (err, rows) => {
  if (err) {
    console.error('Error checking tables:', err);
  } else {
    console.log('Tables found:', rows.map(r => r.name).join(', '));

    // Check schema of strategy_scan_cache
    if (rows.some(r => r.name === 'strategy_scan_cache')) {
      db.all("PRAGMA table_info(strategy_scan_cache)", (err, cols) => {
        if (err) console.error(err);
        else {
          console.log('\nstrategy_scan_cache columns:');
          cols.forEach(c => console.log('  -', c.name, ':', c.type));
        }

        // Check schema of strategy_scan_metadata
        db.all("PRAGMA table_info(strategy_scan_metadata)", (err, cols) => {
          if (err) console.error(err);
          else {
            console.log('\nstrategy_scan_metadata columns:');
            cols.forEach(c => console.log('  -', c.name, ':', c.type));
          }

          // Check indexes
          db.all("SELECT name FROM sqlite_master WHERE type='index' AND (name LIKE '%scan%')", (err, indexes) => {
            if (err) console.error(err);
            else {
              console.log('\nIndexes created:');
              indexes.forEach(idx => console.log('  -', idx.name));
            }
            db.close();
          });
        });
      });
    } else {
      db.close();
    }
  }
});
