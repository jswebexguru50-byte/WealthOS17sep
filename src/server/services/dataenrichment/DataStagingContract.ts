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
  candleState?: 'OPEN' | 'CLOSED' | 'INVALID';
}

/**
 * Validates canonical requirements: MUST NOT BE NaN or Infinity. / -Infinity
 *   -> canonicalization failure
 *
 * undefined
 *   -> canonicalization failure
 * null
 *   -> not permitted for required market observation fields
 *
 * Numbers are represented using a normalized decimal string.
 *
 * We deliberately do NOT use toFixed() because OHLCV precision can
 * vary by instrument and provider. The representation is normalized
 * using Number#toString() after finite validation.
 */
export function canonicalNumber(
  value: number,
  fieldName: string,
): string {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    throw new Error(
      `CANONICAL_NUMBER_INVALID:${fieldName}`,
    );
  }

  /*
   * Normalize -0 to 0.
   */
  if (Object.is(value, -0)) {
    return '0';
  }

  return value.toString();
}

function canonicalRequiredString(
  value: string,
  fieldName: string,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0
  ) {
    throw new Error(
      `CANONICAL_STRING_INVALID:${fieldName}`,
    );
  }

  return value;
}

/*
 * Object construction order is deliberate and fixed.
 *
 * JSON.stringify is used only after every field has been
 * explicitly normalized and no undefined values are permitted.
 */
export function canonicalizeObservation(
  observation: Omit<
    CanonicalMarketObservation,
    'observationHash'
  >,
): string {
  const canonical = {
    exchange: canonicalRequiredString(
      observation.exchange,
      'exchange',
    ),

    segment: canonicalRequiredString(
      observation.segment,
      'segment',
    ),

    securityId: canonicalRequiredString(
      observation.securityId,
      'securityId',
    ),

    timeframe: canonicalRequiredString(
      observation.timeframe,
      'timeframe',
    ),

    barStartTime: canonicalRequiredString(
      observation.barStartTime,
      'barStartTime',
    ),

    barEndTime: canonicalRequiredString(
      observation.barEndTime,
      'barEndTime',
    ),

    open: canonicalNumber(
      observation.open,
      'open',
    ),

    high: canonicalNumber(
      observation.high,
      'high',
    ),

    low: canonicalNumber(
      observation.low,
      'low',
    ),

    close: canonicalNumber(
      observation.close,
      'close',
    ),

    volume: canonicalNumber(
      observation.volume,
      'volume',
    ),

    source: canonicalRequiredString(
      observation.source,
      'source',
    ),

    datasetId: canonicalRequiredString(
      observation.datasetId,
      'datasetId',
    ),
  };

  return JSON.stringify(canonical);
}

export function hashObservation(
  observation: Omit<
    CanonicalMarketObservation,
    'observationHash'
  >,
): string {
  const canonical =
    canonicalizeObservation(observation);

  return crypto
    .createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');
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
