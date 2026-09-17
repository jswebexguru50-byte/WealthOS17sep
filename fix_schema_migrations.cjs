const sqlite3 = require('./node_modules/sqlite3').verbose();
const db = new sqlite3.Database('./portfolio.db');

const migrations = [];

function checkColumn(table, column) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) { resolve(false); return; }
      resolve(rows && rows.some(r => r.name === column));
    });
  });
}

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function main() {
  const tablesToCheck = [
    { table: 'options_chain_snapshot', column: 'as_of_date', type: "TEXT", defaultVal: null, fromCol: 'as_of_timestamp' },
    { table: 'derived_options_metrics', column: 'as_of_date', type: "TEXT NOT NULL DEFAULT ''", defaultVal: null, fromCol: null },
    { table: 'FundamentalsSnapshot', column: 'as_of_date', type: "TEXT NOT NULL DEFAULT ''", defaultVal: null, fromCol: null },
    { table: 'leading_indicator_series', column: 'as_of_date', type: "TEXT", defaultVal: null, fromCol: null },
    { table: 'portfolio_risk_snapshots', column: 'as_of_date', type: "TEXT", defaultVal: null, fromCol: null },
  ];

  for (const { table, column, type, fromCol } of tablesToCheck) {
    // Check if table exists
    const tableExists = await new Promise(resolve => {
      db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table], (err, row) => {
        resolve(!err && !!row);
      });
    });

    if (!tableExists) {
      console.log(`Table ${table} doesn't exist yet — will be created by server`);
      continue;
    }

    const hasCol = await checkColumn(table, column);
    if (!hasCol) {
      console.log(`Adding ${column} to ${table}...`);
      try {
        await runSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        if (fromCol) {
          // Copy data from old column
          await runSql(`UPDATE ${table} SET ${column} = ${fromCol} WHERE ${column} IS NULL OR ${column} = ''`);
          console.log(`  Copied data from ${fromCol}`);
        }
        console.log(`  Done.`);
      } catch (e) {
        console.error(`  Error: ${e.message}`);
      }
    } else {
      console.log(`${table}.${column} already exists — OK`);
    }
  }

  db.close(() => console.log('Migration complete.'));
}

main().catch(console.error);
