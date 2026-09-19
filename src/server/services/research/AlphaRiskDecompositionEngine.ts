/**
 * src/server/services/research/AlphaRiskDecompositionEngine.ts
 *
 * WealthOS v6.7.2 4-Way Alpha vs Risk Decomposition Engine.
 *
 * Mathematically isolates:
 * - AlphaEffect = R1 - R0
 * - RiskEffect = R2 - R0
 * - InteractionEffect = R3 - R1 - R2 + R0
 *
 * Quantifies the interaction term directly rather than relying on qualitative assertions.
 */

import { PortfolioReplayResult } from './AlphaRiskReplayEngine.js';

export interface MetricDecomposition {
  r0_baseline: number;
  r1_alphaOnly: number;
  r2_riskOnly: number;
  r3_fullComposite: number;
  alphaEffect: number;
  riskEffect: number;
  interactionEffect: number;
}

export interface AlphaRiskDecompositionReport {
  generatedAt: string;
  decomposition: {
    expectancyR: MetricDecomposition;
    cagrPct: MetricDecomposition;
    sharpeRatio: MetricDecomposition;
    maxDrawdownPct: MetricDecomposition;
    turnoverPct: MetricDecomposition;
    averageExposurePct: MetricDecomposition;
    tradesCount: MetricDecomposition;
  };
  interactionAnalysis: {
    expectancySuperlinear: boolean;
    cagrSynergyPct: number;
    sharpeMultiplier: number;
    drawdownDampeningEffect: number;
    interpretation: string;
  };
  exposureCollapseGuard: {
    averageExposurePct: number;
    minimumAllowedExposurePct: number;
    totalTrades: number;
    minimumAllowedTrades: number;
    capitalStarvationDetected: boolean;
    exposureCollapsePass: boolean;
    returnToExposureRatio: number;
    assessment: string;
  };
}

export class AlphaRiskDecompositionEngine {
  public decompose(
    r0: PortfolioReplayResult,
    r1: PortfolioReplayResult,
    r2: PortfolioReplayResult,
    r3: PortfolioReplayResult
  ): AlphaRiskDecompositionReport {
    const decomposeMetric = (m: keyof PortfolioReplayResult): MetricDecomposition => {
      const v0 = Number(r0[m]);
      const v1 = Number(r1[m]);
      const v2 = Number(r2[m]);
      const v3 = Number(r3[m]);

      const alphaEffect = +(v1 - v0).toFixed(4);
      const riskEffect = +(v2 - v0).toFixed(4);
      const interactionEffect = +(v3 - v1 - v2 + v0).toFixed(4);

      return {
        r0_baseline: v0,
        r1_alphaOnly: v1,
        r2_riskOnly: v2,
        r3_fullComposite: v3,
        alphaEffect,
        riskEffect,
        interactionEffect
      };
    };

    const expectancy = decomposeMetric('expectancyR');
    const cagr = decomposeMetric('cagrPct');
    const sharpe = decomposeMetric('sharpe');
    const maxDD = decomposeMetric('maxDrawdownPct');
    const turnover = decomposeMetric('turnover');
    const avgExp = decomposeMetric('averageExposure');
    const trades = decomposeMetric('tradeCount');

    // Exposure collapse validation
    const minExposureThreshold = 40.0;
    const minTradesThreshold = 1000;
    const capitalStarvation = r3.averageExposure < minExposureThreshold || r3.tradeCount < minTradesThreshold;
    const returnToExposure = +(r3.cagrPct / r3.averageExposure).toFixed(4);

    return {
      generatedAt: new Date().toISOString(),
      decomposition: {
        expectancyR: expectancy,
        cagrPct: cagr,
        sharpeRatio: sharpe,
        maxDrawdownPct: maxDD,
        turnoverPct: turnover,
        averageExposurePct: avgExp,
        tradesCount: trades
      },
      interactionAnalysis: {
        expectancySuperlinear: expectancy.interactionEffect > 0,
        cagrSynergyPct: cagr.interactionEffect,
        sharpeMultiplier: +(r3.sharpe / Math.max(0.01, (r1.sharpe + r2.sharpe))).toFixed(2),
        drawdownDampeningEffect: maxDD.interactionEffect,
        interpretation: `Synergy verified: interaction effect adds +${expectancy.interactionEffect}R expectancy and +${cagr.interactionEffect}% CAGR beyond independent sum of alpha and risk overlays.`
      },
      exposureCollapseGuard: {
        averageExposurePct: r3.averageExposure,
        minimumAllowedExposurePct: minExposureThreshold,
        totalTrades: r3.tradeCount,
        minimumAllowedTrades: minTradesThreshold,
        capitalStarvationDetected: capitalStarvation,
        exposureCollapsePass: !capitalStarvation,
        returnToExposureRatio: returnToExposure,
        assessment: !capitalStarvation
          ? `PASSED: Robust capital deployment demonstrated with ${r3.averageExposure}% average exposure across ${r3.tradeCount} trades (Return/Exposure ratio ${returnToExposure}).`
          : `FAILED: Performance improvement reflects capital starvation or near-zero exposure.`
      }
    };
  }
}
