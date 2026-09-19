import { ReconstructedTrade } from '../r421/R421LedgerReconstructor';
import { R4LifecycleEngine } from '../research/r4/R4LifecycleEngine';

export interface TimeStabilityPeriodResult {
  periodLabel: string;
  candidate: string;
  tradeCount: number;
  grossPnL: number;
  costs: number;
  netPnL: number;
  meanR: number;
  winRatePct: number;
  profitFactor: number;
}

export class R43TimeStabilityEngine {
  public static evaluateTimeStability(trades: ReconstructedTrade[], candidate: string): TimeStabilityPeriodResult[] {
    const years = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
    const results: TimeStabilityPeriodResult[] = [];

    for (const y of years) {
      let grossSum = 0;
      let costSum = 0;
      let rSum = 0;
      let wins = 0;
      let grossWins = 0;
      let grossLosses = 0;
      let count = 0;

      for (const t of trades) {
        const year = new Date(t.entryDate).getFullYear();
        if (year !== y) continue;

        const evalRes = R4LifecycleEngine.evaluateLifecyclePolicy(t, candidate);
        if (evalRes.isRetained) {
          count++;
          grossSum += evalRes.adjustedGross;
          costSum += evalRes.adjustedCosts;
          const net = evalRes.adjustedGross - evalRes.adjustedCosts;
          const r = t.stopDistance > 0 ? net / (t.stopDistance * t.quantity) : -0.11811;
          rSum += r;

          if (net > 0) {
            wins++;
            grossWins += net;
          } else {
            grossLosses += Math.abs(net);
          }
        }
      }

      const netSum = grossSum - costSum;
      const pf = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 999 : 0;

      results.push({
        periodLabel: y === 2026 ? '2026_YTD' : y.toString(),
        candidate,
        tradeCount: count,
        grossPnL: Math.round(grossSum * 100) / 100,
        costs: Math.round(costSum * 100) / 100,
        netPnL: Math.round(netSum * 100) / 100,
        meanR: count > 0 ? Math.round((rSum / count) * 100000) / 100000 : 0,
        winRatePct: count > 0 ? Math.round((wins / count) * 10000) / 100 : 0,
        profitFactor: Math.round(pf * 100) / 100
      });
    }

    return results;
  }
}
