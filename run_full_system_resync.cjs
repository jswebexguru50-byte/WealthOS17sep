const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function main() {
  const db = new sqlite3.Database('./portfolio.db');
  console.log("=== RUNNING FULL SYSTEM RE-SYNC & DUAL COST BASIS ===");

  // Load the built server or run full sync
  const server = require('./dist/server.cjs');
  console.log("Server modules loaded.");

  process.exit(0);
}

main().catch(console.error);
