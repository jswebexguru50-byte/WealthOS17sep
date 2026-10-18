-- Reset enrichment jobs that completed against the fake Trendlyne client
-- (quarantine_trendlyne_raw_response holds the fake responses; these COMPLETE jobs have no valid data)
-- Run against portfolio.db AFTER confirming migration v16 is applied.
--
-- Safe to run multiple times (idempotent).

BEGIN;

-- How many are affected
SELECT 'Jobs to reset', COUNT(*) FROM trendlyne_enrichment_jobs WHERE state = 'COMPLETE';

-- Reset to PENDING so the live MCP job runner picks them up
UPDATE trendlyne_enrichment_jobs
SET
  state            = 'PENDING',
  completed_at     = NULL,
  response_hash    = NULL,
  error_code       = NULL,
  error_message    = NULL,
  attempt_count    = 0,
  next_attempt_at  = datetime('now')
WHERE state = 'COMPLETE';

SELECT 'Jobs reset to PENDING', changes();

-- Confirm
SELECT state, COUNT(*) FROM trendlyne_enrichment_jobs GROUP BY state;

COMMIT;
