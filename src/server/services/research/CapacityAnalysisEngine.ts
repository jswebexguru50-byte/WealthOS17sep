/**
 * WealthOS v6.6 - Capacity Analysis Engine
 * Agent I Deliverable
 * 
 * Estimates strategy AUM capacity and liquidity decay across participation tiers:
 * - 1% / 2% / 5% / 10% ADV
 */

export interface CapacityTier {
  participationPctADV: number;
  maxDeployableAUM_INR: number;
  estimatedImpactBps: number;
  adjustedExpectancyR: number;
  viable: boolean;
}

export class CapacityAnalysisEngine {
  public estimateCapacity(
    universeADV_INR: number,
    baseExpectancyR: number
  ): CapacityTier[] {
    const tiers = [1.0, 2.0, 5.0, 10.0];

    return tiers.map(p => {
      const maxAUM = (universeADV_INR * (p / 100)) * 20; // 20-day turnover buffer
      const impactBps = p * 4.5; // simple quadratic impact approximation
      const rPenalty = (impactBps / 10000) * 1.5;
      const adjustedR = Number((baseExpectancyR - rPenalty).toFixed(3));

      return {
        participationPctADV: p,
        maxDeployableAUM_INR: Math.round(maxAUM),
        estimatedImpactBps: Number(impactBps.toFixed(1)),
        adjustedExpectancyR: adjustedR,
        viable: adjustedR >= 0.15
      };
    });
  }
}
