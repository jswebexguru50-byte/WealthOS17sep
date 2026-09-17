const sqlite3 = require('sqlite3');
const path = require('path');

const DB_FILE = path.join(process.cwd(), 'portfolio.db');
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }

  db.all(
    `SELECT id, parameters_json FROM CustomStrategies WHERE is_preset = 1 LIMIT 1`,
    (err, rows) => {
      if (err) {
        console.error('Query error:', err);
      } else {
        console.log('Found preset:', rows[0]?.id);
        console.log('Parameters (first 200 chars):', rows[0]?.parameters_json?.substring(0, 200));
        console.log('Parameters type:', typeof rows[0]?.parameters_json);

        // Try to parse
        try {
          const params = JSON.parse(rows[0]?.parameters_json);
          console.log('Parsed successfully! Keys:', Object.keys(params));
        } catch (e) {
          console.error('Parse error:', e.message);
        }
      }
      db.close();
      process.exit(0);
    }
  );
});
