/**
 * DynamicBarbellCapitalGovernor.ts — v5.4.1 (Production Master)
 * Bridges Hidden Markov Model (HMM) Macro Regimes with Dynamic 2-Sleeve Capital Allocation.
 * 
 * Allocations:
 * - BULL_TREND:       55% Core / 35% Tactical / 10% Cash (Full Kelly, 1.0x tactical risk)
 * - HIGH_VOLATILITY:  50% Core / 25% Tactical / 25% Cash (0.65x tactical risk)
 * - MEAN_REVERTING:   45% Core / 20% Tactical / 35% Cash (0.50x tactical risk)
 * - BEAR_TREND:       40% Core (Defensive Moats) / 0% Tactical (Frozen) / 60% Cash (0.0x risk)
 */

export enum MacroRegimeState {
  BULL_TREND = 'BULL_TREND',
  HIGH_VOLATILITY = 'HIGH_VOLATILITY',
  MEAN_REVERTING = 'MEAN_REVERTING',
  BEAR_TREND = 'BEAR_TREND'
}

export interface PortfolioAllocationTarget {
  coreCompoundersPct: number;    // Sleeve A Target (3-10 Year Moats)
  tacticalMomentumPct: number;   // Sleeve B Target (5-Day to 6-Month Swings)
  liquidCashBufferPct: number;   // Dry powder / Arbitrage buffer
  tacticalRiskMultiplier: number;// Position sizing risk dampener (0.0 to 1.0)
  regimeState: MacroRegimeState;
  guidanceNotes: string;
}

export class DynamicBarbellCapitalGovernor {
  /**
   * Computes optimal capital allocation targets based on the prevailing macro state
   */
  public static calculateTargetAllocation(currentState: MacroRegimeState | string): PortfolioAllocationTarget {
    const normalizedState = (currentState || '').toUpperCase();

    if (normalizedState.includes('BEAR') || normalizedState.includes('CRISIS') || normalizedState.includes('CONTRACTION')) {
      return {
        coreCompoundersPct: 40.0, // Anchored in resilient defensive moats only
        tacticalMomentumPct: 0.0,  // Complete freeze on all long swing entries
        liquidCashBufferPct: 60.0, // 60% dry powder in safe liquid instruments
        tacticalRiskMultiplier: 0.0,
        regimeState: MacroRegimeState.BEAR_TREND,
        guidanceNotes: 'Macro Contraction / Bear Regime: Zero tactical equity risk. 60% cash buffer preserved for debt cycle trough.'
      };
    }

    if (normalizedState.includes('VOLATIL') || normalizedState.includes('EXPANSION')) {
      return {
        coreCompoundersPct: 50.0,
        tacticalMomentumPct: 25.0,
        liquidCashBufferPct: 25.0,
        tacticalRiskMultiplier: 0.65,
        regimeState: MacroRegimeState.HIGH_VOLATILITY,
        guidanceNotes: 'Elevated Volatility Expansion: Tactical risk throttled to 65%. 25% cash reserve held to absorb swings.'
      };
    }

    if (normalizedState.includes('MEAN') || normalizedState.includes('NEUTRAL') || normalizedState.includes('RANGE')) {
      return {
        coreCompoundersPct: 45.0,
        tacticalMomentumPct: 20.0,
        liquidCashBufferPct: 35.0,
        tacticalRiskMultiplier: 0.50,
        regimeState: MacroRegimeState.MEAN_REVERTING,
        guidanceNotes: 'Choppy Consolidation: Trend breakouts throttled; 50% risk dampener active. 35% liquidity.'
      };
    }

    // Default: BULL_TREND (Low Volatility)
    return {
      coreCompoundersPct: 55.0,
      tacticalMomentumPct: 35.0,
      liquidCashBufferPct: 10.0,
      tacticalRiskMultiplier: 1.0,
      regimeState: MacroRegimeState.BULL_TREND,
      guidanceNotes: 'Optimal Compounding Environment: Full Kelly / Risk Parity active. Full participation in high-velocity momentum.'
    };
  }
}
