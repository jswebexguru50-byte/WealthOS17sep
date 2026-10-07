-- PROPOSED, NOT APPLIED. Review each block, run diagnose_db.sql first, apply on a COPY of portfolio.db, compare EXPLAIN QUERY PLAN before/after.
-- Derived from schema.sql (schema.sql dated 2026-09-25, 159 indexes). Names may differ in the live DB: confirm with
--   SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index';

BEGIN;

-- ── A. EXACT DUPLICATES (same table, same columns) — safe to drop one of each pair ─────────────
-- HistoricalPrices(symbol,date) exists 3 times (+ a 4th as (symbol, date DESC)); this is the ~5M-row table.
DROP INDEX IF EXISTS idx_hist_symbol;
DROP INDEX IF EXISTS idx_historical_prices_sym_date;      -- keep idx_hist_prices_sym_date (SQLite scans it backward for DESC)
DROP INDEX IF EXISTS idx_ca_isin_recdate;                 -- keep idx_ca_isin_date
DROP INDEX IF EXISTS idx_daily_ohlcv_sym_date;            -- keep idx_daily_ohlcv_sym
DROP INDEX IF EXISTS idx_rg_isin;                         -- keep idx_realized_gains_isin
DROP INDEX IF EXISTS idx_mt_isin;                         -- keep idx_master_isin   (see B for further merge)
DROP INDEX IF EXISTS idx_mt_symbol;                       -- keep idx_master_symbol
DROP INDEX IF EXISTS idx_txns_symbol;                     -- keep idx_tx_symbol  (see B)
DROP INDEX IF EXISTS idx_txns_port_isin_date;             -- keep idx_txn_port_isin_date
DROP INDEX IF EXISTS idx_dq_audit_status;  DROP INDEX IF EXISTS idx_dq_audit_symbol;
DROP INDEX IF EXISTS idx_sync_drift_status; DROP INDEX IF EXISTS idx_sync_drift_symbol;

-- ── B. LEFT-PREFIX REDUNDANT (a wider index already serves the same lookups) ───────────────────
DROP INDEX IF EXISTS idx_txn_portfolio;           -- covered by (portfolio,date) / (portfolio,isin,date) / (portfolio,symbol,date)
DROP INDEX IF EXISTS idx_tx_symbol;               -- covered by idx_txn_symbol(symbol,portfolio)
DROP INDEX IF EXISTS idx_tx_isin;                 -- covered by idx_txn_isin(isin,portfolio)
DROP INDEX IF EXISTS idx_holdings_port;           -- covered by (portfolio,isin)/(portfolio,symbol)/(portfolio,holding_type)
DROP INDEX IF EXISTS idx_master_isin;             -- covered by idx_master_isin_symbol(isin,symbol)
DROP INDEX IF EXISTS idx_realized_gains_port;     -- covered by idx_rg_port_isin / idx_rg_port_sell_date
DROP INDEX IF EXISTS idx_corporate_actions_isin;  -- covered by idx_ca_isin_date
DROP INDEX IF EXISTS idx_ca_symbol;               -- covered by idx_ca_sym_date
DROP INDEX IF EXISTS idx_daily_ohlcv_symbol;      -- covered by idx_daily_ohlcv_sym
DROP INDEX IF EXISTS idx_hist_fin_sym;            -- covered by idx_hist_fin_stmt
DROP INDEX IF EXISTS idx_scan_cache_scan_id;      -- covered by idx_strat_cache_lookup

-- ── C. LOW-CARDINALITY SINGLE-COLUMN INDEXES (planner rarely uses; each costs a write per row) ──
DROP INDEX IF EXISTS idx_tx_type;                 -- also prefix-covered by idx_txn_type_port
DROP INDEX IF EXISTS idx_tx_source;
DROP INDEX IF EXISTS idx_tx_is_cash_flow;         -- replaced by partial index in D
DROP INDEX IF EXISTS idx_holdings_data_status;
DROP INDEX IF EXISTS idx_holdings_holding_type;   -- keep (portfolio, holding_type)
DROP INDEX IF EXISTS idx_holdings_price_authority;
DROP INDEX IF EXISTS idx_master_exchange;
DROP INDEX IF EXISTS idx_ca_action_type;
-- idx_ca_applied: replaced by partial index in D.   Small tables (Portfolios.status/type) are harmless, leave.
DROP INDEX IF EXISTS idx_ca_applied;

-- ── D. ADD (targets the dashboard hot path) ────────────────────────────────────────────────────
-- D1. Dashboard "realized gains by portfolio/isin/symbol" does a whole-table GROUP BY. A covering index lets SQLite
--     aggregate without touching table rows. Replaces idx_rg_port_isin (superset).
DROP INDEX IF EXISTS idx_rg_port_isin;
CREATE INDEX IF NOT EXISTS idx_rg_cover ON RealizedGains(portfolio, isin, symbol, realized_pnl, sell_proceeds);

-- D2. "symbol IN (...) AND net_amount != 0 ORDER BY date": avoid the sort + table lookups.
CREATE INDEX IF NOT EXISTS idx_tx_symbol_date_cover ON Transactions(symbol, date, portfolio, type, net_amount);

-- D3. UPPER(type) IN (...) defeats a plain index on type (29 call sites use UPPER(...)). Either normalise `type` on write
--     (normalize_tx_types.cjs already exists) and drop UPPER() in queries, or use an expression index:
CREATE INDEX IF NOT EXISTS idx_tx_utype_port ON Transactions(UPPER(type), portfolio);

-- D4. Partial indexes for the common "flag = 1/0" filters instead of full low-cardinality indexes.
CREATE INDEX IF NOT EXISTS idx_tx_cashflow_port_date ON Transactions(portfolio, date) WHERE is_cash_flow = 1;
CREATE INDEX IF NOT EXISTS idx_ca_unapplied          ON CorporateActions(symbol, record_date) WHERE applied = 0;

COMMIT;

-- ── E. STATISTICS (the single cheapest win; nothing in the codebase ever runs ANALYZE) ─────────
PRAGMA analysis_limit = 1000;   -- sampled, fast on big tables
ANALYZE;
PRAGMA optimize;
-- Then on every connection open:  PRAGMA optimize=0x10002;   and on graceful shutdown:  PRAGMA optimize;

-- ── F. RECLAIM SPACE after dropping indexes (offline, needs free disk >= DB size; the DB is ~3.4 GB) ──
-- VACUUM INTO 'portfolio.compact.db';   -- then swap files with the app stopped

-- Rollback note: every DROP above can be recreated from schema.sql; keep a copy of that file with the DB backup.
