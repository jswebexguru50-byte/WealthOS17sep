-- Migration 011: Trendlyne MCP Max Enrichment and Capacity Optimization Tables
-- WealthOS V2 Mandatory Amendment

-- 1. Raw provider response store (immutable append-only)
CREATE TABLE IF NOT EXISTS trendlyne_raw_response (
  response_id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  response_hash TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  provider_version TEXT,
  UNIQUE(request_hash, response_hash)
);

CREATE INDEX IF NOT EXISTS idx_trendlyne_raw_req ON trendlyne_raw_response(request_hash);
CREATE INDEX IF NOT EXISTS idx_trendlyne_raw_tool ON trendlyne_raw_response(tool_name);

-- 2. Ranked metric and parameter catalog
CREATE TABLE IF NOT EXISTS trendlyne_parameter_catalog (
  provider_parameter_id TEXT PRIMARY KEY,
  provider_label TEXT NOT NULL,
  category TEXT,
  statement_type TEXT,
  period_type TEXT,
  unit TEXT,
  scale TEXT,
  canonical_metric TEXT,
  mapping_status TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

-- 3. Metric applicability and coverage learning per archetype
CREATE TABLE IF NOT EXISTS trendlyne_metric_applicability (
  metric_id TEXT NOT NULL,
  archetype TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  successful_values INTEGER NOT NULL DEFAULT 0,
  null_values INTEGER NOT NULL DEFAULT 0,
  coverage_pct REAL NOT NULL DEFAULT 0.0,
  last_updated TEXT NOT NULL,
  PRIMARY KEY (metric_id, archetype)
);

-- 4. Persistent queue jobs
CREATE TABLE IF NOT EXISTS trendlyne_enrichment_jobs (
  job_id TEXT PRIMARY KEY,
  security_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  pack_id TEXT,
  pack_version TEXT,
  period_key TEXT,
  priority INTEGER NOT NULL,
  state TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  request_hash TEXT NOT NULL,
  response_hash TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  next_attempt_at TEXT,
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_trendlyne_jobs_sec ON trendlyne_enrichment_jobs(security_id);
CREATE INDEX IF NOT EXISTS idx_trendlyne_jobs_state ON trendlyne_enrichment_jobs(state, priority);

-- 5. Multi-stock batch coordination table
CREATE TABLE IF NOT EXISTS trendlyne_enrichment_batches (
  batch_id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  stock_set_hash TEXT NOT NULL,
  metric_pack_hash TEXT,
  request_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  response_hash TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  next_attempt_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_trendlyne_batches_state ON trendlyne_enrichment_batches(state);

-- 6. Quota and rate-limit tracking ledger
CREATE TABLE IF NOT EXISTS trendlyne_quota_ledger (
  period_date TEXT PRIMARY KEY,
  daily_used INTEGER NOT NULL DEFAULT 0,
  monthly_used INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 1000,
  monthly_limit INTEGER NOT NULL DEFAULT 10000,
  last_updated TEXT NOT NULL
);
