-- 008_management_commitments.sql
-- WealthOS V2 Wave B: First-Class Management Commitments Table in portfolio.db
-- Invariant: Zero runtime DDL in application code.

CREATE TABLE IF NOT EXISTS management_commitments (
  commitment_id TEXT PRIMARY KEY,
  security_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  statement_date TEXT NOT NULL,
  speaker TEXT,
  source_document_id TEXT,
  original_statement TEXT NOT NULL,
  category TEXT NOT NULL,
  commitment_type TEXT NOT NULL,
  metric_key TEXT,
  target_value REAL,
  target_min REAL,
  target_max REAL,
  target_unit TEXT,
  target_period TEXT,
  status TEXT NOT NULL DEFAULT 'NOT_YET_DUE',
  evaluation_explanation TEXT,
  evidence_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mgt_commitments_sec ON management_commitments(security_id);
CREATE INDEX IF NOT EXISTS idx_mgt_commitments_period ON management_commitments(target_period);
