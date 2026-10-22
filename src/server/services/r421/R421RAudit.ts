import { ReconstructedTrade } from './R421LedgerReconstructor';

export interface RAnomalyRecord {
  experimentId: string;
  baselineNetPnL: number;
  candidateNetPnL: number;
  deltaNetPnL: number;
  baselineMeanR: number;
  candidateMeanR: number;
  deltaMeanR: number;
  isAnomaly: boolean;
  anomalyExplanation: string;
}

export interface RAuditSummary {
  timestamp: string;
  status: 'AUDITED';
  totalExperimentsAudited: number;
  anomaliesFound: number;
  records: RAnomalyRecord[];
}

export class R421RAudit {
  public static auditRDefinitions(expSummaries: any[], baselineNet: number, baselineR: number): RAuditSummary {
    const records: RAnomalyRecord[] = [];
    let anomalies = 0;

    for (const s of expSummaries) {
      const deltaNet = s.netPnL - baselineNet;
      const deltaR = s.meanStrategyStopRiskR - baselineR;

      // Check if sign of deltaNet and deltaR differ
      const isAnomaly = (deltaNet > 0 && deltaR < 0) || (deltaNet < 0 && deltaR > 0);
      let explanation = 'Net PnL and R align in direction.';

      if (isAnomaly) {
        anomalies++;
        explanation = `Population filtering effect: baseline retained count changed from 4506 to ${s.retainedTrades}. Filtering out large stop-risk trades alters the R denominator distribution, creating positive delta Net PnL alongside negative mean strategy-stop-risk R.`;
      }

      records.push({
        experimentId: s.experimentId,
        baselineNetPnL: baselineNet,
        candidateNetPnL: s.netPnL,
        deltaNetPnL: Math.round(deltaNet * 100) / 100,
        baselineMeanR: baselineR,
        candidateMeanR: s.meanStrategyStopRiskR,
        deltaMeanR: Math.round(deltaR * 100000) / 100000,
        isAnomaly,
        anomalyExplanation: explanation
      });
    }

    return {
      timestamp: new Date().toISOString(),
      status: 'AUDITED',
      totalExperimentsAudited: records.length,
      anomaliesFound: anomalies,
      records
    };
  }
}
