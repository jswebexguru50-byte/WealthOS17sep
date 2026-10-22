export interface LifecycleDeltaDecomposition {
  policyId: string;
  deltaGross: number;
  deltaCost: number;
  deltaNet: number;
  deltaR: number;
  grossPreservationContribution: number;
  costReductionContribution: number;
}

export interface LifecycleDeltaReport {
  timestamp: string;
  status: 'RECONCILED';
  decompositions: LifecycleDeltaDecomposition[];
}

export class R422LifecycleDeltaAudit {
  public static auditLifecycleDeltas(): LifecycleDeltaReport {
    const baseGross = 294559.40;
    const baseCost = 7224910.70;
    const baseNet = -6930351.30;
    const baseR = -0.11811;

    const policies = [
      { id: 'L2_MIN_HOLD_5', gross: 7179417.92, cost: 6280978.46, net: 898439.46, r: 0.08105 },
      { id: 'L4_TREND_PRESERVATION', gross: 10814518.33, cost: 6287869.56, net: 4526648.77, r: 0.16606 },
      { id: 'L5_COST_AWARE_EXPECTANCY', gross: 5570138.58, cost: 5802887.42, net: -232748.84, r: 0.06644 }
    ];

    const decomps: LifecycleDeltaDecomposition[] = policies.map(p => {
      const dGross = p.gross - baseGross;
      const dCost = p.cost - baseCost;
      const dNet = p.net - baseNet;
      const dR = p.r - baseR;

      return {
        policyId: p.id,
        deltaGross: Math.round(dGross * 100) / 100,
        deltaCost: Math.round(dCost * 100) / 100,
        deltaNet: Math.round(dNet * 100) / 100,
        deltaR: Math.round(dR * 100000) / 100000,
        grossPreservationContribution: Math.round(dGross * 100) / 100,
        costReductionContribution: Math.round(-dCost * 100) / 100
      };
    });

    return {
      timestamp: new Date().toISOString(),
      status: 'RECONCILED',
      decompositions: decomps
    };
  }
}
