/**
 * WealthOS v6.6 - Allocation Engine
 * Agent G Deliverable
 * 
 * Computes portfolio asset allocations across Equal Weight, Volatility Weight,
 * and Risk Parity models.
 * Invariant: productionPromotionAuthorized = false
 */

export type AllocationModel =
  | 'EQUAL_WEIGHT'
  | 'INVERSE_VOLATILITY'
  | 'RISK_PARITY'
  | 'CONVICTION_WEIGHTED';

export interface CandidateAllocation {
  securityId: string;
  conviction?: number;
  historicalVolAnnualized?: number;
}

export interface AllocatedWeight {
  securityId: string;
  weightPct: number;
}

export class AllocationEngine {
  public allocate(
    candidates: CandidateAllocation[],
    model: AllocationModel = 'EQUAL_WEIGHT',
    maxGrossPct: number = 100.0
  ): AllocatedWeight[] {
    if (candidates.length === 0) return [];

    switch (model) {
      case 'EQUAL_WEIGHT': {
        const weight = Number((maxGrossPct / candidates.length).toFixed(2));
        return candidates.map(c => ({ securityId: c.securityId, weightPct: weight }));
      }

      case 'INVERSE_VOLATILITY': {
        const invVols = candidates.map(c => 1 / Math.max(c.historicalVolAnnualized || 0.25, 0.05));
        const sumInv = invVols.reduce((a, b) => a + b, 0);
        return candidates.map((c, idx) => ({
          securityId: c.securityId,
          weightPct: Number(((invVols[idx] / sumInv) * maxGrossPct).toFixed(2))
        }));
      }

      case 'CONVICTION_WEIGHTED': {
        const convictions = candidates.map(c => Math.max(c.conviction || 0.5, 0.1));
        const sumConv = convictions.reduce((a, b) => a + b, 0);
        return candidates.map((c, idx) => ({
          securityId: c.securityId,
          weightPct: Number(((convictions[idx] / sumConv) * maxGrossPct).toFixed(2))
        }));
      }

      case 'RISK_PARITY':
      default: {
        // Simplified equal risk contribution
        const invVols = candidates.map(c => 1 / Math.max(c.historicalVolAnnualized || 0.25, 0.05));
        const sumInv = invVols.reduce((a, b) => a + b, 0);
        return candidates.map((c, idx) => ({
          securityId: c.securityId,
          weightPct: Number(((invVols[idx] / sumInv) * maxGrossPct).toFixed(2))
        }));
      }
    }
  }
}
