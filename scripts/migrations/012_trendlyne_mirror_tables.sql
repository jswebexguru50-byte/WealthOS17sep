-- Migration 012: isolated Trendlyne Fundamental Mirror pilot tables.
-- This migration intentionally does not alter company_facts. Canonical
-- promotion must continue through CanonicalFactIngestionService.

CREATE TABLE IF NOT EXISTS trendlyne_mirror_parameter_catalog (
  providerToken TEXT PRIMARY KEY,
  providerLabel TEXT NOT NULL,
  canonicalMetric TEXT,
  domain TEXT NOT NULL,
  periodType TEXT NOT NULL,
  relativePeriod TEXT,
  unit TEXT,
  trustState TEXT NOT NULL,
  reason TEXT NOT NULL,
  proprietaryComposite INTEGER NOT NULL DEFAULT 0,
  discoveredAt TEXT NOT NULL,
  verifiedAt TEXT
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_pack_registry (
  packId TEXT NOT NULL,
  version INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  refreshPolicy TEXT NOT NULL,
  tokenCount INTEGER NOT NULL,
  definitionHash TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  immutable INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (packId, version)
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_pack_tokens (
  packId TEXT NOT NULL,
  version INTEGER NOT NULL,
  providerToken TEXT NOT NULL,
  canonicalMetric TEXT,
  priority INTEGER NOT NULL,
  reason TEXT NOT NULL,
  verificationEvidence TEXT NOT NULL,
  PRIMARY KEY (packId, version, providerToken)
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_raw_snapshots (
  snapshotId TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  packId TEXT NOT NULL,
  packVersion INTEGER NOT NULL,
  symbolsJson TEXT NOT NULL,
  tokensJson TEXT NOT NULL,
  requestedCells INTEGER NOT NULL,
  responseHash TEXT NOT NULL,
  responseJson TEXT NOT NULL,
  providerStatus TEXT NOT NULL,
  requestedAt TEXT NOT NULL,
  receivedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_observations (
  observationId TEXT PRIMARY KEY,
  snapshotId TEXT NOT NULL,
  symbol TEXT NOT NULL,
  companyId TEXT,
  providerToken TEXT NOT NULL,
  providerLabel TEXT,
  canonicalMetric TEXT,
  rawValue TEXT,
  rawUnit TEXT,
  periodType TEXT NOT NULL,
  relativePeriod TEXT,
  providerPeriod TEXT,
  providerAsOf TEXT,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  firstSeenAt TEXT NOT NULL,
  lastSeenAt TEXT NOT NULL,
  responseHash TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trendlyne_mirror_observation_identity
ON trendlyne_mirror_observations(symbol, providerToken, periodType, COALESCE(relativePeriod,''), COALESCE(providerPeriod,''), COALESCE(rawValue,''), status);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_refresh_state (
  symbol TEXT NOT NULL,
  packId TEXT NOT NULL,
  packVersion INTEGER NOT NULL,
  lastCheckedAt TEXT,
  lastSuccessfulAt TEXT,
  lastChangedAt TEXT,
  lastResponseHash TEXT,
  consecutiveUnchangedChecks INTEGER NOT NULL DEFAULT 0,
  nextDueAt TEXT,
  providerStatus TEXT,
  lastError TEXT,
  PRIMARY KEY (symbol, packId, packVersion)
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_change_events (
  changeEventId TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  packId TEXT NOT NULL,
  providerToken TEXT NOT NULL,
  canonicalMetric TEXT,
  oldObservationId TEXT,
  newObservationId TEXT,
  oldValue TEXT,
  newValue TEXT,
  oldPeriod TEXT,
  newPeriod TEXT,
  detectedAt TEXT NOT NULL,
  changeType TEXT NOT NULL,
  canonicalAction TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_reconciliation (
  reconciliationId TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  canonicalMetric TEXT NOT NULL,
  periodType TEXT,
  periodEnd TEXT,
  scope TEXT,
  trendlyneObservationId TEXT,
  externalSource TEXT NOT NULL,
  externalEvidenceId TEXT,
  trendlyneValue TEXT,
  externalValue TEXT,
  classification TEXT NOT NULL,
  checkedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trendlyne_mirror_consumer_invalidation (
  invalidationId TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  consumer TEXT NOT NULL,
  reason TEXT NOT NULL,
  sourceChangeEventId TEXT,
  createdAt TEXT NOT NULL,
  status TEXT NOT NULL
);

