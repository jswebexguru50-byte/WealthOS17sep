import sqlite3 from 'sqlite3';
import { resolve } from 'path';

const dbPath = resolve(process.cwd(), 'portfolio.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
});

const duplicateIndexes = [
  // A. Exact Duplicates
  'idx_hist_symbol',
  'idx_historical_prices_sym_date',
  'idx_ca_isin_recdate',
  'idx_daily_ohlcv_sym_date',
  'idx_rg_isin',
  'idx_mt_isin',
  'idx_mt_symbol',
  'idx_txns_symbol',
  'idx_txns_port_isin_date',
  'idx_dq_audit_status',
  'idx_dq_audit_symbol',
  'idx_sync_drift_status',
  'idx_sync_drift_symbol',
  // B. Left-prefix redundant
  'idx_txn_portfolio',
  'idx_tx_symbol',
  'idx_tx_isin',
  'idx_holdings_port',
  'idx_master_isin',
  'idx_realized_gains_port',
  'idx_corporate_actions_isin',
  'idx_ca_symbol',
  'idx_daily_ohlcv_symbol',
  'idx_hist_fin_sym',
  'idx_scan_cache_scan_id'
];

function run(sql) {
  return new Promise((res, rej) => {
    db.run(sql, (err) => (err ? rej(err) : res()));
  });
}

function all(sql) {
  return new Promise((res, rej) => {
    db.all(sql, (err, rows) => (err ? rej(err) : res(rows)));
  });
}

async function main() {
  console.log(`Analyzing database indexes on ${dbPath}...`);
  const existing = await all("SELECT name, tbl_name FROM sqlite_master WHERE type='index'");
  const existingNames = new Set(existing.map(r => r.name));
  console.log(`Total existing indexes before cleanup: ${existing.length}`);

  let droppedCount = 0;
  for (const name of duplicateIndexes) {
    if (existingNames.has(name)) {
      try {
        await run(`DROP INDEX IF EXISTS ${name};`);
        console.log(`  [DROPPED] Redundant/duplicate index: ${name}`);
        droppedCount++;
      } catch (e) {
        console.warn(`  [FAILED] Could not drop ${name}:`, e.message);
      }
    }
  }

  console.log(`\nDropped ${droppedCount} redundant indexes.`);

  // Hot-path covering indexes (from section D of Claude review)
  const additions = [
    'CREATE INDEX IF NOT EXISTS idx_rg_cover ON RealizedGains(portfolio, isin, symbol, realized_pnl, sell_proceeds);',
    'CREATE INDEX IF NOT EXISTS idx_tx_symbol_date_cover ON Transactions(symbol, date, portfolio, type, net_amount);',
    'CREATE INDEX IF NOT EXISTS idx_tx_cashflow_port_date ON Transactions(portfolio, date) WHERE is_cash_flow = 1;',
    'CREATE INDEX IF NOT EXISTS idx_ca_unapplied ON CorporateActions(symbol, record_date) WHERE applied = 0;'
  ];

  for (const sql of additions) {
    try {
      await run(sql);
      console.log(`  [ADDED] Optimized hot-path index: ${sql.split(' ')[5]}`);
    } catch (e) {
      console.warn(`  [WARN] Failed to create index:`, e.message);
    }
  }

  console.log('\nRunning sampled ANALYZE and PRAGMA optimize...');
  await run('PRAGMA analysis_limit = 1000;');
  await run('ANALYZE;');
  await run('PRAGMA optimize;');
  console.log('Database index optimization and statistics refresh completed successfully.');

  const remaining = await all("SELECT name FROM sqlite_master WHERE type='index'");
  console.log(`Total active indexes after cleanup: ${remaining.length}`);

  db.close();
}

main().catch(err => {
  console.error(err);
  db.close();
  process.exit(1);
});
