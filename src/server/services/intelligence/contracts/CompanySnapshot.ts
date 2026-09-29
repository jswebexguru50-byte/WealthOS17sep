/**
 * CompanySnapshot.ts — Constitution Article C6 (Delta Ledger)
 *
 * Immutable representation of a company analytical state at a specific point in time.
 * Comparison between two immutable snapshots is the ONLY valid mechanism to compute Delta.
 */

export interface CompanyImmutableSnapshot {
  snapshotId: string;
  securityId: string;
  isin: string;
  asOf: string;                  // ISO timestamp of evaluation horizon
  dataCutoff: string;            // ISO timestamp max availableAt allowed
  canonicalFactHash: string;     // Hash of all included CanonicalFacts
  evidenceHash: string;          // Hash of all included EvidenceRefs
  moduleHashes: Record<string, string>; // Hash per analytical module output
  createdAt: string;             // ISO timestamp when snapshot was computed
  payloadSummary: {
    revenueTTM?: number | null;
    patTTM?: number | null;
    roceAnnual?: number | null;
    debtToEquity?: number | null;
    peTTM?: number | null;
    marketCapCr?: number | null;
    thesisSupportedCount: number;
    thesisChallengedCount: number;
    activeContradictionsCount: number;
  };
}

export type DeltaChangeType =
  | 'NEW'
  | 'REMOVED'
  | 'IMPROVED'
  | 'DETERIORATED'
  | 'CONTRADICTED'
  | 'RESOLVED'
  | 'UNCHANGED';

export interface CompanySnapshotDelta {
  fromSnapshotId: string;
  toSnapshotId: string;
  fromAsOf: string;
  toAsOf: string;
  changes: Array<{
    domain: string;
    metricOrKey: string;
    changeType: DeltaChangeType;
    previousValue?: any;
    currentValue?: any;
    narrative: string;
  }>;
  isFirstRun: boolean;
}
