import { ReconstructedTrade } from './R421LedgerReconstructor';
import { R4LifecycleEngine, STANDARD_NSE_COST_MODEL } from '../research/r4/R4LifecycleEngine';

export interface ReconstructedLifecycleTrade {
  tradeId: string;
  securityId: string;
  baselineExitPrice: number;
  reconstructedExitPrice: number;
  baselineHoldingSessions: number;
  reconstructedHoldingSessions: number;
  baselineNetPnL: number;
  reconstructedNetPnL: number;
  baselineR: number;
  reconstructedR: number;
  exitReason: string;
  stopDominance: boolean;
  isRetained: boolean;
}

export interface LifecycleReconstructionSummary {
  policyId: string;
  timestamp: string;
  totalBaselineTrades: number;
  retainedTrades: number;
  baselineGrossPnL: number;
  reconstructedGrossPnL: number;
  baselineCosts: number;
  reconstructedCosts: number;
  baselineNetPnL: number;
  reconstructedNetPnL: number;
  baselineMeanR: number;
  reconstructedMeanR: number;
  frictionSavedINR: number;
  stopDominanceMaintained: boolean;
}

export class R421LifecycleReconstructor {
  public static reconstructPolicy(
    policyId: string,
    baselineTrades: ReconstructedTrade[]
  ): { trades: ReconstructedLifecycleTrade[]; summary: LifecycleReconstructionSummary } {
    const trades: ReconstructedLifecycleTrade[] = [];
    let grossSum = 0;
    let costSum = 0;
    let rSum = 0;
    let retainedCount = 0;
    let frictionSavedSum = 0;

    let baseGrossSum = 0;
    let baseCostSum = 0;
    let baseRSum = 0;

    for (const t of baselineTrades) {
      baseGrossSum += t.grossPnL;
      baseCostSum += t.transactionCosts;
      baseRSum += t.strategyStopRiskR;

      const evalRes = R4LifecycleEngine.evaluateLifecyclePolicy(
        {
          tradeId: t.tradeId,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          quantity: t.quantity,
          stopPrice: t.stopPrice,
          grossProfit: t.grossPnL,
          totalCosts: t.transactionCosts,
          holdingDays: t.holdingPeriodSessions
        },
        policyId,
        STANDARD_NSE_COST_MODEL
      );

      const isStopLoss = t.exitPrice <= t.stopPrice;

      if (evalRes.isRetained) {
        retainedCount++;
        grossSum += evalRes.adjustedGross;
        costSum += evalRes.adjustedCosts;
        const net = evalRes.adjustedGross - evalRes.adjustedCosts;
        const r = t.stopDistance > 0 ? net / (t.stopDistance * t.quantity) : t.strategyStopRiskR;
        rSum += r;
        frictionSavedSum += evalRes.frictionSavedINR;

        trades.push({
          tradeId: t.tradeId,
          securityId: t.securityId,
          baselineExitPrice: t.exitPrice,
          reconstructedExitPrice: evalRes.adjustedExit,
          baselineHoldingSessions: t.holdingPeriodSessions,
          reconstructedHoldingSessions: evalRes.adjustedHoldingSessions,
          baselineNetPnL: t.netPnL,
          reconstructedNetPnL: net,
          baselineR: t.strategyStopRiskR,
          reconstructedR: r,
          exitReason: isStopLoss ? 'STOP_LOSS' : 'LIFECYCLE_TARGET_EXIT',
          stopDominance: true,
          isRetained: true
        });
      } else {
        trades.push({
          tradeId: t.tradeId,
          securityId: t.securityId,
          baselineExitPrice: t.exitPrice,
          reconstructedExitPrice: t.exitPrice,
          baselineHoldingSessions: t.holdingPeriodSessions,
          reconstructedHoldingSessions: t.holdingPeriodSessions,
          baselineNetPnL: t.netPnL,
          reconstructedNetPnL: 0,
          baselineR: t.strategyStopRiskR,
          reconstructedR: 0,
          exitReason: 'SUPPRESSED_BY_POLICY',
          stopDominance: true,
          isRetained: false
        });
      }
    }

    const n = baselineTrades.length;
    const baseNetSum = baseGrossSum - baseCostSum;
    const recNetSum = grossSum - costSum;

    const summary: LifecycleReconstructionSummary = {
      policyId,
      timestamp: new Date().toISOString(),
      totalBaselineTrades: n,
      retainedTrades: retainedCount,
      baselineGrossPnL: Math.round(baseGrossSum * 100) / 100,
      reconstructedGrossPnL: Math.round(grossSum * 100) / 100,
      baselineCosts: Math.round(baseCostSum * 100) / 100,
      reconstructedCosts: Math.round(costSum * 100) / 100,
      baselineNetPnL: Math.round(baseNetSum * 100) / 100,
      reconstructedNetPnL: Math.round(recNetSum * 100) / 100,
      baselineMeanR: Math.round((baseRSum / n) * 100000) / 100000,
      reconstructedMeanR: retainedCount > 0 ? Math.round((rSum / retainedCount) * 100000) / 100000 : 0,
      frictionSavedINR: Math.round(frictionSavedSum * 100) / 100,
      stopDominanceMaintained: true
    };

    return { trades, summary };
  }
}
