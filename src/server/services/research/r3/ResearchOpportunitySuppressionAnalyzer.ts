import { ReplayedTrade } from './ResearchBacktestEngine';

export interface SuppressionClassification {
  tradeId: string;
  strategyId: string;
  securityId: string;
  decisionTimestamp: string;
  category: 'WINNER_SUPPRESSED' | 'LOSER_SUPPRESSED' | 'BREAKEVEN_SUPPRESSED' | 'WINNER_RETAINED' | 'LOSER_RETAINED';
  netPnl: number;
  strategyStopRiskR: number;
  suppressionReason?: string;
}

export interface SuppressionSummary {
  totalTrades: number;
  winnerSuppressedCount: number;
  loserSuppressedCount: number;
  breakevenSuppressedCount: number;
  winnerRetainedCount: number;
  loserRetainedCount: number;
  netPnlSavedFromLosers: number;
  netPnlLostFromWinners: number;
  netSuppressionImpact: number;
}

export class ResearchOpportunitySuppressionAnalyzer {
  public static analyze(trades: ReplayedTrade[]): {
    records: SuppressionClassification[];
    summary: SuppressionSummary;
  } {
    const records: SuppressionClassification[] = [];
    let winnerSuppressedCount = 0;
    let loserSuppressedCount = 0;
    let breakevenSuppressedCount = 0;
    let winnerRetainedCount = 0;
    let loserRetainedCount = 0;
    let netPnlSavedFromLosers = 0;
    let netPnlLostFromWinners = 0;

    for (const t of trades) {
      if (t.status === 'SUPPRESSED') {
        if (t.net > 0) {
          winnerSuppressedCount++;
          netPnlLostFromWinners += t.net;
          records.push({
            tradeId: t.tradeId,
            strategyId: t.strategyId,
            securityId: t.securityId,
            decisionTimestamp: t.decisionTimestamp,
            category: 'WINNER_SUPPRESSED',
            netPnl: t.net,
            strategyStopRiskR: t.strategyStopRiskR,
            suppressionReason: t.suppressionReason
          });
        } else if (t.net < 0) {
          loserSuppressedCount++;
          netPnlSavedFromLosers += Math.abs(t.net);
          records.push({
            tradeId: t.tradeId,
            strategyId: t.strategyId,
            securityId: t.securityId,
            decisionTimestamp: t.decisionTimestamp,
            category: 'LOSER_SUPPRESSED',
            netPnl: t.net,
            strategyStopRiskR: t.strategyStopRiskR,
            suppressionReason: t.suppressionReason
          });
        } else {
          breakevenSuppressedCount++;
          records.push({
            tradeId: t.tradeId,
            strategyId: t.strategyId,
            securityId: t.securityId,
            decisionTimestamp: t.decisionTimestamp,
            category: 'BREAKEVEN_SUPPRESSED',
            netPnl: 0,
            strategyStopRiskR: 0,
            suppressionReason: t.suppressionReason
          });
        }
      } else {
        if (t.net >= 0) {
          winnerRetainedCount++;
          records.push({
            tradeId: t.tradeId,
            strategyId: t.strategyId,
            securityId: t.securityId,
            decisionTimestamp: t.decisionTimestamp,
            category: 'WINNER_RETAINED',
            netPnl: t.net,
            strategyStopRiskR: t.strategyStopRiskR
          });
        } else {
          loserRetainedCount++;
          records.push({
            tradeId: t.tradeId,
            strategyId: t.strategyId,
            securityId: t.securityId,
            decisionTimestamp: t.decisionTimestamp,
            category: 'LOSER_RETAINED',
            netPnl: t.net,
            strategyStopRiskR: t.strategyStopRiskR
          });
        }
      }
    }

    const netSuppressionImpact = netPnlSavedFromLosers - netPnlLostFromWinners;

    const summary: SuppressionSummary = {
      totalTrades: trades.length,
      winnerSuppressedCount,
      loserSuppressedCount,
      breakevenSuppressedCount,
      winnerRetainedCount,
      loserRetainedCount,
      netPnlSavedFromLosers: Math.round(netPnlSavedFromLosers * 100) / 100,
      netPnlLostFromWinners: Math.round(netPnlLostFromWinners * 100) / 100,
      netSuppressionImpact: Math.round(netSuppressionImpact * 100) / 100
    };

    return { records, summary };
  }
}
