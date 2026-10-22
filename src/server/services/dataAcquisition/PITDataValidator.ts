export interface PitValidationResult {
  isValid: boolean;
  violationsCount: number;
  violations: string[];
}

export class PITDataValidator {
  public static validateRecord(
    domain: string,
    record: any,
    decisionTimestamp?: string
  ): PitValidationResult {
    const violations: string[] = [];

    if (domain === 'D4_FINANCIAL_STATEMENTS' || domain === 'D5_SHAREHOLDING' || domain === 'D6_EVENTS') {
      if (!record.availableAt) {
        violations.push(`MISSING_AVAILABLE_AT_TIMESTAMP in ${domain} record`);
      } else if (decisionTimestamp) {
        const availTime = new Date(record.availableAt).getTime();
        const decTime = new Date(decisionTimestamp).getTime();
        if (availTime > decTime) {
          violations.push(`TEMPORAL_LOOKAHEAD: availableAt (${record.availableAt}) > decisionTimestamp (${decisionTimestamp})`);
        }
      }
    }

    if (domain === 'D2_DAILY_OHLCV') {
      if (!record.date) {
        violations.push('MISSING_TRADE_DATE');
      }
    }

    return {
      isValid: violations.length === 0,
      violationsCount: violations.length,
      violations
    };
  }
}
