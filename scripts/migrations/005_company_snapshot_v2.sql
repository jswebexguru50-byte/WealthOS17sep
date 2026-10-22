-- 005_company_snapshot_v2.sql
-- Migration: Add V2 independent hash columns to company_intelligence_snapshot
-- Run at startup via scripts/migrations/run_migrations.ts
-- NEVER run inline from application code.

ALTER TABLE company_intelligence_snapshot ADD COLUMN canonical_fact_hash TEXT;
ALTER TABLE company_intelligence_snapshot ADD COLUMN evidence_hash TEXT;
ALTER TABLE company_intelligence_snapshot ADD COLUMN module_hashes TEXT;
ALTER TABLE company_intelligence_snapshot ADD COLUMN analytical_hash TEXT;
ALTER TABLE company_intelligence_snapshot ADD COLUMN payload_summary TEXT;

-- Create index for deterministic duplicate detection
CREATE INDEX IF NOT EXISTS idx_snapshot_analytical_hash
  ON company_intelligence_snapshot (security_id, as_of_date, analytical_hash);
