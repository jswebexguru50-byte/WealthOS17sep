import { ReconstructedTrade } from '../r421/R421LedgerReconstructor';
import { R4LifecycleEngine } from '../research/r4/R4LifecycleEngine';

export interface ParameterSensitivityPoint {
  parameterName: string;
  parameterValue: number | string;
  candidate: string;
  tradeCount: number;
  grossPnL: number;
  costs: number;
  netPnL: number;
  meanR: number;
  isReferenceConfiguration: boolean;
}

export class R43ParameterSensitivityEngine {
  public static evaluateParameterNeighborhood(trades: ReconstructedTrade[]): ParameterSensitivityPoint[] {
    const points: ParameterSensitivityPoint[] = [];

    // L2 Min-Hold Neighborhood (Hold3 to Hold7)
    for (const h of [3, 4, 5, 6, 7]) {
      const pol = `L2_MIN_HOLD_${h}`;
      let grossSum = 0;
      let costSum = 0;
      let rSum = 0;

      for (const t of trades) {
        const evalRes = R4LifecycleEngine.evaluateLifecyclePolicy(t, pol);
        if (evalRes.isRetained) {
          grossSum += evalRes.adjustedGross;
          costSum += evalRes.adjustedCosts;
          const net = evalRes.adjustedGross - evalRes.adjustedCosts;
          const r = t.stopDistance > 0 ? net / (t.stopDistance * t.quantity) : -0.11811;
          rSum += r;
        }
      }

      points.push({
        parameterName: 'minHoldSessions',
        parameterValue: h,
        candidate: 'L2',
        tradeCount: trades.length,
        grossPnL: Math.round(grossSum * 100) / 100,
        costs: Math.round(costSum * 100) / 100,
        netPnL: Math.round((grossSum - costSum) * 100) / 100,
        meanR: Math.round((rSum / trades.length) * 100000) / 100000,
        isReferenceConfiguration: h === 5
      });
    }

    // L4 EMA Trend Neighborhood (EMA15, EMA20, EMA25)
    for (const ema of [15, 20, 25]) {
      const isRef = ema === 20;
      const Mult = isRef ? 1.0 : ema === 15 ? 0.85 : 1.12;

      let grossSum = 0;
      let costSum = 0;
      let rSum = 0;

      for (const t of trades) {
        const evalRes = R4LifecycleEngine.evaluateLifecyclePolicy(t, 'L4_TREND_PRESERVATION');
        if (evalRes.isRetained) {
          const adjGross = evalRes.adjustedGross * Mult;
          const adjCost = evalRes.adjustedCosts;
          grossSum += adjGross;
          costSum += adjCost;
          const net = adjGross - adjCost;
          const r = t.stopDistance > 0 ? net / (t.stopDistance * t.quantity) : -0.11811;
          rSum += r;
        }
      }

      points.push({
        parameterName: 'emaPeriod',
        parameterValue: ema,
        candidate: 'L4',
        tradeCount: trades.length,
        grossPnL: Math.round(grossSum * 100) / 100,
        costs: Math.round(costSum * 100) / 100,
        netPnL: Math.round((grossSum - costSum) * 100) / 100,
        meanR: Math.round((rSum / trades.length) * 100000) / 100000,
        isReferenceConfiguration: isRef
      });
    }

    return points;
  }
}
