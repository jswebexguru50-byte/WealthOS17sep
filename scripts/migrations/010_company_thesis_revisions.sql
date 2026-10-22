-- 010_company_thesis_revisions.sql
-- Migration: company_thesis_revisions table and index
-- Moved from ThesisRevisionStore.ts runtime DDL per architecture mandate:
-- "zero runtime DDL — all schema changes via numbered migrations"

CREATE TABLE IF NOT EXISTS company_thesis_revisions (
  revision_id  TEXT PRIMARY KEY,
  security_id  TEXT NOT NULL,
  as_of_date   TEXT NOT NULL,
  state_hash   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  thesis_json  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_thesis_rev_security
  ON company_thesis_revisions(security_id, created_at DESC);
