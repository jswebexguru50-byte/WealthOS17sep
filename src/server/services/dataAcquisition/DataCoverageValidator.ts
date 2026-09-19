export interface CoverageValidationResult {
  securityId: string;
  domain: string;
  startDate: string;
  endDate: string;
  expectedObservations: number;
  actualObservations: number;
  missingObservations: number;
  coveragePercentage: number;
  isCoverageSufficient: boolean; // >= 95%
}

export class DataCoverageValidator {
  public static validateDailyCoverage(
    securityId: string,
    actualDates: string[],
    startDate: string,
    endDate: string
  ): CoverageValidationResult {
    // Calculate expected business days
    const start = new Date(startDate);
    const end = new Date(endDate);
    let expected = 0;
    const curr = new Date(start);

    while (curr <= end) {
      const day = curr.getDay();
      if (day !== 0 && day !== 6) {
        expected++;
      }
      curr.setDate(curr.getDate() + 1);
    }

    const actual = actualDates.length;
    const missing = Math.max(0, expected - actual);
    const coveragePct = expected > 0 ? Math.min(100, Math.round((actual / expected) * 10000) / 100) : 100;

    return {
      securityId,
      domain: 'D2_DAILY_OHLCV',
      startDate,
      endDate,
      expectedObservations: expected,
      actualObservations: actual,
      missingObservations: missing,
      coveragePercentage: coveragePct,
      isCoverageSufficient: coveragePct >= 95.0
    };
  }
}
