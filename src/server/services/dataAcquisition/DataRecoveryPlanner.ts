import { DataGap } from './DataGapDetector';

export interface RecoveryPlanItem {
  planId: string;
  gapId: string;
  securityId: string;
  domain: string;
  primarySourceId: string;
  alternateSourceId: string | null;
  priority: number;
  scheduledStart: string;
}

export class DataRecoveryPlanner {
  public static planRecovery(gaps: DataGap[]): RecoveryPlanItem[] {
    const plans: RecoveryPlanItem[] = [];
    for (const gap of gaps) {
      let primarySource = 'SRC_UPSTOX_V2';
      let altSource: string | null = 'SRC_NSE_BHAVCOPY';

      if (gap.domain === 'D4_FINANCIAL_STATEMENTS' || gap.domain === 'D5_SHAREHOLDING') {
        primarySource = 'SRC_FERE_FUNDAMENTALS';
        altSource = 'SRC_CORPORATE_ANNOUNCEMENTS';
      } else if (gap.domain === 'D3_CORPORATE_ACTIONS' || gap.domain === 'D6_EVENTS') {
        primarySource = 'SRC_CORPORATE_ANNOUNCEMENTS';
        altSource = 'SRC_NSE_BHAVCOPY';
      }

      plans.push({
        planId: `REC_${gap.gapId}`,
        gapId: gap.gapId,
        securityId: gap.securityId,
        domain: gap.domain,
        primarySourceId: primarySource,
        alternateSourceId: altSource,
        priority: 1, // Elevated priority for gap fills
        scheduledStart: new Date().toISOString()
      });
    }
    return plans;
  }
}
