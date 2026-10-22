-- 007_source_documents.sql
-- WealthOS V2 Wave B: First-Class Source Document Model & Ingestion Tracking
-- Invariant: Zero runtime DDL in application code.

CREATE TABLE IF NOT EXISTS source_documents (
  document_id TEXT PRIMARY KEY,
  security_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_authority TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  published_at TEXT NOT NULL,
  available_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  local_path TEXT,
  parse_status TEXT NOT NULL DEFAULT 'PENDING',
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  raw_metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_source_docs_sec ON source_documents(security_id);
CREATE INDEX IF NOT EXISTS idx_source_docs_hash ON source_documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_source_docs_avail ON source_documents(available_at);
