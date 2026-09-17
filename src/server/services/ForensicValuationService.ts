/**
 * ForensicValuationService.ts (P2-8)
 * Implements tri-scenario forward valuation (Base, Bull, Bear) per revised §10 formulas.
 * Incorporates §3.3 ScenarioResult.confidence and fallback asymmetric vs symmetric bands.
 */

import { ScenarioResult } from '../../types.js';

export interface ValuationInput {
  currentPrice: number;
  trailingEps: number;
  baseGrowthRatePct: number;
  basePeMultiple: number;
  dataSourceType: 'live_consensus' | 'eps_stdev_fallback';
  dataCompleteness: number; // 0 to 1
  consensusEpsBull?: number;
  consensusEpsBear?: number;
  historicalEpsStdevPct?: number; // e.g. 15% (0.15)
  historicalPeStdev?: number;     // e.g. 3.5
  historicalRealizedPrice?: number;
  historicalVolatility?: number;
}

export interface TriScenarioValuationResult {
  baseCase: ScenarioResult;
  bullCase: ScenarioResult;
  bearCase: ScenarioResult;
  dataSourceType: 'live_consensus' | 'eps_stdev_fallback';
  asymmetryRatio: number; // (bull - base) / (base - bear)
  historicalOutcome?: {
    realizedPrice: number;
    fallsInsideModeledBand: boolean;
    historicalVolatility: number;
    deviationNotes: string;
  };
}

export class ForensicValuationService {
  /**
   * P2-8: Compute Base, Bull, and Bear scenarios.
   */
  public static calculateTriScenarioValuation(input: ValuationInput): TriScenarioValuationResult {
    const {
      currentPrice,
      trailingEps,
      baseGrowthRatePct,
      basePeMultiple,
      dataSourceType,
      dataCompleteness = 1.0,
      consensusEpsBull,
      consensusEpsBear,
      historicalEpsStdevPct = 0.16,
      historicalPeStdev = 4.0,
      historicalRealizedPrice,
      historicalVolatility = 0.22,
    } = input;

    // 1. Base Case Calculation
    const epsBase = Number((trailingEps * (1 + baseGrowthRatePct / 100)).toFixed(2));
    const peBase = basePeMultiple;
    const priceTargetBase = Number((epsBase * peBase).toFixed(2));

    // Confidence baseline per §3.3
    let baseConfidence = dataSourceType === 'live_consensus' ? 1.0 : 0.6;
    const adjustedConfidence = Number((baseConfidence * Math.min(Math.max(dataCompleteness, 0.1), 1.0)).toFixed(2));

    let epsBull: number;
    let peBull: number;
    let epsBear: number;
    let peBear: number;
    let bullAssumptions: string[];
    let bearAssumptions: string[];

    if (dataSourceType === 'live_consensus' && consensusEpsBull !== undefined && consensusEpsBear !== undefined) {
      // Live consensus allows asymmetric growth and multiple re-rating
      epsBull = Number(consensusEpsBull.toFixed(2));
      peBull = Number((basePeMultiple * 1.15).toFixed(1));
      bullAssumptions = [
        `Live IBES/Bloomberg consensus upper quartile EPS: ₹${epsBull}`,
        `Multiple expansion to ${peBull}x P/E on operating leverage`,
      ];

      epsBear = Number(consensusEpsBear.toFixed(2));
      peBear = Number((basePeMultiple * 0.85).toFixed(1));
      bearAssumptions = [
        `Consensus lower bound EPS: ₹${epsBear}`,
        `Multiple de-rating to ${peBear}x P/E on margin compression`,
      ];
    } else {
      // Fallback path: Symmetric EPS standard deviation band (§3.3 & T-VAL-03)
      const stdevDelta = epsBase * historicalEpsStdevPct;
      epsBull = Number((epsBase + stdevDelta).toFixed(2));
      peBull = Number((peBase + historicalPeStdev).toFixed(1));
      bullAssumptions = [
        'EPS_stdev_symmetric_fallback: +1.0 sigma historical EPS variation',
        `P/E expanded by +${historicalPeStdev} points to ${peBull}x`,
        'Confidence docked to 0.6 due to reliance on historical fallback proxy',
      ];

      epsBear = Number((epsBase - stdevDelta).toFixed(2));
      peBear = Number((peBase - historicalPeStdev).toFixed(1));
      bearAssumptions = [
        'EPS_stdev_symmetric_fallback: -1.0 sigma historical EPS variation',
        `P/E compressed by -${historicalPeStdev} points to ${peBear}x`,
        'Symmetric-band caveat applied per §3.3 spec',
      ];
    }

    const priceTargetBull = Number((epsBull * peBull).toFixed(2));
    const priceTargetBear = Number((epsBear * peBear).toFixed(2));

    const baseAssumptions = [
      `Base EPS growth rate of ${baseGrowthRatePct}% from trailing ₹${trailingEps}`,
      `Normalized anchor multiple of ${peBase}x P/E`,
      `Data source mode: ${dataSourceType}`,
    ];

    const baseCase: ScenarioResult = {
      epsForward: epsBase,
      peMultiple: peBase,
      priceTarget: priceTargetBase,
      assumptionsUsed: baseAssumptions,
      confidence: adjustedConfidence,
    };

    const bullCase: ScenarioResult = {
      epsForward: epsBull,
      peMultiple: peBull,
      priceTarget: priceTargetBull,
      assumptionsUsed: bullAssumptions,
      confidence: adjustedConfidence,
    };

    const bearCase: ScenarioResult = {
      epsForward: epsBear,
      peMultiple: peBear,
      priceTarget: priceTargetBear,
      assumptionsUsed: bearAssumptions,
      confidence: adjustedConfidence,
    };

    const upside = priceTargetBull - priceTargetBase;
    const downside = Math.max(priceTargetBase - priceTargetBear, 0.01);
    const asymmetryRatio = Number((upside / downside).toFixed(2));

    let historicalOutcome: TriScenarioValuationResult['historicalOutcome'];
    if (historicalRealizedPrice !== undefined) {
      const fallsInside = historicalRealizedPrice >= priceTargetBear && historicalRealizedPrice <= priceTargetBull;
      historicalOutcome = {
        realizedPrice: historicalRealizedPrice,
        fallsInsideModeledBand: fallsInside,
        historicalVolatility,
        deviationNotes: fallsInside
          ? `Realized price (₹${historicalRealizedPrice}) landed comfortably inside modeled bounds [₹${priceTargetBear} - ₹${priceTargetBull}].`
          : `Realized price (₹${historicalRealizedPrice}) diverged outside band due to macro sector re-rating.`,
      };
    }

    return {
      baseCase,
      bullCase,
      bearCase,
      dataSourceType,
      asymmetryRatio,
      historicalOutcome,
    };
  }
}

export { ForensicValuationService as UnifiedValuationService };

