-- ============================================================================
-- 012_phase2_pit_research_schema.sql
-- WEALTHOS / ITAS v6.3: PHASE 2 POINT-IN-TIME RESEARCH SCHEMA EXTENSIONS
-- ============================================================================

-- 1. Historical Investable Universe (Survivorship Bias Elimination)
CREATE TABLE IF NOT EXISTS historical_investable_universe (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  universe TEXT NOT NULL,
  effective_from TEXT NOT NULL, -- YYYY-MM-DD
  effective_to TEXT,            -- YYYY-MM-DD or NULL if currently active
  eligibility_status TEXT NOT NULL CHECK(eligibility_status IN ('ACTIVE', 'SUSPENDED', 'DELISTED')),
  transition_reason TEXT NOT NULL CHECK(transition_reason IN (
    'INITIAL_INCLUSION', 'REBALANCE_ADDITION', 'REBALANCE_REMOVAL',
    'DELISTING', 'CORPORATE_MERGER', 'SYMBOL_CHANGE'
  )),
  source TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  available_at TEXT NOT NULL,   -- ISO-8601 with timezone offset
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, universe, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_hiu_sym_dates ON historical_investable_universe(symbol, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_hiu_universe ON historical_investable_universe(universe);

-- 2. Authoritative Trading Calendar (Market Sessions & Operational Schedule)
CREATE TABLE IF NOT EXISTS authoritative_trading_calendar (
  date TEXT PRIMARY KEY,        -- YYYY-MM-DD
  market_open TEXT NOT NULL,    -- HH:MM:SS+OFFSET e.g. "09:15:00+05:30"
  market_close TEXT NOT NULL,   -- HH:MM:SS+OFFSET e.g. "15:30:00+05:30"
  tradable INTEGER NOT NULL CHECK(tradable IN (0, 1)),
  session_type TEXT NOT NULL CHECK(session_type IN (
    'REGULAR', 'MUHURAT', 'SPECIAL', 'CLOSED', 'WEEKEND', 'HOLIDAY'
  )),
  session_identifier TEXT NOT NULL,
  holiday_reason TEXT,
  source TEXT NOT NULL,
  available_at TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_atc_tradable_date ON authoritative_trading_calendar(tradable, date);

-- 3. Reconciled Corporate Actions (Splits, Bonuses, Dividends with Provenance)
CREATE TABLE IF NOT EXISTS corporate_actions_reconciled (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN (
    'SPLIT', 'BONUS', 'DIVIDEND', 'RIGHTS', 'MERGER', 'SYMBOL_CHANGE'
  )),
  ex_date TEXT NOT NULL,        -- YYYY-MM-DD
  record_date TEXT,             -- YYYY-MM-DD
  ratio_numerator REAL,
  ratio_denominator REAL,
  amount REAL,
  adjustment_convention TEXT NOT NULL CHECK(adjustment_convention IN (
    'RAW', 'ADJUSTED', 'RECONSTRUCTED'
  )),
  economic_timestamp TEXT NOT NULL,
  available_at TEXT NOT NULL,
  source TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, action_type, ex_date)
);

CREATE INDEX IF NOT EXISTS idx_car_sym_exdate ON corporate_actions_reconciled(symbol, ex_date);

-- 4. Point-In-Time Disclosure Registry (Financial Statements & Shareholding Patterns)
CREATE TABLE IF NOT EXISTS pit_disclosure_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  disclosure_kind TEXT NOT NULL CHECK(disclosure_kind IN (
    'FINANCIAL_STATEMENT', 'SHAREHOLDING_PATTERN'
  )),
  period_label TEXT NOT NULL,
  period_end_date TEXT NOT NULL,     -- YYYY-MM-DD
  publication_timestamp TEXT NOT NULL,-- ISO-8601
  available_at TEXT NOT NULL,         -- ISO-8601, MUST BE > period_end_date
  source TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, disclosure_kind, period_label)
);

CREATE INDEX IF NOT EXISTS idx_pdr_sym_avail ON pit_disclosure_registry(symbol, available_at);
