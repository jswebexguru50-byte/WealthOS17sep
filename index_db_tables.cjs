/**
 * index_db_tables.cjs
 * Creates comprehensive high-performance indexes on all tables and runs SQLite ANALYZE
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'portfolio.db');
console.log(`[DB Indexer] Opening database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
});

const indexStatements = [
  // ── Transactions ─────────────────────────────────────────────────────────────
  'CREATE INDEX IF NOT EXISTS idx_tx_portfolio_date ON Transactions(portfolio, date)',
  'CREATE INDEX IF NOT EXISTS idx_tx_date ON Transactions(date)',
  'CREATE INDEX IF NOT EXISTS idx_tx_isin ON Transactions(isin)',
  'CREATE INDEX IF NOT EXISTS idx_tx_symbol ON Transactions(symbol)',
  'CREATE INDEX IF NOT EXISTS idx_tx_type ON Transactions(type)',
  'CREATE INDEX IF NOT EXISTS idx_tx_folio ON Transactions(folio)',
  'CREATE INDEX IF NOT EXISTS idx_tx_is_cash_flow ON Transactions(is_cash_flow)',
  'CREATE INDEX IF NOT EXISTS idx_tx_batch_id ON Transactions(batch_id)',
  'CREATE INDEX IF NOT EXISTS idx_tx_port_sym_date ON Transactions(portfolio, symbol, date)',

  // ── Holdings ─────────────────────────────────────────────────────────────────
  'CREATE INDEX IF NOT EXISTS idx_holdings_port_symbol ON Holdings(portfolio, symbol)',
  'CREATE INDEX IF NOT EXISTS idx_holdings_port_isin ON Holdings(portfolio, isin)',
  'CREATE INDEX IF NOT EXISTS idx_holdings_isin ON Holdings(isin)',
  'CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON Holdings(symbol)',
  'CREATE INDEX IF NOT EXISTS idx_holdings_is_sold ON Holdings(is_sold)',
  'CREATE INDEX IF NOT EXISTS idx_holdings_data_status ON Holdings(data_status)',
  'CREATE INDEX IF NOT EXISTS idx_holdings_folio ON Holdings(folio)',

  // ── MasterTickers ────────────────────────────────────────────────────────────
  'CREATE INDEX IF NOT EXISTS idx_master_isin ON MasterTickers(isin)',
  'CREATE INDEX IF NOT EXISTS idx_master_symbol ON MasterTickers(symbol)',
  'CREATE INDEX IF NOT EXISTS idx_master_exchange ON MasterTickers(exchange)',
  'CREATE INDEX IF NOT EXISTS idx_master_sector ON MasterTickers(sector)',

  // ── CorporateActions ─────────────────────────────────────────────────────────
  'CREATE INDEX IF NOT EXISTS idx_ca_isin_recdate ON CorporateActions(isin, record_date)',
  'CREATE INDEX IF NOT EXISTS idx_ca_symbol ON CorporateActions(symbol)',
  'CREATE INDEX IF NOT EXISTS idx_ca_applied ON CorporateActions(applied)',

  // ── RealizedGains ────────────────────────────────────────────────────────────
  'CREATE INDEX IF NOT EXISTS idx_rg_port_fy ON RealizedGains(portfolio, fy)',
  'CREATE INDEX IF NOT EXISTS idx_rg_isin ON RealizedGains(isin)',
  'CREATE INDEX IF NOT EXISTS idx_rg_symbol ON RealizedGains(symbol)',
  'CREATE INDEX IF NOT EXISTS idx_rg_sell_date ON RealizedGains(sell_date)',

  // ── TaxSummary ───────────────────────────────────────────────────────────────
  'CREATE INDEX IF NOT EXISTS idx_tax_port_fy ON TaxSummary(portfolio, fy)',

  // ── BankAccountsAndFDs ───────────────────────────────────────────────────────
  'CREATE INDEX IF NOT EXISTS idx_bank_port_status ON BankAccountsAndFDs(portfolio, status)',
  'CREATE INDEX IF NOT EXISTS idx_bank_currency ON BankAccountsAndFDs(currency)',
  'CREATE INDEX IF NOT EXISTS idx_bank_maturity ON BankAccountsAndFDs(maturity_date)',

  // ── PortfolioHistory ─────────────────────────────────────────────────────────
  'CREATE INDEX IF NOT EXISTS idx_ph_port_date ON PortfolioHistory(portfolio, date)',

  // ── AssetScripMappings & UserMappings ────────────────────────────────────────
  'CREATE INDEX IF NOT EXISTS idx_scrip_raw ON AssetScripMappings(raw_symbol)',
  'CREATE INDEX IF NOT EXISTS idx_scrip_mapped ON AssetScripMappings(mapped_symbol)',
  'CREATE INDEX IF NOT EXISTS idx_user_mappings_raw ON UserMappings(raw_symbol)',

  // ── CamsSummaryHoldings ──────────────────────────────────────────────────────
  'CREATE INDEX IF NOT EXISTS idx_cams_port_isin ON CamsSummaryHoldings(portfolio, isin)',

  // ── Audit & Change Logs ──────────────────────────────────────────────────────
  'CREATE INDEX IF NOT EXISTS idx_audit_table_time ON DataChangeLog(table_name, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_action_history_time ON ActionHistory(timestamp)'
];

db.serialize(() => {
  db.run('PRAGMA busy_timeout=15000;');
  console.log(`[DB Indexer] Creating ${indexStatements.length} optimized database indexes...`);

  let count = 0;
  for (const sql of indexStatements) {
    db.run(sql, (err) => {
      if (err) {
        console.warn(`[DB Indexer] Warning executing "${sql}":`, err.message);
      } else {
        count++;
      }
    });
  }

  // Run ANALYZE to populate sqlite_stat1 so SQLite query optimizer uses indexes with full precision
  console.log('[DB Indexer] Running PRAGMA optimize & ANALYZE...');
  db.run('ANALYZE;', (err) => {
    if (err) console.warn('[DB Indexer] ANALYZE warning:', err.message);
    else console.log('[DB Indexer] ANALYZE completed successfully.');
  });

  db.run('PRAGMA optimize;', (err) => {
    if (err) console.warn('[DB Indexer] PRAGMA optimize warning:', err.message);
    else console.log('[DB Indexer] PRAGMA optimize completed.');
  });

  // Query and list all active indexes
  db.all("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name", (err, rows) => {
    if (err) {
      console.error('Error fetching indexes:', err);
    } else {
      console.log(`\n=== Total Active Database Indexes: ${rows.length} ===`);
      rows.forEach(r => console.log(` - Table: ${r.tbl_name.padEnd(22)} | Index: ${r.name}`));
    }
    db.close(() => {
      console.log('\n[DB Indexer] Database indexing and optimization finished successfully.');
    });
  });
});
