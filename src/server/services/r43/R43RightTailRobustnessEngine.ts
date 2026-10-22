import { ReconstructedTrade } from '../r421/R421LedgerReconstructor';
import { R4LifecycleEngine } from '../research/r4/R4LifecycleEngine';

export interface TailScenarioResult {
  scenario: string;
  candidate: string;
  executedTradesCount: number;
  retainedNetPnL: number;
  incrementalNetPnL: number;
  topWinnerContributionPct: number;
  retainedMeanR: number;
  winRatePct: number;
  profitFactor: number;
}

export class R43RightTailRobustnessEngine {
  public static evaluateTailRobustness(trades: ReconstructedTrade[], candidate: string): TailScenarioResult[] {
    // Evaluate replayed candidate trades
    const candidateTrades: any[] = [];
    for (const t of trades) {
      const res = R4LifecycleEngine.evaluateLifecyclePolicy(t, candidate);
      if (res.isRetained) {
        candidateTrades.push({
          ...t,
          netPnL: res.adjustedNet,
          grossPnL: res.adjustedGross,
          cost: res.adjustedCosts
        });
      }
    }

    const sortedByNet = [...candidateTrades].sort((a, b) => b.netPnL - a.netPnL);
    const totalN = sortedByNet.length;
    const baseTotalNet = trades.reduce((sum, t) => sum + t.netPnL, 0);

    const scenarios = [
      { id: 'FULL', exclPct: 0.0, winsorizePct: 0.0 },
      { id: 'EXCLUDE_TOP_0.1%', exclPct: 0.001, winsorizePct: 0.0 },
      { id: 'EXCLUDE_TOP_0.5%', exclPct: 0.005, winsorizePct: 0.0 },
      { id: 'EXCLUDE_TOP_1%', exclPct: 0.01, winsorizePct: 0.0 },
      { id: 'EXCLUDE_TOP_2%', exclPct: 0.02, winsorizePct: 0.0 },
      { id: 'EXCLUDE_TOP_5%', exclPct: 0.05, winsorizePct: 0.0 },
      { id: 'WINSORIZED_1%', exclPct: 0.0, winsorizePct: 0.01 },
      { id: 'WINSORIZED_2%', exclPct: 0.0, winsorizePct: 0.02 }
    ];

    const results: TailScenarioResult[] = [];

    for (const sc of scenarios) {
      let subset = [...sortedByNet];
      if (sc.exclPct > 0) {
        const exclCount = Math.max(1, Math.round(totalN * sc.exclPct));
        subset = subset.slice(exclCount);
      } else if (sc.winsorizePct > 0) {
        const winCut = Math.max(1, Math.round(totalN * sc.winsorizePct));
        const capVal = subset[winCut].netPnL;
        subset = subset.map((t, idx) => (idx < winCut ? { ...t, netPnL: capVal } : t));
      }

      let netSum = 0;
      let rSum = 0;
      let wins = 0;
      let grossWins = 0;
      let grossLosses = 0;

      for (const t of subset) {
        netSum += t.netPnL;
        rSum += t.strategyStopRiskR;
        if (t.netPnL > 0) {
          wins++;
          grossWins += t.netPnL;
        } else {
          grossLosses += Math.abs(t.netPnL);
        }
      }

      const top1Count = Math.max(1, Math.round(totalN * 0.01));
      const top1Net = sortedByNet.slice(0, top1Count).reduce((sum, t) => sum + t.netPnL, 0);
      const top1Pct = netSum !== 0 ? Math.round((top1Net / Math.abs(netSum)) * 10000) / 100 : 0;

      results.push({
        scenario: sc.id,
        candidate,
        executedTradesCount: subset.length,
        retainedNetPnL: Math.round(netSum * 100) / 100,
        incrementalNetPnL: Math.round((netSum - baseTotalNet) * 100) / 100,
        topWinnerContributionPct: top1Pct,
        retainedMeanR: subset.length > 0 ? Math.round((rSum / subset.length) * 100000) / 100000 : 0,
        winRatePct: subset.length > 0 ? Math.round((wins / subset.length) * 10000) / 100 : 0,
        profitFactor: grossLosses > 0 ? Math.round((grossWins / grossLosses) * 100) / 100 : 999
      });
    }

    return results;
  }
}
