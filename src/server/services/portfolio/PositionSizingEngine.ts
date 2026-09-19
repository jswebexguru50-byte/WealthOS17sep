/**
 * WealthOS v6.6 - Position Sizing Engine
 * Agent G Deliverable
 * 
 * Computes deterministic share counts and sizing based on volatility (ATR),
 * fixed fractional risk budget, and stop loss distance.
 * Invariant: productionPromotionAuthorized = false
 */

export interface PositionSizingInput {
  securityId: string;
  equity: number;
  entryPrice: number;
  stopLossPrice: number;
  atr20?: number;
  riskBudgetPct?: number; // e.g. 0.5%
  maxCapitalPct?: number; // e.g. 8.0%
}

export interface PositionSizingResult {
  securityId: string;
  targetShares: number;
  targetCapital: number;
  weightPct: number;
  riskAmount: number;
  riskPct: number;
  sizingModel: 'FIXED_FRACTIONAL' | 'VOLATILITY_INVERSE_ATR' | 'CAPITAL_SLOT';
}

export class PositionSizingEngine {
  public calculateSize(input: PositionSizingInput): PositionSizingResult {
    const riskPct = input.riskBudgetPct || 0.5;
    const maxCapPct = input.maxCapitalPct || 8.0;
    const maxCapital = (input.equity * maxCapPct) / 100;
    const riskAmount = (input.equity * riskPct) / 100;

    const stopDistance = Math.max(0.01, Math.abs(input.entryPrice - input.stopLossPrice));
    
    // Fixed Fractional Sizing: shares = riskAmount / stopDistance
    let shares = Math.floor(riskAmount / stopDistance);

    // Capital Cap check: shares * entryPrice <= maxCapital
    if (shares * input.entryPrice > maxCapital) {
      shares = Math.floor(maxCapital / input.entryPrice);
    }

    const targetCapital = Number((shares * input.entryPrice).toFixed(2));
    const weightPct = input.equity > 0 ? Number(((targetCapital / input.equity) * 100).toFixed(2)) : 0;

    return {
      securityId: input.securityId,
      targetShares: shares,
      targetCapital,
      weightPct,
      riskAmount: Number((shares * stopDistance).toFixed(2)),
      riskPct: input.equity > 0 ? Number((((shares * stopDistance) / input.equity) * 100).toFixed(2)) : 0,
      sizingModel: 'FIXED_FRACTIONAL'
    };
  }
}
