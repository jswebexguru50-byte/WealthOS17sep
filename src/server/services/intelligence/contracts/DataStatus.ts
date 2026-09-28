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
  | 'ERROR';

export type FreshnessStatus = 'FRESH' | 'STALE' | 'UNKNOWN';
