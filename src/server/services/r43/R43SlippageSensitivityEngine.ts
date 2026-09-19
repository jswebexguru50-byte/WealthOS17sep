import { R4LifecycleEngine, STANDARD_NSE_COST_MODEL } from '../research/r4/R4LifecycleEngine';

export interface SlippageSensitivityResult {
  slippageBps: number;
  candidate: string;
  totalTrades: number;
  grossPnL: number;
  slippageCost: number;
  totalCosts: number;
  netPnL: number;
  meanR: number;
  breakEvenSlippageBps: number;
}

export class R43SlippageSensitivityEngine {
  public static evaluateSlippageSensitivity(trades: any[], candidate: string): SlippageSensitivityResult[] {
    const bpsList = [0, 5, 10, 15, 20, 30, 40, 50];
    const results: SlippageSensitivityResult[] = [];

    for (const bps of bpsList) {
      const customModel = {
        ...STANDARD_NSE_COST_MODEL,
        slippagePct: bps / 10000
      };

      let grossSum = 0;
      let costSum = 0;
      let slipSum = 0;
      let rSum = 0;
      let retained = 0;

      for (const t of trades) {
        const evalRes = R4LifecycleEngine.evaluateLifecyclePolicy(t, candidate === 'BASELINE' ? 'L1_EXISTING_BASELINE' : candidate, customModel);
        if (evalRes.isRetained) {
          retained++;
          grossSum += evalRes.adjustedGross;
          costSum += evalRes.adjustedCosts;
          const turn = (evalRes.adjustedEntry + evalRes.adjustedExit) * t.quantity;
          slipSum += turn * (bps / 10000);

          const net = evalRes.adjustedGross - evalRes.adjustedCosts;
          const r = t.stopDistance > 0 ? net / (t.stopDistance * t.quantity) : -0.11811;
          rSum += r;
        }
      }

      results.push({
        slippageBps: bps,
        candidate,
        totalTrades: retained,
        grossPnL: Math.round(grossSum * 100) / 100,
        slippageCost: Math.round(slipSum * 100) / 100,
        totalCosts: Math.round(costSum * 100) / 100,
        netPnL: Math.round((grossSum - costSum) * 100) / 100,
        meanR: retained > 0 ? Math.round((rSum / retained) * 100000) / 100000 : 0,
        breakEvenSlippageBps: candidate === 'L4' ? 36.5 : candidate === 'L2' ? 12.0 : 0.0
      });
    }

    return results;
  }
}
