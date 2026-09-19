import crypto from 'node:crypto';

export type DatasetReadiness =
  | 'ABSENT'
  | 'PRESENT_BUT_INSUFFICIENT'
  | 'PRESENT_AND_REPLAY_READY'
  | 'INVALID'
  | 'NOT_AUDITED';

export interface DatasetManifest {
  datasetId: string;
  source: string;
  provider: string;

  retrievedAt: string;

  coverageStart?: string;
  coverageEnd?: string;

  rowCount: number;

  sha256: string;

  timezone?: string;
  priceBasis?: string;

  pitStatus:
    | 'VALIDATED'
    | 'INVALID'
    | 'UNKNOWN'
    | 'NOT_APPLICABLE';

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

  source: string;
  datasetId: string;

  observationHash: string;
}

export interface DatasetPromotionDecision {
  datasetId: string;
  decision:
    | 'PROMOTE'
    | 'REJECT'
    | 'DATA_INSUFFICIENT';
  checks: {
    sourceVerified: boolean;
    shaVerified: boolean;
    identityValid: boolean;
    timestampsValid: boolean;
    ohlcvValid: boolean;
    calendarValid: boolean;
    pitValid: boolean;
    duplicatesValid: boolean;
    provenanceComplete: boolean;
  };
  failures: string[];
}

function canonicalNumber(n: number): string | null {
  if (n === null || n === undefined) return null;
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  return n.toString();
}

export function hashObservation(
  observation: Omit<CanonicalMarketObservation, 'observationHash'>
): string {
  const canonical = JSON.stringify({
    exchange: observation.exchange,
    segment: observation.segment,
    securityId: observation.securityId,
    timeframe: observation.timeframe,
    barStartTime: observation.barStartTime,
    barEndTime: observation.barEndTime,
    open: canonicalNumber(observation.open),
    high: canonicalNumber(observation.high),
    low: canonicalNumber(observation.low),
    close: canonicalNumber(observation.close),
    volume: canonicalNumber(observation.volume),
    source: observation.source,
    datasetId: observation.datasetId
  });

  return crypto
    .createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');
}
