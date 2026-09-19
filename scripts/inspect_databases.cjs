const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbs = ['portfolio.db', 'database.sqlite', 'intraday_history.db', 'database.db', 'nri_wealthos.db'];

async function inspectDb(dbName) {
  const dbPath = path.resolve(dbName);
  if (!fs.existsSync(dbPath)) {
    return;
  }
  const sizeMB = (fs.statSync(dbPath).size / (1024 * 1024)).toFixed(1);
  console.log(`\n=== DB: ${dbName} (${sizeMB} MB) ===`);

  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.log(`  Error opening: ${err.message}`);
        return resolve();
      }
      db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], async (err, tables) => {
        if (err) {
          console.log(`  Error querying tables: ${err.message}`);
          db.close();
          return resolve();
        }
        for (const t of tables) {
          await new Promise((resT) => {
            db.get(`SELECT count(*) as c FROM "${t.name}"`, [], (err, row) => {
              if (err) {
                console.log(`  - Table: ${t.name} (Error: ${err.message})`);
              } else {
                console.log(`  - Table: ${t.name} (Rows: ${row.c})`);
              }
              resT();
            });
          });
        }
        db.close();
        resolve();
      });
    });
  });
}

async function main() {
  for (const dbName of dbs) {
    await inspectDb(dbName);
  }
}

main();
