const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.resolve('portfolio.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

function all(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql) {
  return new Promise((resolve, reject) => {
    db.get(sql, [], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function inspectColumns() {
  const tables = ['DailyOHLCV', 'HistoricalPrices', 'CorporateActions', 'HistoricalFinancialStatements', 'HistoricalShareholdingPattern'];
  for (const t of tables) {
    const cols = await all(`PRAGMA table_info("${t}")`);
    console.log(`Table ${t} columns:`, cols.map(c => c.name).join(', '));
  }
  db.close();
}

inspectColumns().catch(console.error);
