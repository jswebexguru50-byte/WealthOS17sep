/**
 * FilterSelectivityAuditor.ts
 * 
 * Phase 0: Base Screen Threshold Audit & Recalibration Engine
 * 
 * Computes historical and current pass rates across the 675+ scrip universe
 * for each individual filter lever and for the combined screen.
 * Flags levers exceeding the 40% selectivity ceiling and documents the
 * recalibrated thresholds ensuring the combined base screen lands in the
 * single-digit to low-teens percentage range.
 */

import { ConsolidatedOpportunity } from './ConsolidatedOpportunityEngine.js';

export interface LeverSelectivityAudit {
  lever: 'SMART_MONEY' | 'FUNDAMENTALS' | 'MOMENTUM_VPA' | 'SECTOR_RS' | 'COMBINED_ALL_LEVERS';
  standalonePassCount: number;
  standalonePassRatePct: number;
  thresholdDescription: string;
  exceedsSelectivityCeiling: boolean; // e.g. > 40%
  recalibratedPassCount: number;
  recalibratedPassRatePct: number;
  recalibratedThresholdDescription: string;
}

export interface FilterSelectivityReport {
  generatedAt: string;
  totalUniverseCount: number;
  selectivityCeilingPct: number;
  leverAudits: LeverSelectivityAudit[];
  combinedBasePassRatePct: number;
  combinedRecalibratedPassRatePct: number;
  status: 'OPTIMAL_SELECTIVITY_ACHIEVED' | 'DILUTION_WARNING';
  recommendations: string[];
}

export class FilterSelectivityAuditor {
  private static instance: FilterSelectivityAuditor;
  private lastReport: FilterSelectivityReport | null = null;
  public static readonly SELECTIVITY_CEILING_PCT = 40.0;

  public static getInstance(): FilterSelectivityAuditor {
    if (!FilterSelectivityAuditor.instance) {
      FilterSelectivityAuditor.instance = new FilterSelectivityAuditor();
    }
    return FilterSelectivityAuditor.instance;
  }

