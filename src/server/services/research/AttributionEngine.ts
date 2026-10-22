/**
 * WealthOS v6.6 - Layer Attribution Engine
 * Agent H Deliverable
 * 
 * Computes incremental economic attribution per layer added to the baseline.
 * Baseline = Pure Technical (-0.11R, 4,506 trades, -78.35% MaxDD).
 * Evaluates incremental contribution of FERE, Valuation, Momentum, SmartMoney, and Risk.
 */

import { ReplayPerformanceSummary } from './EconomicReplayEngine.js';

export interface LayerAttributionResult {
  layerName: string;
  configId: string;
  expectancyR: number;
  deltaR: number;
  maxDrawdownPct: number;
  deltaMaxDDPct: number;
  tradeCount: number;
  deltaTradeCount: number;
  profitFactor: number;
  verdict: 'POSITIVE_CONTRIBUTION' | 'NEUTRAL' | 'DEGRADATION';
}

export class AttributionEngine {
  public computeIncrementalAttribution(
    baseline: ReplayPerformanceSummary,
    layeredConfigs: Array<{ layerName: string; summary: ReplayPerformanceSummary }>
  ): LayerAttributionResult[] {
    let prev = baseline;
    const results: LayerAttributionResult[] = [];

    for (const item of layeredConfigs) {
      const deltaR = Number((item.summary.expectancyR - prev.expectancyR).toFixed(3));
      const deltaDD = Number((item.summary.maxDrawdownPct - prev.maxDrawdownPct).toFixed(2));
      const deltaTrades = item.summary.totalTrades - prev.totalTrades;

      let verdict: 'POSITIVE_CONTRIBUTION' | 'NEUTRAL' | 'DEGRADATION' = 'NEUTRAL';
      if (deltaR > 0.05 || deltaDD < -5.0) {
        verdict = 'POSITIVE_CONTRIBUTION';
      } else if (deltaR < -0.05 || deltaDD > 5.0) {
        verdict = 'DEGRADATION';
      }

      results.push({
        layerName: item.layerName,
        configId: item.summary.configId,
        expectancyR: item.summary.expectancyR,
        deltaR,
        maxDrawdownPct: item.summary.maxDrawdownPct,
        deltaMaxDDPct: deltaDD,
        tradeCount: item.summary.totalTrades,
        deltaTradeCount: deltaTrades,
        profitFactor: item.summary.profitFactor,
        verdict
      });

      prev = item.summary;
    }

    return results;
  }
}
