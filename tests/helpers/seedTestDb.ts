/**
 * WealthOS Test Helpers — In-Memory Database Seeder
 * Creates a controlled test database with production-equivalent schema
 * for unit tests that require destructive operations.
 */
import sqlite3 from 'sqlite3';

function runSql(db: sqlite3.Database, sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (this: sqlite3.RunResult, err: Error | null) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function allSql<T = any>(db: sqlite3.Database, sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });
}

function getSql<T = any>(db: sqlite3.Database, sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });
}

export async function createTestDatabase(): Promise<sqlite3.Database> {
  const db = new sqlite3.Database(':memory:');

  // --- Entity & Multi-Tenant Domain ---
  await runSql(db, `CREATE TABLE Portfolios (
    portfolio TEXT PRIMARY KEY,
    owner_name TEXT NOT NULL,
    pan TEXT NOT NULL,
    broker_name TEXT,
    account_type TEXT DEFAULT 'DEMAT',
    is_nri INTEGER DEFAULT 0,
    currency TEXT DEFAULT 'INR',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await runSql(db, `CREATE TABLE FamilyGroups (
    group_id TEXT PRIMARY KEY,
    group_name TEXT NOT NULL,
    primary_pan TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // --- Core Ledger ---
  await runSql(db, `CREATE TABLE Transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    portfolio TEXT NOT NULL REFERENCES Portfolios(portfolio),
    type TEXT NOT NULL,
    isin TEXT NOT NULL,
    symbol TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    gross_amount REAL NOT NULL,
    brokerage REAL DEFAULT 0,
    stt_tax REAL DEFAULT 0,
    net_amount REAL NOT NULL,
    source TEXT,
    broker_name TEXT,
    folio TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await runSql(db, `CREATE INDEX idx_txn_port_isin ON Transactions(portfolio, isin)`);
  await runSql(db, `CREATE INDEX idx_txn_date ON Transactions(date)`);

  await runSql(db, `CREATE TABLE Holdings (
    portfolio TEXT NOT NULL,
    isin TEXT NOT NULL,
    folio TEXT DEFAULT 'NA',
    symbol TEXT NOT NULL,
    quantity REAL NOT NULL,
    avg_buy_price REAL NOT NULL,
    total_cost REAL NOT NULL,
    ltp REAL DEFAULT 0,
    prev_close REAL DEFAULT 0,
    day_change REAL DEFAULT 0,
    day_change_pct REAL DEFAULT 0,
    current_value REAL DEFAULT 0,
    unrealized_pnl REAL DEFAULT 0,
    unrealized_pct REAL DEFAULT 0,
    data_source TEXT,
    data_status TEXT,
    last_update TEXT,
    currency TEXT DEFAULT 'INR',
    native_ltp REAL DEFAULT 0,
    native_current_value REAL DEFAULT 0,
    native_total_cost REAL DEFAULT 0,
    native_avg_buy_price REAL DEFAULT 0,
    native_unrealized_pnl REAL DEFAULT 0,
    holding_type TEXT DEFAULT 'EQUITY',
    price_authority TEXT,
    acquisition_fx_rate REAL DEFAULT 1.0,
    last_price_update TEXT,
    PRIMARY KEY (portfolio, isin, folio)
  )`);

  await runSql(db, `CREATE TABLE SoldStockRegistry (
    portfolio TEXT NOT NULL,
    isin TEXT NOT NULL,
    symbol TEXT NOT NULL,
    total_sold_quantity REAL NOT NULL,
    total_realized_proceeds REAL NOT NULL,
    total_cost_basis REAL NOT NULL,
    net_realized_pnl REAL NOT NULL,
    last_sold_date TEXT NOT NULL,
    PRIMARY KEY (portfolio, isin)
  )`);

  await runSql(db, `CREATE TABLE MasterTickers (
    isin TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT,
    company_name TEXT,
    exchange TEXT DEFAULT 'NSE',
    sector TEXT,
    industry TEXT,
    market_cap_category TEXT,
    yahoo_symbol TEXT,
    upstox_key TEXT,
    manual_ltp REAL DEFAULT 0,
    manual_ltp_date TEXT,
    is_active INTEGER DEFAULT 1
  )`);

  // --- Tax & Corporate Actions ---
  await runSql(db, `CREATE TABLE RealizedGains (
    match_id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio TEXT NOT NULL,
    pan TEXT DEFAULT '',
    isin TEXT NOT NULL,
    symbol TEXT NOT NULL,
    buy_date TEXT NOT NULL,
    sell_date TEXT NOT NULL,
    holding_period_days INTEGER,
    holding_days INTEGER,
    quantity REAL,
    matched_qty REAL,
    buy_price REAL NOT NULL,
    sell_price REAL NOT NULL,
    cost_basis REAL,
    buy_cost REAL,
    sale_consideration REAL,
    sell_proceeds REAL,
    realized_gain REAL,
    realized_pnl REAL,
    gain_type TEXT,
    tax_category TEXT,
    fmv_2018_01_31 REAL DEFAULT 0,
    fmv_31_jan_2018 REAL DEFAULT 0,
    grandfathered_cost REAL DEFAULT 0,
    taxable_pnl REAL DEFAULT 0,
    tax_rate REAL DEFAULT 0,
    estimated_tax REAL DEFAULT 0
  )`);
  await runSql(db, `CREATE INDEX idx_rg_pan_sell_date ON RealizedGains(pan, sell_date)`);

  await runSql(db, `CREATE TABLE TaxSummary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pan TEXT DEFAULT '',
    fy TEXT DEFAULT '',
    financial_year TEXT DEFAULT '',
    portfolio TEXT DEFAULT '',
    intraday_gains REAL DEFAULT 0,
    stcg_15_gains REAL DEFAULT 0,
    stcg_20_gains REAL DEFAULT 0,
    stcg_gains REAL DEFAULT 0,
    stcg_tax REAL DEFAULT 0,
    ltcg_10_gains REAL DEFAULT 0,
    ltcg_125_gains REAL DEFAULT 0,
    ltcg_gains REAL DEFAULT 0,
    ltcg_exemption REAL DEFAULT 0,
    ltcg_taxable REAL DEFAULT 0,
    ltcg_tax REAL DEFAULT 0,
    total_tax REAL DEFAULT 0,
    total_tax_liability REAL DEFAULT 0,
    dividends REAL DEFAULT 0,
    total_realized_pnl REAL DEFAULT 0,
    cfl_absorbed REAL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await runSql(db, `CREATE TABLE CarriedForwardLosses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pan TEXT NOT NULL,
    origin_ay TEXT NOT NULL,
    loss_type TEXT NOT NULL,
    original_amount REAL NOT NULL,
    remaining_unabsorbed REAL NOT NULL,
    expiry_ay TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await runSql(db, `CREATE TABLE CorporateActions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_date TEXT NOT NULL,
    ex_date TEXT NOT NULL,
    isin TEXT NOT NULL,
    symbol TEXT NOT NULL,
    action_type TEXT NOT NULL,
    numerator REAL NOT NULL,
    denominator REAL NOT NULL,
    dividend_per_share REAL DEFAULT 0,
    applied INTEGER DEFAULT 0,
    applied_date TEXT
  )`);

  await runSql(db, `CREATE TABLE CorporateActionAudit (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER,
    portfolio TEXT NOT NULL,
    date TEXT,
    isin TEXT NOT NULL,
    symbol TEXT,
    action_type TEXT,
    original_qty REAL DEFAULT 0,
    new_qty REAL DEFAULT 0,
    original_cost REAL DEFAULT 0,
    new_cost REAL DEFAULT 0,
    pre_quantity REAL DEFAULT 0,
    post_quantity REAL DEFAULT 0,
    pre_total_cost REAL DEFAULT 0,
    post_total_cost REAL DEFAULT 0,
    cost_variance REAL DEFAULT 0,
    sha256_hash TEXT DEFAULT '',
    message TEXT,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await runSql(db, `CREATE TABLE IF NOT EXISTS AppConfig (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // --- Infrastructure ---
  await runSql(db, `CREATE TABLE trading_calendar (
    date DATE PRIMARY KEY,
    market TEXT NOT NULL DEFAULT 'NSE',
    is_trading_day BOOLEAN NOT NULL,
    session_type TEXT DEFAULT 'FULL',
    holiday_name TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await runSql(db, `CREATE TABLE data_feed_status (
    feed_name TEXT NOT NULL,
    entity_key TEXT NOT NULL,
    state TEXT NOT NULL,
    last_updated_at TEXT NOT NULL,
    last_good_value TEXT,
    source TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    PRIMARY KEY (feed_name, entity_key)
  )`);

  await runSql(db, `CREATE TABLE IF NOT EXISTS CurrencyRates (
    currency TEXT PRIMARY KEY,
    rate_to_inr REAL NOT NULL,
    source TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await runSql(db, `INSERT OR IGNORE INTO CurrencyRates (currency, rate_to_inr, source) VALUES ('INR', 1.0, 'Base')`);
  await runSql(db, `INSERT OR IGNORE INTO CurrencyRates (currency, rate_to_inr, source) VALUES ('USD', 83.5, 'XE.com Live Spot Rate')`);
  await runSql(db, `INSERT OR IGNORE INTO CurrencyRates (currency, rate_to_inr, source) VALUES ('AED', 22.7, 'XE.com Live Spot Rate')`);

  await runSql(db, `CREATE TABLE IF NOT EXISTS CamsSummaryHoldings (
    portfolio TEXT NOT NULL,
    isin TEXT NOT NULL,
    folio TEXT DEFAULT 'NA',
    symbol TEXT NOT NULL,
    quantity REAL NOT NULL,
    nav REAL NOT NULL,
    value REAL NOT NULL,
    cost REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (portfolio, isin, folio)
  )`);

  await runSql(db, `CREATE TABLE IF NOT EXISTS HistoricalPrices (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    close_price REAL NOT NULL,
    data_source TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (symbol, date)
  )`);

  await runSql(db, `CREATE TABLE mutation_dedup_keys (
    dedup_key TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    response_payload TEXT
  )`);

  await runSql(db, `CREATE TABLE audit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp_utc TEXT NOT NULL,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    before_state TEXT,
    after_state TEXT,
    hash TEXT NOT NULL
  )`);

  await runSql(db, `CREATE TABLE CalibrationLedger (
    prediction_id TEXT PRIMARY KEY,
    strategy TEXT NOT NULL,
    ticker TEXT NOT NULL,
    predicted_prob REAL NOT NULL,
    predicted_outcome INTEGER,
    realized_outcome INTEGER,
    brier_score REAL,
    horizon_days INTEGER NOT NULL,
    evaluated_at TEXT
  )`);

  // --- Seed test portfolios ---
  await runSql(db, `INSERT INTO Portfolios (portfolio, owner_name, pan, broker_name) VALUES ('TestPF1', 'Test User A', 'AAAAA0001A', 'Zerodha')`);
  await runSql(db, `INSERT INTO Portfolios (portfolio, owner_name, pan, broker_name) VALUES ('TestPF2', 'Test User B', 'BBBBB0002B', 'HDFC Sky')`);
  await runSql(db, `INSERT INTO Portfolios (portfolio, owner_name, pan, broker_name, is_nri, currency) VALUES ('TestNRI', 'NRI User', 'CCCCC0003C', 'IBKR', 1, 'USD')`);

  // Seed master tickers
  await runSql(db, `INSERT INTO MasterTickers (isin, symbol, company_name, exchange, sector, market_cap_category) VALUES 
    ('INE001A01036', 'TESTSTOCK', 'Test Stock Ltd', 'NSE', 'Technology', 'LARGE'),
    ('INE002A01018', 'RELIANCE', 'Reliance Industries Ltd', 'NSE', 'Energy', 'LARGE'),
    ('INE009A01021', 'INFY', 'Infosys Ltd', 'NSE', 'Technology', 'LARGE')`);

  // Target Allocations table for Rebalancing Engine
  await runSql(db, `CREATE TABLE IF NOT EXISTS TargetAllocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id TEXT NOT NULL,
    model_name TEXT,
    asset_class TEXT NOT NULL,
    target_pct REAL NOT NULL,
    min_pct REAL,
    max_pct REAL,
    rebalance_tolerance_pct REAL DEFAULT 5.0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // Portfolio snapshots for drawdown tracking
  await runSql(db, `CREATE TABLE IF NOT EXISTS PortfolioSnapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio TEXT NOT NULL,
    as_of_date TEXT,
    current_drawdown_pct REAL DEFAULT 0,
    peak_value REAL,
    current_value REAL
  )`);

  return db;
}

export const dbRun = runSql;
export const dbAll = allSql;
export const dbGet = getSql;
export { runSql, allSql, getSql };
