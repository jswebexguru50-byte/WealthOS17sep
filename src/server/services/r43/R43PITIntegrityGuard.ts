export interface PITCheckResult {
  passed: boolean;
  rejectedReasons: string[];
}

export class R43PITIntegrityGuard {
  public static validateRecord(
    decisionDate: string,
    availableAtDate: string,
    securityId?: string
  ): PITCheckResult {
    const reasons: string[] = [];
    const decTime = new Date(decisionDate).getTime();
    const availTime = new Date(availableAtDate).getTime();

    if (isNaN(decTime)) reasons.push('INVALID_DECISION_DATE');
    if (isNaN(availTime)) reasons.push('INVALID_AVAILABLE_AT_DATE');

    if (availTime > decTime) {
      reasons.push(`FUTURE_LEAKAGE_DETECTED_${availableAtDate}_VS_${decisionDate}`);
    }

    if (!securityId) {
      reasons.push('UNRESOLVED_SECURITY_IDENTITY');
    }

    return {
      passed: reasons.length === 0,
      rejectedReasons: reasons
    };
  }

  public static assertNoForbiddenFallbacks(config: any): void {
    const forbidden = [
      'CURRENT_UNIVERSE_FALLBACK',
      'CURRENT_FINANCIALS_FALLBACK',
      'POST_EVENT_DATA',
      'FUTURE_CORPORATE_ACTION',
      'FUTURE_CONSTITUENT',
      'MISSING_PIT_DATA_AS_ZERO',
      'MISSING_FEATURE_AS_FALSE'
    ];

    for (const f of forbidden) {
      if (config && config[f] === true) {
        throw new Error(`STOP_THE_LINE: Forbidden PIT fallback enabled: ${f}`);
      }
    }
  }
}
