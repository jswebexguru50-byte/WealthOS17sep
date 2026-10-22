export interface QualityGateResult {
  passed: boolean;
  anomaliesDetectedCount: number;
  anomalies: string[];
}

export class DataQualityGate {
  public static verifyOHLCVQuality(record: { open: number; high: number; low: number; close: number; volume: number }): QualityGateResult {
    const anomalies: string[] = [];

    if (record.low > record.high) {
      anomalies.push(`INVALID_PRICE_BOUND: Low (${record.low}) > High (${record.high})`);
    }
    if (record.open < 0 || record.high < 0 || record.low < 0 || record.close < 0) {
      anomalies.push('NEGATIVE_PRICE_DETECTED');
    }
    if (record.open > record.high || record.open < record.low) {
      anomalies.push('OPEN_OUTSIDE_HIGH_LOW_RANGE');
    }
    if (record.close > record.high || record.close < record.low) {
      anomalies.push('CLOSE_OUTSIDE_HIGH_LOW_RANGE');
    }
    if (record.volume < 0) {
      anomalies.push('NEGATIVE_VOLUME_DETECTED');
    }

    return {
      passed: anomalies.length === 0,
      anomaliesDetectedCount: anomalies.length,
      anomalies
    };
  }
}
