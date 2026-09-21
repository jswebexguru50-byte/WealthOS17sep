const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../');
const DB_PATH = path.join(ROOT, 'portfolio.db');

function run() {
  const db = new Database(DB_PATH, { readonly: true });
  const records = db.prepare("SELECT symbol, exchange, segment, upstox_key_nse FROM MasterTickers WHERE status = 'ACTIVE'").all();
  
  const profile = {};
  
  for (const row of records) {
    const exch = row.exchange || 'UNKNOWN';
    const seg = row.segment || 'UNKNOWN';
    const isNumeric = /^\d+$/.test(row.symbol) ? 'numeric' : 'nonnumeric';
    
    let prefix = 'NONE';
    if (row.upstox_key_nse) {
      prefix = row.upstox_key_nse.split('|')[0] || 'NONE';
    }
    
    const key = `${exch} | ${isNumeric} | ${seg} | ${prefix}`;
    if (!profile[key]) profile[key] = 0;
    profile[key]++;
  }
  
  db.close();
  
  console.log("MasterTickers Profile (Active Symbols Only):");
  console.log("EXCHANGE | SYMBOL_PATTERN | SEGMENT | PREFIX => COUNT");
  console.log("-----------------------------------------------------");
  
  const sorted = Object.entries(profile).sort((a, b) => b[1] - a[1]);
  for (const [k, count] of sorted) {
    console.log(`${k.padEnd(40, ' ')} => ${count}`);
  }
}

run();
