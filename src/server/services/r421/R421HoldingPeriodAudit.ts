import { ReconstructedTrade } from './R421LedgerReconstructor';

export interface HoldingBucketAnalysis {
  bucketLabel: string;
  tradeCount: number;
  tradeSharePct: number;
  grossPnL: number;
  totalCosts: number;
  netPnL: number;
  meanStrategyStopRiskR: number;
  winRatePct: number;
  averageCostPerTrade: number;
}

export interface HoldingPeriodAuditSummary {
  timestamp: string;
  totalTradesAnalyzed: number;
  buckets: HoldingBucketAnalysis[];
}

export class R421HoldingPeriodAudit {
  public static auditHoldingPeriods(trades: ReconstructedTrade[]): HoldingPeriodAuditSummary {
    const bucketDefs = [
      { label: '0 sessions', min: 0, max: 0 },
      { label: '1 session', min: 1, max: 1 },
      { label: '2 sessions', min: 2, max: 2 },
      { label: '3 sessions', min: 3, max: 3 },
      { label: '4 sessions', min: 4, max: 4 },
      { label: '5 sessions', min: 5, max: 5 },
      { label: '6–10 sessions', min: 6, max: 10 },
      { label: '11–20 sessions', min: 11, max: 20 },
      { label: '21+ sessions', min: 21, max: 9999 }
    ];

    const buckets: HoldingBucketAnalysis[] = [];

    for (const b of bucketDefs) {
      const matched = trades.filter(t => t.holdingPeriodSessions >= b.min && t.holdingPeriodSessions <= b.max);
      const n = matched.length;

      let gross = 0;
      let costs = 0;
      let rSum = 0;
      let wins = 0;

      for (const t of matched) {
        gross += t.grossPnL;
        costs += t.transactionCosts;
        rSum += t.strategyStopRiskR;
        if (t.netPnL > 0) wins++;
      }

      const net = gross - costs;
      buckets.push({
        bucketLabel: b.label,
        tradeCount: n,
        tradeSharePct: Math.round((n / trades.length) * 10000) / 100,
        grossPnL: Math.round(gross * 100) / 100,
        totalCosts: Math.round(costs * 100) / 100,
        netPnL: Math.round(net * 100) / 100,
        meanStrategyStopRiskR: n > 0 ? Math.round((rSum / n) * 100000) / 100000 : 0,
        winRatePct: n > 0 ? Math.round((wins / n) * 10000) / 100 : 0,
        averageCostPerTrade: n > 0 ? Math.round((costs / n) * 100) / 100 : 0
      });
    }

    return {
      timestamp: new Date().toISOString(),
      totalTradesAnalyzed: trades.length,
      buckets
    };
  }
}
