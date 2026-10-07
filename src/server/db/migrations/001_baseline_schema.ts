import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { Migration } from '../migrator.js';

/**
 * src/server/db/migrations/001_baseline_schema.ts
 *
 * Migration 001: Baseline schema for WealthOS.
 * Captures foundational tables, constraints, and indexes idempotently.
 */

const BASELINE_SQL = `
  CREATE TABLE IF NOT EXISTS Portfolios (
    name TEXT PRIMARY KEY,
    type TEXT DEFAULT 'DEMAT',
    status TEXT DEFAULT 'ACTIVE',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    base_currency TEXT DEFAULT 'INR'
  );

  CREATE TABLE IF NOT EXISTS MasterTickers (
    isin TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT,
    exchange TEXT DEFAULT 'NSE',
    sector TEXT,
    industry TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS Holdings (
    portfolio TEXT NOT NULL,
    isin TEXT NOT NULL,
    folio TEXT DEFAULT 'NA',
    symbol TEXT NOT NULL,
    quantity REAL NOT NULL,
    avg_buy_price REAL NOT NULL,
    total_cost REAL NOT NULL,
    ltp REAL DEFAULT 0,
    prev_close REAL DEFAULT 0,
    current_value REAL DEFAULT 0,
    unrealized_pnl REAL DEFAULT 0,
    unrealized_pct REAL DEFAULT 0,
    day_change REAL DEFAULT 0,
    day_change_pct REAL DEFAULT 0,
    data_source TEXT,
    last_update TEXT,
    data_status TEXT DEFAULT 'LIVE',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    currency TEXT DEFAULT 'INR',
    native_ltp REAL DEFAULT 0,
    native_current_value REAL DEFAULT 0,
    native_total_cost REAL DEFAULT 0,
    native_avg_buy_price REAL DEFAULT 0,
    native_unrealized_pnl REAL DEFAULT 0,
    native_prev_close REAL,
    tax_cost_basis REAL DEFAULT NULL,
    tax_avg_price REAL DEFAULT NULL,
    holding_type TEXT DEFAULT 'EQUITY',
    member_id INTEGER,
    price_authority TEXT,
    acquisition_fx_rate REAL DEFAULT 1.0,
    PRIMARY KEY (portfolio, isin, symbol, folio)
  );

  CREATE TABLE IF NOT EXISTS Transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio TEXT NOT NULL,
    symbol TEXT NOT NULL,
    isin TEXT,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    net_amount REAL NOT NULL,
    source TEXT,
    notes TEXT,
    is_cash_flow INTEGER DEFAULT 1,
    is_ca INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS DashboardDiskCache (
    cache_key TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS RealizedGains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio TEXT NOT NULL,
    isin TEXT,
    symbol TEXT NOT NULL,
    sell_date TEXT,
    quantity REAL,
    sell_price REAL,
    sell_proceeds REAL,
    buy_date TEXT,
    buy_price REAL,
    cost_basis REAL,
    realized_pnl REAL,
    term TEXT,
    financial_year TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS DailyPortfolioSnapshot (
    portfolio TEXT NOT NULL,
    date TEXT NOT NULL,
    market_value REAL NOT NULL,
    total_cost REAL NOT NULL,
    snapshot_type TEXT DEFAULT 'EOD_CLOSE',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (portfolio, date)
  );

  CREATE TABLE IF NOT EXISTS PortfolioHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio TEXT NOT NULL,
    date TEXT NOT NULL,
    market_value REAL,
    total_cost REAL,
    xirr REAL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS PmsReconciliationBaseline (
    portfolio TEXT PRIMARY KEY,
    initial_cash_deposits REAL DEFAULT 0,
    in_kind_market_val REAL DEFAULT 0,
    cash_in_hand REAL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS CustomScripMappings (
    raw_scrip_name TEXT PRIMARY KEY,
    mapped_symbol TEXT NOT NULL,
    mapped_isin TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_dash_disk_cache_key ON DashboardDiskCache(cache_key);
  CREATE INDEX IF NOT EXISTS idx_holdings_isin ON Holdings(isin);
  CREATE INDEX IF NOT EXISTS idx_holdings_port ON Holdings(portfolio);
  CREATE INDEX IF NOT EXISTS idx_tx_port_date ON Transactions(portfolio, date);
  CREATE INDEX IF NOT EXISTS idx_tx_sym_date ON Transactions(symbol, date);
  CREATE INDEX IF NOT EXISTS idx_realized_port ON RealizedGains(portfolio);
`;

const checksum = crypto.createHash('sha256').update(BASELINE_SQL.trim()).digest('hex');

export const migration001: Migration = {
  id: 1,
  name: '001_baseline_schema',
  checksum,
  up: (db: any) => {
    const rawDb = db.db || db;
    rawDb.exec(BASELINE_SQL);
  }
};
