-- 009_company_events.sql
-- WealthOS V2 Wave B: First-Class Company Events Ledger in portfolio.db
-- Invariant: Zero runtime DDL in application code.

CREATE TABLE IF NOT EXISTS company_events (
  eventId TEXT PRIMARY KEY,
  securityId TEXT NOT NULL,
  isin TEXT NOT NULL,
  symbol TEXT NOT NULL,
  eventType TEXT NOT NULL,
  occurredAt TEXT NOT NULL,
  availableAt TEXT NOT NULL,
  materiality TEXT NOT NULL DEFAULT 'MEDIUM',
  title TEXT NOT NULL,
  description TEXT,
  sourceUrl TEXT,
  evidenceRefs TEXT,
  affectedDomains TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comp_events_sec ON company_events(securityId);
CREATE INDEX IF NOT EXISTS idx_comp_events_isin ON company_events(isin);
CREATE INDEX IF NOT EXISTS idx_comp_events_avail ON company_events(availableAt);
