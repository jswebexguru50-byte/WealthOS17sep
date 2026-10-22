export type TruthQuality =
  | 'RAW_PROVIDER'
  | 'PARSED'
  | 'CANONICAL_MAPPED'
  | 'PRIMARY_SOURCE_VERIFIED'
  | 'CROSS_SOURCE_VERIFIED'
  | 'DERIVED_VERIFIED'
  | 'CONFLICTED';

export type AvailabilityStatus =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'STALE'
  | 'DATA_INSUFFICIENT'
  | 'SOURCE_UNAVAILABLE'
  | 'IDENTITY_REVIEW'
  | 'NOT_APPLICABLE'
  | 'ERROR';

export type DataStatus =
  | 'VERIFIED'
  | 'PARTIAL'
  | 'DATA_INSUFFICIENT'
  | 'STALE'
  | 'UNVERIFIED'
  | 'BLOCKED'
  | 'SOURCE_UNAVAILABLE'
  | 'IDENTITY_REVIEW'
  | 'PIT_NOT_VERIFIABLE'
  | 'NOT_REQUESTED'
  | 'NOT_APPLICABLE'
  | 'ERROR'
  | TruthQuality
  | AvailabilityStatus;

export type FreshnessStatus = 'FRESH' | 'STALE' | 'UNKNOWN';
