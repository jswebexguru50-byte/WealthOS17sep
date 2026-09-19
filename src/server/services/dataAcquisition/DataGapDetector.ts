export interface DataGap {
  gapId: string;
  securityId: string;
  domain: string;
  startDate: string;
  endDate: string;
  expectedCount: number;
  actualCount: number;
  missingCount: number;
  reason: 'NOT_ACQUIRED' | 'SOURCE_GAP' | 'PARSING_ERROR' | 'IDENTITY_ERROR' | 'PIT_FAILURE' | 'UNKNOWN';
}

export class DataGapDetector {
  public static detectGaps(
    securityId: string,
    domain: string,
    expectedCount: number,
    actualCount: number,
    startDate: string,
    endDate: string
  ): DataGap | null {
    if (actualCount >= expectedCount) return null;
    const missing = expectedCount - actualCount;
    return {
      gapId: `GAP_${securityId}_${domain}_${startDate}`,
      securityId,
      domain,
      startDate,
      endDate,
      expectedCount,
      actualCount,
      missingCount: missing,
      reason: actualCount === 0 ? 'NOT_ACQUIRED' : 'SOURCE_GAP'
    };
  }
}
