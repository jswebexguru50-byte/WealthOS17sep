import crypto from 'node:crypto';

export type DatasetReadiness =
  | 'ABSENT'
  | 'PRESENT_BUT_INSUFFICIENT'
  | 'PRESENT_AND_REPLAY_READY'
  | 'INVALID'
  | 'NOT_AUDITED';

export type PITStatus =
  | 'PIT_VERIFIED'
  | 'PIT_NOT_VERIFIABLE'
  | 'PIT_INVALID'
  | 'NOT_APPLICABLE';

export interface DatasetManifest {
  datasetId: string;
  source: string;
  provider: string;

  retrievedAt: string;

  coverageStart?: string;
  coverageEnd?: string;
  missingRanges?: { start: string, end: string, reason: string }[];
  coverage?: {
    expectedIntervals: number;
    observedIntervals: number;
    ratio: number;
  };

  rowCount: number;

  sha256: string;

  timezone?: string;
  priceBasis?: string;

  pitStatus: PITStatus;

  calendarStatus:
    | 'VALIDATED'
    | 'INVALID'
    | 'UNKNOWN';

  validationStatus:
    | 'PENDING'
    | 'PASS'
    | 'FAIL';

  readiness: DatasetReadiness;
}

export interface CanonicalMarketObservation {
  securityId: string;
  instrumentKey?: string;

  exchange: string;
  segment: string;
  timeframe: string;

  barStartTime: string;
  barEndTime: string;

  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;

  providerTimestamp: string;
  observationTimestamp: string;
  dataAcquisitionTimestamp: string;
  dataReceivedTimestamp?: string;

  source: string;
  datasetId: string;

  observationHash: string;
  candleState?: 'OPEN' | 'CLOSED' | 'INVALID';
}



/* ---------------------------------------------------------
 * Promotion gate
 * ------------------------------------------------------- */

export interface VerificationPredicate {
  id: string;
  status: 'PASS' | 'FAIL' | 'NOT_VERIFIABLE';
  evidence: {
    source: string;
    locator?: string;
    hash?: string;
  };
  reason?: string;
}

export interface DatasetPromotionDecisionType {
  decision: 'PROMOTED' | 'REJECTED' | 'DATA_INSUFFICIENT';
  failures: string[];
}

export interface DatasetPromotionDecision {
  datasetId: string;
  decision: 'PROMOTED' | 'REJECTED' | 'DATA_INSUFFICIENT';
  checks: VerificationPredicate[];
  failures: string[];
}

export interface DatasetPromotionInput {
  datasetId: string;
  manifest: DatasetManifest;
  checks: VerificationPredicate[];
  insufficientReasons?: string[];
}

// Promotion logic moved to DatasetPromotionGate.ts
