-- research_v2_schema.sql
-- WEALTHOS_29Q_V2 schema: User Approved, 2026-10-10 (chat)
--
-- Additive and idempotent: every statement is CREATE ... IF NOT EXISTS. Nothing here drops, deletes or
-- alters another table. The guarded quarantine of legacy company_facts rows lives in
-- research_v2_migration.ts (SQL cannot test for a column), never in this file.
-- Do not add BEGIN/COMMIT: the migrator and applyResearchV2Schema() own the transaction.

CREATE TABLE IF NOT EXISTS research_canonical_period_facts (
  fact_id TEXT PRIMARY KEY,
  isin TEXT NOT NULL CHECK (length(isin) > 0),
  symbol TEXT NOT NULL CHECK (length(symbol) > 0),
  scope TEXT NOT NULL CHECK (scope IN ('CONSOLIDATED','STANDALONE')),
  metric TEXT NOT NULL CHECK (length(metric) > 0),
  period_type TEXT NOT NULL CHECK (period_type IN
    ('DISCRETE_Q','YTD_3M','YTD_6M','YTD_9M','YTD_12M','ANNUAL','TTM','POINT_IN_TIME')),
  period_start TEXT NOT NULL CHECK (period_start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  period_end TEXT NOT NULL CHECK (period_end GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  value_cr REAL,
  unit TEXT NOT NULL CHECK (unit IN ('INR_CR','PCT','RATIO','SHARES','INR','INR_PER_SHARE','DAYS','X')),
  source_tier TEXT NOT NULL CHECK (source_tier IN
    ('STATUTORY','PROVIDER_VERIFIED','PROVIDER_LATEST','SECONDARY_LEAD','SIMULATED')),
  source TEXT NOT NULL,
  source_ref TEXT,
  available_at TEXT NOT NULL CHECK (length(available_at) > 0),
  vintage INTEGER NOT NULL DEFAULT 1 CHECK (vintage >= 1),
  supersedes_id TEXT REFERENCES research_canonical_period_facts (fact_id),
  derivation_json TEXT,
  quality_flags TEXT DEFAULT '[]' CHECK (json_valid(quality_flags)),
  quarantined INTEGER NOT NULL DEFAULT 0 CHECK (quarantined IN (0, 1)),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CHECK (period_end >= period_start),
  UNIQUE (isin, scope, metric, period_type, period_start, period_end, vintage)
);
CREATE INDEX IF NOT EXISTS idx_rcpf_lookup
  ON research_canonical_period_facts (isin, metric, scope, period_type, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_rcpf_symbol
  ON research_canonical_period_facts (symbol, metric, period_end DESC);

-- Vintages are immutable evidence: only the review flags (quarantined, quality_flags) may change,
-- and rows are never deleted. A correction is a new vintage row.
CREATE TRIGGER IF NOT EXISTS trg_rcpf_immutable_vintage
BEFORE UPDATE ON research_canonical_period_facts
WHEN OLD.fact_id IS NOT NEW.fact_id OR OLD.isin IS NOT NEW.isin OR OLD.symbol IS NOT NEW.symbol
  OR OLD.scope IS NOT NEW.scope OR OLD.metric IS NOT NEW.metric OR OLD.period_type IS NOT NEW.period_type
  OR OLD.period_start IS NOT NEW.period_start OR OLD.period_end IS NOT NEW.period_end
  OR OLD.value_cr IS NOT NEW.value_cr OR OLD.unit IS NOT NEW.unit OR OLD.source_tier IS NOT NEW.source_tier
  OR OLD.source IS NOT NEW.source OR OLD.source_ref IS NOT NEW.source_ref
  OR OLD.available_at IS NOT NEW.available_at OR OLD.vintage IS NOT NEW.vintage
  OR OLD.supersedes_id IS NOT NEW.supersedes_id OR OLD.derivation_json IS NOT NEW.derivation_json
BEGIN
  SELECT RAISE(ABORT, 'research_canonical_period_facts vintages are immutable: write a new vintage');
END;

CREATE TRIGGER IF NOT EXISTS trg_rcpf_no_delete
BEFORE DELETE ON research_canonical_period_facts
BEGIN
  SELECT RAISE(ABORT, 'research_canonical_period_facts rows are never deleted');
END;

CREATE TABLE IF NOT EXISTS research_metric_definitions (
  metric TEXT PRIMARY KEY, definition TEXT NOT NULL, unit TEXT NOT NULL, period_basis TEXT NOT NULL,
  provider_mappings_json TEXT DEFAULT '{}', aliases_json TEXT DEFAULT '[]');

CREATE TABLE IF NOT EXISTS research_trendlyne_catalogue (
  token TEXT PRIMARY KEY, label TEXT, category TEXT, unit TEXT, money_in_crore INTEGER DEFAULT 0, period_type TEXT,
  mapped_metric TEXT, tier TEXT CHECK (tier IN ('T1','T2','T3','SKIP')), discovered_at TEXT, notes TEXT);

CREATE TABLE IF NOT EXISTS research_trendlyne_call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, purpose TEXT, endpoint TEXT, symbols_json TEXT,
  tokens_json TEXT, request_hash TEXT NOT NULL, status TEXT NOT NULL, error_code TEXT, error_message TEXT,
  weighted_cost REAL, response_ref TEXT, called_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_rtcl_hash ON research_trendlyne_call_log (request_hash, status);

CREATE TABLE IF NOT EXISTS research_items (
  item_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, tier TEXT NOT NULL, url TEXT NOT NULL, title TEXT,
  publisher TEXT, published_at TEXT, retrieved_at TEXT NOT NULL, excerpt TEXT NOT NULL,
  sub_question_ids_json TEXT DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('VERIFIED','UNVERIFIED_LEAD','REJECTED','MANAGEMENT_CLAIM')),
  traced_to TEXT, url_hash TEXT UNIQUE);

CREATE TABLE IF NOT EXISTS research_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, isin TEXT, metric TEXT, period_end TEXT, scope TEXT, fact_a TEXT,
  fact_b TEXT, value_a REAL, value_b REAL, rel_diff REAL, status TEXT DEFAULT 'OPEN', note TEXT,
  detected_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_rc_status ON research_conflicts (status, isin, metric);

CREATE TABLE IF NOT EXISTS research_report_runs (
  run_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, as_of TEXT NOT NULL, routine_version TEXT NOT NULL,
  contract_version TEXT NOT NULL, bundle_hash TEXT NOT NULL, drafter_provider TEXT, drafter_model TEXT,
  reviewer_provider TEXT, reviewer_model TEXT, status TEXT NOT NULL, validator_verdict_json TEXT,
  gate_verdict_json TEXT, spend_usd REAL, loops INTEGER DEFAULT 0, started_at TEXT, finished_at TEXT);

CREATE TABLE IF NOT EXISTS research_answer_store (
  run_id TEXT NOT NULL, sub_question_id TEXT NOT NULL, state TEXT NOT NULL, claims_json TEXT NOT NULL,
  narrative TEXT, gap TEXT, next_action TEXT, sources_searched_json TEXT, premise_check_json TEXT,
  review_status TEXT, PRIMARY KEY (run_id, sub_question_id));

CREATE TABLE IF NOT EXISTS research_review_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, sub_question_id TEXT, severity TEXT, defect TEXT,
  evidence TEXT, required_fix TEXT, resolution TEXT, loop_no INTEGER);

CREATE TABLE IF NOT EXISTS research_filter_scorecard (
  run_id TEXT NOT NULL, symbol TEXT NOT NULL, as_of TEXT NOT NULL, filter_id INTEGER NOT NULL, label TEXT,
  observed REAL, unit TEXT, threshold REAL, comparator TEXT, gap REAL, status TEXT NOT NULL, basis TEXT,
  period TEXT, scope TEXT, sources_json TEXT, formula TEXT, note TEXT, reason_unverifiable TEXT,
  PRIMARY KEY (run_id, symbol, filter_id));