  /**
   * Evaluates the full universe against current and recalibrated thresholds
   */
  public auditUniverse(opportunities: ConsolidatedOpportunity[]): FilterSelectivityReport {
    const total = opportunities.length || 1;

    // --- 1. CURRENT LOOSE SCREENING GATES ---
    const curSM = opportunities.filter(o =>
      o.floatSqueezeRatio >= 0.50 ||
      o.floatRegime.includes('INSTITUTIONAL') ||
      ((o.promoterHoldingPct || 0) + (o.fiiHoldingPct || 0) + (o.diiHoldingPct || 0) >= 70) ||
      o.volumeSurgeRatio >= 1.4
    );

    const curFund = opportunities.filter(o =>
      o.rocePct >= 20 ||
      (o.multibaggerTier && (o.multibaggerTier.includes('10X') || o.multibaggerTier.includes('5X'))) ||
      o.multibaggerScore >= 70
    );

    const curVpa = opportunities.filter(o =>
      o.vpaStage !== 'REJECTED' && (
        o.vpaAsymmetryRatio >= 1.2 ||
        o.actionableNow ||
        o.atrContractionRatio < 0.85
      )
    );

    const curSec = opportunities.filter(o =>
      o.sectorTrend === 'OUTPERFORMING' || o.sectorRelativeStrengthAlpha >= 0
    );

    const curComb = opportunities.filter(o => {
      const sm = o.floatSqueezeRatio >= 0.50 || o.floatRegime.includes('INSTITUTIONAL') || ((o.promoterHoldingPct || 0) + (o.fiiHoldingPct || 0) + (o.diiHoldingPct || 0) >= 70) || o.volumeSurgeRatio >= 1.4;
      const fund = o.rocePct >= 20 || (o.multibaggerTier && (o.multibaggerTier.includes('10X') || o.multibaggerTier.includes('5X'))) || o.multibaggerScore >= 70;
      const vpa = o.vpaStage !== 'REJECTED' && (o.vpaAsymmetryRatio >= 1.2 || o.actionableNow || o.atrContractionRatio < 0.85);
      const sec = o.sectorTrend === 'OUTPERFORMING' || o.sectorRelativeStrengthAlpha >= 0;
      return sm && fund && vpa && sec;
    });

    // --- 2. RECALIBRATED STRICT INSTITUTIONAL GATES ---
    // Smart Money: Real float compaction (Squeeze >= 0.65 or Institutional Lock with retail <= 30%)
    const recSM = opportunities.filter(o =>
      (o.floatSqueezeRatio >= 0.65 || o.floatRegime === 'INSTITUTIONAL_LOCK_SQUEEZE') &&
      o.retailFloatPct <= 35
    );

    // Fundamentals: High capital efficiency & low gearing (ROCE >= 22% and D/E <= 0.8)
    const recFund = opportunities.filter(o =>
      (o.rocePct >= 22 || o.multibaggerScore >= 75) &&
      (o.debtToEquity <= 0.8 || isNaN(o.debtToEquity))
    );

    // Momentum VPA: Upper base compaction with decisive volume asymmetry
    const recVpa = opportunities.filter(o =>
      o.vpaStage !== 'REJECTED' &&
      (o.vpaAsymmetryRatio >= 1.35 || (o.actionableNow && o.vpaAsymmetryRatio >= 1.15)) &&
      o.atrContractionRatio < 0.80
    );

    // Sector Relative Strength: Real outperformance alpha >= +3.0% vs benchmark
    const recSec = opportunities.filter(o =>
      o.sectorTrend === 'OUTPERFORMING' && o.sectorRelativeStrengthAlpha >= 3.0
    );

    const recComb = opportunities.filter(o => {
      const sm = (o.floatSqueezeRatio >= 0.65 || o.floatRegime === 'INSTITUTIONAL_LOCK_SQUEEZE') && o.retailFloatPct <= 35;
      const fund = (o.rocePct >= 22 || o.multibaggerScore >= 75) && (o.debtToEquity <= 0.8 || isNaN(o.debtToEquity));
      const vpa = o.vpaStage !== 'REJECTED' && (o.vpaAsymmetryRatio >= 1.35 || (o.actionableNow && o.vpaAsymmetryRatio >= 1.15)) && o.atrContractionRatio < 0.80;
      const sec = o.sectorTrend === 'OUTPERFORMING' && o.sectorRelativeStrengthAlpha >= 3.0;
      return sm && fund && vpa && sec;
    });

    const ceiling = FilterSelectivityAuditor.SELECTIVITY_CEILING_PCT;

    const audits: LeverSelectivityAudit[] = [
      {
        lever: 'SMART_MONEY',
        standalonePassCount: curSM.length,
        standalonePassRatePct: Number(((curSM.length / total) * 100).toFixed(1)),
        thresholdDescription: 'Float Squeeze >= 0.50 OR Institutional Regime OR (Promoter+FII+DII >= 70%) OR VolSurge >= 1.4',
        exceedsSelectivityCeiling: (curSM.length / total) * 100 > ceiling,
        recalibratedPassCount: recSM.length,
        recalibratedPassRatePct: Number(((recSM.length / total) * 100).toFixed(1)),
        recalibratedThresholdDescription: 'Float Squeeze >= 0.65x OR Institutional Lock Squeeze with Retail Float <= 35%'
      },
      {
        lever: 'FUNDAMENTALS',
        standalonePassCount: curFund.length,
        standalonePassRatePct: Number(((curFund.length / total) * 100).toFixed(1)),
        thresholdDescription: 'ROCE >= 20% OR Multibagger Tier 10X/5X OR Multibagger Score >= 70',
        exceedsSelectivityCeiling: (curFund.length / total) * 100 > ceiling,
        recalibratedPassCount: recFund.length,
        recalibratedPassRatePct: Number(((recFund.length / total) * 100).toFixed(1)),
        recalibratedThresholdDescription: 'ROCE >= 22% OR Multibagger Score >= 75 WITH Debt/Equity <= 0.80x'
      },
      {
        lever: 'MOMENTUM_VPA',
        standalonePassCount: curVpa.length,
        standalonePassRatePct: Number(((curVpa.length / total) * 100).toFixed(1)),
        thresholdDescription: 'Not Rejected AND (Asymmetry >= 1.2 OR Actionable OR ATR Contraction < 0.85)',
        exceedsSelectivityCeiling: (curVpa.length / total) * 100 > ceiling,
        recalibratedPassCount: recVpa.length,
        recalibratedPassRatePct: Number(((recVpa.length / total) * 100).toFixed(1)),
        recalibratedThresholdDescription: 'Not Rejected AND (Asymmetry >= 1.35x OR Actionable >= 1.15x) AND ATR Contraction < 0.80'
      },
      {
        lever: 'SECTOR_RS',
        standalonePassCount: curSec.length,
        standalonePassRatePct: Number(((curSec.length / total) * 100).toFixed(1)),
        thresholdDescription: 'Sector Trend OUTPERFORMING OR Relative Strength Alpha >= 0.0%',
        exceedsSelectivityCeiling: (curSec.length / total) * 100 > ceiling,
        recalibratedPassCount: recSec.length,
        recalibratedPassRatePct: Number(((recSec.length / total) * 100).toFixed(1)),
        recalibratedThresholdDescription: 'Sector Trend OUTPERFORMING with Relative Strength Alpha >= +3.0%'
      },
      {
        lever: 'COMBINED_ALL_LEVERS',
        standalonePassCount: curComb.length,
        standalonePassRatePct: Number(((curComb.length / total) * 100).toFixed(1)),
        thresholdDescription: 'All 4 legacy levers simultaneously active',
        exceedsSelectivityCeiling: (curComb.length / total) * 100 > 15.0,
        recalibratedPassCount: recComb.length,
        recalibratedPassRatePct: Number(((recComb.length / total) * 100).toFixed(1)),
        recalibratedThresholdDescription: 'All 4 recalibrated institutional gates simultaneously satisfied'
      }
    ];

    const combinedBasePassRate = Number(((curComb.length / total) * 100).toFixed(1));
    const combinedRecalibratedPassRate = Number(((recComb.length / total) * 100).toFixed(1));

    const recommendations: string[] = [];
    if (combinedBasePassRate > 20.0) {
      recommendations.push(`Legacy combined pass rate (${combinedBasePassRate}%) is excessive (>15%), diluting selectivity to ${curComb.length} candidates.`);
    }
    if (combinedRecalibratedPassRate <= 15.0 && combinedRecalibratedPassRate >= 4.0) {
      recommendations.push(`Recalibrated pass rate (${combinedRecalibratedPassRate}%, ${recComb.length} scrips) achieves optimal institutional selectivity.`);
    }

    const report: FilterSelectivityReport = {
      generatedAt: new Date().toISOString(),
      totalUniverseCount: total,
      selectivityCeilingPct: ceiling,
      leverAudits: audits,
      combinedBasePassRatePct: combinedBasePassRate,
      combinedRecalibratedPassRatePct: combinedRecalibratedPassRate,
      status: combinedRecalibratedPassRate <= 15.0 ? 'OPTIMAL_SELECTIVITY_ACHIEVED' : 'DILUTION_WARNING',
      recommendations
    };

    this.lastReport = report;
    return report;
  }

  public getLastReport(): FilterSelectivityReport | null {
    return this.lastReport;
  }
}
