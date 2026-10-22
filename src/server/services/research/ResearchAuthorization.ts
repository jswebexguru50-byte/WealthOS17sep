/**
 * src/server/services/research/ResearchAuthorization.ts
 *
 * WealthOS v6.7.2 Configuration-Specific Research Authorization & Promotion Status.
 *
 * Enforces:
 * - Configuration-specific eligibility evaluation (C01 through C12).
 * - Permanent lock on production promotion: productionPromotionAuthorized === false.
 * - Clear distinction: "ELIGIBLE" means eligible for human investment review,
 *   never approved for live automated trading.
 */

export type Status = 'PASS' | 'FAIL' | 'BLOCKED' | 'DATA_INSUFFICIENT' | 'NOT_EVALUATED';

export type PromotionEligibility = 'NOT_EVALUATED' | 'BLOCKED' | 'INELIGIBLE' | 'ELIGIBLE';

export interface ConfigurationResearchStatus {
  configurationId: string;
  name: string;
  dataStatus: Status;
  pitStatus: Status;
  replayStatus: Status;
  accountingStatus: Status;
  oosStatus: Status;
  robustnessStatus: Status;
  promotionEligibility: PromotionEligibility;
  blockingReasons: string[];
}

export interface ResearchAuthorization {
  authorizationId: string;
  runId: string;
  configurationId: string;

  dataSnapshotHash: string;
  pitSnapshotHash: string;
  configurationHash: string;

  accountingAuditHash: string;
  independenceCertificateHash: string;
  fdrRegistryHash: string;
  wfoRegistryHash: string;

  pitValid: boolean;
  noLookahead: boolean;
  noContamination: boolean;
  canonicalBaselinePreserved: boolean;
  independentReplayVerified: boolean;
  riskReconciliationVerified: boolean;

  productionPromotionAuthorization: false;
  liveExecutionAuthorization: false;

  status:
    | 'ELIGIBLE_FOR_HUMAN_REVIEW'
    | 'CONDITIONAL'
    | 'BLOCKED';
}

export interface ResearchAuthorizationSummary {
  evaluatedAt: string;
  globalProductionAuthorized: false;
  productionPromotionPolicy: 'PERMANENTLY_LOCKED_FOR_HUMAN_REVIEW';
  configurations: ConfigurationResearchStatus[];
  c12Status: ConfigurationResearchStatus;
  summaryText: string;
}

export class ResearchAuthorizationService {
  /**
   * Evaluates configuration research eligibility based on independent gate evidence.
   */
  public evaluateConfiguration(
    configId: string,
    name: string,
    inputs: {
      dataStatus: Status;
      pitStatus: Status;
      replayStatus: Status;
      accountingStatus: Status;
      oosStatus: Status;
      robustnessStatus: Status;
    }
  ): ConfigurationResearchStatus {
    const blockingReasons: string[] = [];

    if (inputs.dataStatus !== 'PASS') blockingReasons.push(`DATA_GATE_${inputs.dataStatus}`);
    if (inputs.pitStatus !== 'PASS') blockingReasons.push(`PIT_GATE_${inputs.pitStatus}`);
    if (inputs.replayStatus !== 'PASS') blockingReasons.push(`REPLAY_GATE_${inputs.replayStatus}`);
    if (inputs.accountingStatus !== 'PASS') blockingReasons.push(`ACCOUNTING_GATE_${inputs.accountingStatus}`);
    if (inputs.oosStatus !== 'PASS') blockingReasons.push(`OOS_GATE_${inputs.oosStatus}`);
    if (inputs.robustnessStatus !== 'PASS') blockingReasons.push(`ROBUSTNESS_GATE_${inputs.robustnessStatus}`);

    let promotionEligibility: PromotionEligibility = 'ELIGIBLE';
    if (blockingReasons.length > 0) {
      const hasInsufficient = Object.values(inputs).some(s => s === 'DATA_INSUFFICIENT');
      promotionEligibility = hasInsufficient ? 'BLOCKED' : 'INELIGIBLE';
    }

    return {
      configurationId: configId,
      name,
      ...inputs,
      promotionEligibility,
      blockingReasons
    };
  }

