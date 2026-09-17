/**
 * db_optimize.cjs
 * Phase 2: Database Optimization
 * - WAL checkpoint + VACUUM to defragment and reclaim space
 * - Apply high-performance PRAGMAs
 * - Move stale root-level backup DBs to backups/ folder
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, 'portfolio.db');
const BACKUPS_DIR = path.join(ROOT, 'backups');

async function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function optimizeDB() {
  console.log('\n=== Phase 2: Database Optimization ===\n');

  // Step 1: Move old root-level backup DBs to backups/ folder
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    console.log('Created backups/ directory');
  }

  const rootFiles = fs.readdirSync(ROOT);
  const backupDbs = rootFiles.filter(f =>
    f !== 'portfolio.db' &&
    f !== 'portfolio_exact_replica.db' &&
    (f.includes('backup') || f.includes('persistent')) &&
    (f.endsWith('.db') || f.endsWith('.db-shm') || f.endsWith('.db-wal'))
  );

  for (const f of backupDbs) {
    const src = path.join(ROOT, f);
    const dst = path.join(BACKUPS_DIR, f);
    if (!fs.existsSync(dst)) {
      fs.renameSync(src, dst);
      console.log(`Moved ${f} → backups/`);
    } else {
      fs.unlinkSync(src);
      console.log(`Deleted duplicate ${f} (already in backups/)`);
    }
  }

  // Step 2: Delete .bak files from src/server/
  const bakFile = path.join(ROOT, 'src', 'server', 'yahooFinance.ts.bak');
  if (fs.existsSync(bakFile)) {
    fs.unlinkSync(bakFile);
    console.log('Deleted yahooFinance.ts.bak');
  }

  // Step 3: Remove excel file from src/components/ 
  const xlsxFile = path.join(ROOT, 'src', 'components', 'holdings-PSI722 (2).xlsx');
  if (fs.existsSync(xlsxFile)) {
    fs.unlinkSync(xlsxFile);
    console.log('Deleted holdings-PSI722 (2).xlsx from components/');
  }

  // Step 4: Report DB state before
  const beforeSize = fs.statSync(DB_PATH).size;
  console.log(`\nDB size before: ${Math.round(beforeSize / 1048576)} MB`);

  // Step 5: Open DB and run optimizations
  const db = new sqlite3.Database(DB_PATH);

  // WAL checkpoint first
  await run(db, 'PRAGMA wal_checkpoint(TRUNCATE)');
  console.log('WAL checkpoint complete');

  // Apply performance PRAGMAs
  await run(db, 'PRAGMA journal_mode=WAL');
  await run(db, 'PRAGMA synchronous=NORMAL');
  await run(db, 'PRAGMA busy_timeout=10000');
  await run(db, 'PRAGMA cache_size=-32000');      // 32MB page cache
  await run(db, 'PRAGMA temp_store=MEMORY');       // temp tables in RAM
  await run(db, 'PRAGMA mmap_size=268435456');     // 256MB memory-mapped I/O
  console.log('PRAGMAs applied');

  // Ensure all critical indexes exist
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_txns_port_isin_date ON Transactions(portfolio, isin, date)',
    'CREATE INDEX IF NOT EXISTS idx_txn_portfolio ON Transactions(portfolio)',
    'CREATE INDEX IF NOT EXISTS idx_txn_symbol ON Transactions(symbol, portfolio)',
    'CREATE INDEX IF NOT EXISTS idx_txn_isin ON Transactions(isin, portfolio)',
    'CREATE INDEX IF NOT EXISTS idx_holdings_port ON Holdings(portfolio)',
    'CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON Holdings(symbol)',
    'CREATE INDEX IF NOT EXISTS idx_holdings_isin ON Holdings(isin)',
    'CREATE INDEX IF NOT EXISTS idx_holdings_port_isin ON Holdings(portfolio, isin)',
    'CREATE INDEX IF NOT EXISTS idx_hist_prices_sym_date ON HistoricalPrices(symbol, date)',
    'CREATE INDEX IF NOT EXISTS idx_hist_symbol ON HistoricalPrices(symbol)',
    'CREATE INDEX IF NOT EXISTS idx_master_isin_symbol ON MasterTickers(isin, symbol)',
    'CREATE INDEX IF NOT EXISTS idx_mt_symbol ON MasterTickers(symbol)',
    'CREATE INDEX IF NOT EXISTS idx_mt_isin ON MasterTickers(isin)',
    'CREATE INDEX IF NOT EXISTS idx_history_date_port ON PortfolioHistory(date, portfolio)',
    'CREATE INDEX IF NOT EXISTS idx_realized_gains_port ON RealizedGains(portfolio)',
    'CREATE INDEX IF NOT EXISTS idx_realized_gains_isin ON RealizedGains(isin)',
    'CREATE INDEX IF NOT EXISTS idx_corporate_actions_isin ON CorporateActions(isin)',
    'CREATE INDEX IF NOT EXISTS idx_ca_audit_port_date ON CorporateActionAudit(portfolio, date)',
  ];
  for (const idx of indexes) {
    await run(db, idx);
  }
  console.log('Indexes verified/created');

  // ANALYZE to refresh query planner statistics
  await run(db, 'ANALYZE');
  console.log('ANALYZE complete');

  // VACUUM to defragment and reclaim free pages
  console.log('Running VACUUM (this may take 30-60 seconds for large DBs)...');
  await new Promise((resolve, reject) => {
    db.run('VACUUM', (err) => {
      if (err) reject(err);
      else resolve(null);
    });
  });
  console.log('VACUUM complete');

  // Final WAL checkpoint after VACUUM
  await run(db, 'PRAGMA wal_checkpoint(TRUNCATE)');

  await new Promise(r => db.close(r));

  const afterSize = fs.statSync(DB_PATH).size;
  const saved = Math.round((beforeSize - afterSize) / 1024);
  console.log(`\nDB size after: ${Math.round(afterSize / 1048576)} MB`);
  console.log(`Space reclaimed: ${saved > 0 ? saved + ' KB' : '0 KB (already clean)'}`);
  console.log('\n✅ Database optimization complete!\n');
}

optimizeDB().catch(e => { console.error('DB optimization failed:', e); process.exit(1); });
