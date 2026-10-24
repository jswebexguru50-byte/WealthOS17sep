-- One durable lifecycle for all provider reads. Raw payloads remain in source stores;
-- this table records whether they were normalized, promoted and consumed.
CREATE TABLE IF NOT EXISTS acquisition_jobs (
  job_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  isin TEXT,
  domain TEXT NOT NULL,
  metric TEXT,
  source_provider TEXT NOT NULL,
  source_url TEXT,
  cache_key TEXT NOT NULL UNIQUE,
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  next_retry_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('QUEUED','FETCHING','CACHED','FETCHED','NORMALIZED','PROMOTED','CONSUMED','RETRYABLE_FAILURE','TERMINAL_FAILURE')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  ttl_seconds INTEGER NOT NULL,
  payload_sha256 TEXT,
  raw_location TEXT,
  normalization_error TEXT,
  promotion_error TEXT,
  consumed_by_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_acquisition_jobs_lookup ON acquisition_jobs(symbol,domain,metric,status,completed_at);
CREATE INDEX IF NOT EXISTS idx_acquisition_jobs_retry ON acquisition_jobs(status,next_retry_at);

CREATE TABLE IF NOT EXISTS source_metric_policy (
  metric TEXT NOT NULL,
  domain TEXT NOT NULL,
  provider TEXT NOT NULL,
  priority INTEGER NOT NULL,
  ttl_seconds INTEGER NOT NULL,
  requires_primary_filing INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(metric, domain, provider)
);

INSERT OR IGNORE INTO source_metric_policy(metric,domain,provider,priority,ttl_seconds,requires_primary_filing) VALUES
 ('daily_ohlcv','MARKET','KITE',1,86400,0),('daily_ohlcv','MARKET','UPSTOX',2,86400,0),('daily_ohlcv','MARKET','TRADINGVIEW',3,86400,0),
 ('financial_statement','FUNDAMENTAL','NSE_BSE_XBRL',1,7776000,1),('financial_statement','FUNDAMENTAL','TRENDLYNE_MCP',2,604800,0),('financial_statement','FUNDAMENTAL','UPSTOX',3,86400,0),
 ('shareholding','FUNDAMENTAL','NSE_BSE_FILING',1,7776000,1),('shareholding','FUNDAMENTAL','TRENDLYNE_MCP',2,604800,0),
 ('corporate_action','CORPORATE_ACTION','NSE_BSE',1,86400,1),('corporate_action','CORPORATE_ACTION','KITE',2,86400,0),('governance_document','DOCUMENT','NSE_BSE_FILING',1,7776000,1),('governance_document','DOCUMENT','MCA',2,2592000,1);
