-- 006_watch_rules_and_evaluations.sql
-- Migration: Add persistent watch rules, watch evaluations, and watch events tables
-- Run at startup via scripts/migrations/run_migrations.ts
-- NEVER run inline from application code.

CREATE TABLE IF NOT EXISTS watch_rules (
  watch_id TEXT PRIMARY KEY,
  user_id TEXT,
  security_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  operator TEXT,
  threshold TEXT,
  unit TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_watch_rules_sec_status ON watch_rules(security_id, status);
CREATE INDEX IF NOT EXISTS idx_watch_rules_symbol ON watch_rules(symbol);

CREATE TABLE IF NOT EXISTS watch_evaluations (
  evaluation_id TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL,
  security_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  previous_state TEXT,
  current_state TEXT NOT NULL,
  triggering_evidence_ids TEXT,
  explanation TEXT,
  FOREIGN KEY (watch_id) REFERENCES watch_rules(watch_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_eval_watch_date ON watch_evaluations(watch_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS watch_events (
  event_id TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL,
  security_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  summary TEXT NOT NULL,
  severity TEXT NOT NULL,
  evidence_ids TEXT,
  FOREIGN KEY (watch_id) REFERENCES watch_rules(watch_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_events_sec_date ON watch_events(security_id, occurred_at DESC);
