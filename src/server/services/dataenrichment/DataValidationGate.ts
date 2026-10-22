export interface ValidationResult {
  status: 'PASS' | 'FAIL';
  failures: string[];
}

export function validateOHLCV(
  row: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  },
): ValidationResult {
  const failures: string[] = [];

  const values = [
    row.open,
    row.high,
    row.low,
    row.close,
    row.volume,
  ];

  if (
    values.some(
      value =>
        typeof value !== 'number' ||
        !Number.isFinite(value),
    )
  ) {
    failures.push(
      'NON_FINITE_VALUE',
    );
  }

  if (
    row.open <= 0 ||
    row.high <= 0 ||
    row.low <= 0 ||
    row.close <= 0
  ) {
    failures.push(
      'NON_POSITIVE_PRICE',
    );
  }

  if (row.volume < 0) {
    failures.push(
      'NEGATIVE_VOLUME',
    );
  }

  if (row.high < row.low) {
    failures.push(
      'HIGH_BELOW_LOW',
    );
  }

  if (
    row.high <
    Math.max(
      row.open,
      row.close,
    )
  ) {
    failures.push(
      'HIGH_BELOW_OPEN_CLOSE',
    );
  }

  if (
    row.low >
    Math.min(
      row.open,
      row.close,
    )
  ) {
    failures.push(
      'LOW_ABOVE_OPEN_CLOSE',
    );
  }

  return {
    status:
      failures.length > 0
        ? 'FAIL'
        : 'PASS',
    failures,
  };
}

/* ---------------------------------------------------------
 * Point-in-time
 * ------------------------------------------------------- */

export function validatePointInTime(
  observationTimestamp: number,
  evaluationTimestamp: number,
): boolean {
  return (
    Number.isFinite(
      observationTimestamp,
    ) &&
    Number.isFinite(
      evaluationTimestamp,
    ) &&
    observationTimestamp <=
      evaluationTimestamp
  );
}

export type PITStatus =
  | 'PIT_VERIFIED'
  | 'PIT_NOT_VERIFIABLE'
  | 'PIT_INVALID'
  | 'NOT_APPLICABLE';

export interface PITEvidence {
  observationTimestamp?: number;
  publicationTimestamp?: number;
  acquisitionTimestamp?: number;

  /*
   * True means the dataset's economic observation cannot
   * legitimately be considered available without publication
   * evidence.
   */
  requiresPublication: boolean;

  /*
   * True means the provider/source contract says acquisition
   * timing is necessary to establish availability.
   */
  requiresAcquisitionTimestamp?: boolean;

  /*
   * Explicitly permitted only for datasets for which PIT does
   * not conceptually apply.
   */
  notApplicable?: boolean;
}

export function validatePIT(
  evidence: PITEvidence,
  evaluationTimestamp: number,
): PITStatus {
  if (
    evidence.notApplicable === true
  ) {
    return 'NOT_APPLICABLE';
  }

  if (
    !Number.isFinite(
      evaluationTimestamp,
    )
  ) {
    return 'PIT_INVALID';
  }

  if (
    evidence.observationTimestamp ===
      undefined ||
    !Number.isFinite(
      evidence.observationTimestamp,
    )
  ) {
    return 'PIT_NOT_VERIFIABLE';
  }

  if (
    evidence.observationTimestamp >
    evaluationTimestamp
  ) {
    return 'PIT_INVALID';
  }

  if (
    evidence.requiresPublication &&
    (
      evidence.publicationTimestamp ===
        undefined ||
      !Number.isFinite(
        evidence.publicationTimestamp,
      )
    )
  ) {
    return 'PIT_NOT_VERIFIABLE';
  }

  if (
    evidence.publicationTimestamp !==
      undefined &&
    !Number.isFinite(
      evidence.publicationTimestamp,
    )
  ) {
    return 'PIT_INVALID';
  }

  if (
    evidence.publicationTimestamp !==
      undefined &&
    evidence.publicationTimestamp >
      evaluationTimestamp
  ) {
    return 'PIT_INVALID';
  }

  if (
    evidence.requiresAcquisitionTimestamp
  ) {
    if (
      evidence.acquisitionTimestamp ===
        undefined ||
      !Number.isFinite(
        evidence.acquisitionTimestamp,
      )
    ) {
      return 'PIT_NOT_VERIFIABLE';
    }
  }

  if (
    evidence.acquisitionTimestamp !==
      undefined &&
    !Number.isFinite(
      evidence.acquisitionTimestamp,
    )
  ) {
    return 'PIT_INVALID';
  }

  if (
    evidence.acquisitionTimestamp !==
      undefined &&
    evidence.acquisitionTimestamp >
      evaluationTimestamp
  ) {
    return 'PIT_INVALID';
  }

  return 'PIT_VERIFIED';
}

/* ---------------------------------------------------------
 * PIT promotion helper
 * ------------------------------------------------------- */

export function pitAllowsPromotion(
  status: PITStatus,
): boolean {
  return (
    status === 'PIT_VERIFIED' ||
    status === 'NOT_APPLICABLE'
  );
}