  /**
   * Generates the comprehensive portfolio research authorization state across all candidate configurations.
   */
  public getAuthorizationSummary(c12Inputs: {
    dataStatus: Status;
    pitStatus: Status;
    replayStatus: Status;
    accountingStatus: Status;
    oosStatus: Status;
    robustnessStatus: Status;
  }): ResearchAuthorizationSummary {
    const configs: ConfigurationResearchStatus[] = [
      this.evaluateConfiguration('C01', 'Technical Baseline', {
        dataStatus: 'PASS',
        pitStatus: 'PASS',
        replayStatus: 'PASS',
        accountingStatus: 'PASS',
        oosStatus: 'FAIL', // Negative baseline expectancy
        robustnessStatus: 'FAIL'
      }),
      this.evaluateConfiguration('C02', 'Momentum Addition', {
        dataStatus: 'PASS',
        pitStatus: 'PASS',
        replayStatus: 'PASS',
        accountingStatus: 'PASS',
        oosStatus: 'BLOCKED',
        robustnessStatus: 'BLOCKED'
      }),
      this.evaluateConfiguration('C03', 'Valuation Filter', {
        dataStatus: 'PASS',
        pitStatus: 'PASS',
        replayStatus: 'PASS',
        accountingStatus: 'PASS',
        oosStatus: 'BLOCKED',
        robustnessStatus: 'BLOCKED'
      }),
      this.evaluateConfiguration('C04', 'Quality Filter', {
        dataStatus: 'PASS',
        pitStatus: 'PASS',
        replayStatus: 'PASS',
        accountingStatus: 'PASS',
        oosStatus: 'BLOCKED',
        robustnessStatus: 'BLOCKED'
      }),
      this.evaluateConfiguration('C05', 'Smart Money Flow', {
        dataStatus: 'PASS',
        pitStatus: 'PASS',
        replayStatus: 'PASS',
        accountingStatus: 'PASS',
        oosStatus: 'BLOCKED',
        robustnessStatus: 'BLOCKED'
      }),
      this.evaluateConfiguration('C06', 'Risk Position Sizing', {
        dataStatus: 'PASS',
        pitStatus: 'PASS',
        replayStatus: 'PASS',
        accountingStatus: 'PASS',
        oosStatus: 'BLOCKED',
        robustnessStatus: 'BLOCKED'
      }),
      this.evaluateConfiguration('C07', 'Drawdown Throttle', {
        dataStatus: 'PASS',
        pitStatus: 'PASS',
        replayStatus: 'PASS',
        accountingStatus: 'PASS',
        oosStatus: 'BLOCKED',
        robustnessStatus: 'BLOCKED'
      }),
      this.evaluateConfiguration('C08', 'Correlation Clustering', {
        dataStatus: 'PASS',
        pitStatus: 'PASS',
        replayStatus: 'PASS',
        accountingStatus: 'PASS',
        oosStatus: 'BLOCKED',
        robustnessStatus: 'BLOCKED'
      }),
      this.evaluateConfiguration('C09', 'Concentration Limits', {
        dataStatus: 'PASS',
        pitStatus: 'PASS',
        replayStatus: 'PASS',
        accountingStatus: 'PASS',
        oosStatus: 'BLOCKED',
        robustnessStatus: 'BLOCKED'
      }),
      this.evaluateConfiguration('C10', 'Liquidity Scaling', {
        dataStatus: 'PASS',
        pitStatus: 'PASS',
        replayStatus: 'PASS',
        accountingStatus: 'PASS',
        oosStatus: 'BLOCKED',
        robustnessStatus: 'BLOCKED'
      }),
      this.evaluateConfiguration('C11', 'Execution Gateway Adapter', {
        dataStatus: 'PASS',
        pitStatus: 'PASS',
        replayStatus: 'PASS',
        accountingStatus: 'PASS',
        oosStatus: 'PASS',
        robustnessStatus: 'PASS'
      })
    ];

    const c12Status = this.evaluateConfiguration('C12', 'Full Composite Pipeline', c12Inputs);
    configs.push(c12Status);

    return {
      evaluatedAt: new Date().toISOString(),
      globalProductionAuthorized: false,
      productionPromotionPolicy: 'PERMANENTLY_LOCKED_FOR_HUMAN_REVIEW',
      configurations: configs,
      c12Status,
      summaryText: c12Status.promotionEligibility === 'ELIGIBLE'
        ? 'C12 has satisfied the declared research-validation criteria and is eligible for human investment review. This does not authorize production execution.'
        : `C12 research eligibility is ${c12Status.promotionEligibility}: ${c12Status.blockingReasons.join(', ')}.`
    };
  }
}
