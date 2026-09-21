/**
 * src/server/services/research/BenjaminiHochbergValidator.ts
 *
 * WealthOS v6.7.2 Benjamini-Hochberg False Discovery Rate (BH-FDR) Validator.
 *
 * Strictly enforces multiple testing correction across the complete predeclared
 * hypothesis family (m = 80 hypotheses).
 *
 * Calculates true step-up adjusted q-values:
 * q_(i) = p_(i) * (m / i)
 */

import crypto from 'node:crypto';

export interface EvaluatedHypothesis {
  hypothesisFamilyId: string;
  hypothesisId: string;
  configurationId: string;
  testStatistic: number;
  rawPValue: number;
  status: 'EVALUATED' | 'FAILED' | 'DATA_INSUFFICIENT';
}

export interface AdjustedHypothesisResult {
  hypothesisFamilyId: string;
  hypothesisId: string;
  configurationId: string;
  testStatistic: number;
  rawPValue: number;
  rank: number;
  totalHypothesesM: number;
  alpha: number;
  criticalThreshold: number;
  adjustedQValue: number;
  significant: boolean;
  rejected: boolean;
}

export interface FDRValidationReport {
  validatedAt: string;
  hypothesisFamilyId: string;
  totalHypothesesM: number;
  evaluatedHypothesesCount: number;
  fdrAlpha: number;
  discoveryCount: number;
  c12Significant: boolean;
  c12AdjustedQValue: number;
  resultHash: string;
  itemizedAdjustments: AdjustedHypothesisResult[];
}

export class BenjaminiHochbergValidator {
  private totalHypothesesM: number;
  private alpha: number;

  constructor(totalHypothesesM: number = 80, alpha: number = 0.05) {
    this.totalHypothesesM = totalHypothesesM;
    this.alpha = alpha;
  }

  /**
   * Applies Benjamini-Hochberg step-up procedure across the complete hypothesis family.
   */
  public validateFamily(
    familyId: string,
    hypotheses: EvaluatedHypothesis[]
  ): FDRValidationReport {
    const m = this.totalHypothesesM;
    const sorted = [...hypotheses].sort((a, b) => a.rawPValue - b.rawPValue);

    const itemized: AdjustedHypothesisResult[] = [];
    let cumulativeMinQ = 1.0;

    // Calculate critical thresholds and ranks
    for (let i = 0; i < sorted.length; i++) {
      const h = sorted[i];
      const rank = i + 1;
      const criticalThreshold = +(rank / m * this.alpha).toFixed(6);
      const rawQ = +(h.rawPValue * (m / rank)).toFixed(6);
      const adjustedQ = Math.min(1.0, rawQ);

      itemized.push({
        hypothesisFamilyId: h.hypothesisFamilyId,
        hypothesisId: h.hypothesisId,
        configurationId: h.configurationId,
        testStatistic: h.testStatistic,
        rawPValue: h.rawPValue,
        rank,
        totalHypothesesM: m,
        alpha: this.alpha,
        criticalThreshold,
        adjustedQValue: adjustedQ,
        significant: h.rawPValue <= criticalThreshold && adjustedQ <= this.alpha,
        rejected: false
      });
    }

    // Monotonicity adjustment backwards for q-values
    for (let i = itemized.length - 1; i >= 0; i--) {
      cumulativeMinQ = Math.min(cumulativeMinQ, itemized[i].adjustedQValue);
      itemized[i].adjustedQValue = +(cumulativeMinQ).toFixed(6);
      itemized[i].significant = itemized[i].adjustedQValue <= this.alpha;
      itemized[i].rejected = itemized[i].significant;
    }

    const discoveries = itemized.filter(item => item.significant);
    const c12Item = itemized.find(item => item.configurationId === 'C12');

    const resultHash = crypto.createHash('sha256')
      .update(JSON.stringify(itemized.map(it => ({ id: it.hypothesisId, p: it.rawPValue, q: it.adjustedQValue }))))
      .digest('hex');

    return {
      validatedAt: new Date().toISOString(),
      hypothesisFamilyId: familyId,
      totalHypothesesM: m,
      evaluatedHypothesesCount: hypotheses.length,
      fdrAlpha: this.alpha,
      discoveryCount: discoveries.length,
      c12Significant: c12Item ? c12Item.significant : false,
      c12AdjustedQValue: c12Item ? c12Item.adjustedQValue : 1.0,
      resultHash,
      itemizedAdjustments: itemized
    };
  }
}
