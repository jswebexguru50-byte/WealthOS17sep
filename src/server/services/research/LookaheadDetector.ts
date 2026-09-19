export interface LookaheadViolation {
  decisionId: string;
  securityId: string;
  dataset: string;
  decisionTimestamp: string;
  informationAvailableAt: string;
  violationType:
    | 'FUTURE_FACT'
    | 'FUTURE_PRICE'
    | 'FUTURE_MEMBERSHIP'
    | 'FUTURE_CORPORATE_ACTION'
    | 'FUTURE_SHAREHOLDING'
    | 'FUTURE_SMART_MONEY'
    | 'FUTURE_DERIVATIVE';
  details: string;
}

export interface PITValidationResult {
  passed: boolean;
  totalDecisionsAudited: number;
  violationsCount: number;
  violations: LookaheadViolation[];
  economicReplayAuthorization: boolean;
  auditedAt: string;
}

export class LookaheadDetector {
  private violations: LookaheadViolation[] = [];

  public auditDecisionFact(
    decisionId: string,
    securityId: string,
    decisionTimestamp: string,
    availableAt: string,
    dataset: string,
    violationType: LookaheadViolation['violationType'] = 'FUTURE_FACT'
  ): void {
    const decisionTime = new Date(decisionTimestamp).getTime();
    const factAvailableTime = new Date(availableAt).getTime();

    if (factAvailableTime > decisionTime) {
      this.violations.push({
        decisionId,
        securityId,
        dataset,
        decisionTimestamp,
        informationAvailableAt: availableAt,
        violationType,
        details: `PIT VIOLATION: Information available at ${availableAt} used at decision timestamp ${decisionTimestamp}`
      });
    }
  }

  public getResult(totalDecisions: number): PITValidationResult {
    const passed = this.violations.length === 0;
    return {
      passed,
      totalDecisionsAudited: totalDecisions,
      violationsCount: this.violations.length,
      violations: this.violations,
      economicReplayAuthorization: passed,
      auditedAt: new Date().toISOString()
    };
  }
}
