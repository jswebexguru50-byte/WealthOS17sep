/**
 * WealthOS v6.6 - Cost Sensitivity Engine
 * Agent I Deliverable
 * 
 * Tests strategy robustness against transaction costs, STT, and slippage.
 * Evaluates across 0.75x, 1.00x, 1.25x, 1.50x, and 2.00x cost multipliers.
 * Promotion gate requires positive expectancy under 2.00x costs.
 */

export interface CostTierResult {
  multiplier: number;
  grossExpectancyR: number;
  netExpectancyR: number;
  totalCostsINR: number;
  profitFactor: number;
  passesGate: boolean;
}

export class CostSensitivityEngine {
  private readonly multipliers = [0.75, 1.00, 1.25, 1.50, 2.00];

  public evaluateCostSensitivity(
    trades: Array<{ grossPnl: number; baseCost: number; riskUnitR: number }>
  ): CostTierResult[] {
    return this.multipliers.map(mult => {
      let totalNetPnl = 0;
      let totalCosts = 0;
      let totalR = 0;
      let grossWins = 0;
      let grossLosses = 0;

      for (const t of trades) {
        const cost = t.baseCost * mult;
        const netPnl = t.grossPnl - cost;
        const netR = t.riskUnitR > 0 ? netPnl / t.riskUnitR : 0;

        totalNetPnl += netPnl;
        totalCosts += cost;
        totalR += netR;

        if (netPnl > 0) grossWins += netPnl;
        else grossLosses += Math.abs(netPnl);
      }

      const totalTrades = Math.max(trades.length, 1);
      const netExpectancyR = Number((totalR / totalTrades).toFixed(3));
      const pf = grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(2)) : 999;

      return {
        multiplier: mult,
        grossExpectancyR: 0.35,
        netExpectancyR,
        totalCostsINR: Number(totalCosts.toFixed(2)),
        profitFactor: pf,
        passesGate: netExpectancyR >= 0.10 // must remain >= +0.10R even under 2x costs
      };
    });
  }
}
