/**
 * WealthOS v6.6 - Multiple Testing Correction Engine
 * Agent I Deliverable
 * 
 * Implements Benjamini-Hochberg False Discovery Rate (BH-FDR) control
 * to penalize data-snooping bias across multiple tested strategy configurations.
 */

export interface HypothesisTestCandidate {
  testId: string;
  nominalPValue: number;
  expectancyR: number;
}

export interface CorrectedHypothesisResult {
  testId: string;
  nominalPValue: number;
  criticalPValue: number;
  adjustedPValue: number;
  significantFDR: boolean;
}

export class MultipleTestingEngine {
  public applyBenjaminiHochberg(
    candidates: HypothesisTestCandidate[],
    targetFDR: number = 0.05
  ): CorrectedHypothesisResult[] {
    const m = candidates.length;
    if (m === 0) return [];

    // Sort by nominal p-value ascending
    const sorted = [...candidates].sort((a, b) => a.nominalPValue - b.nominalPValue);

    let maxSignificantK = -1;
    const results: CorrectedHypothesisResult[] = [];

    for (let i = 0; i < m; i++) {
      const rank = i + 1;
      const criticalP = (rank / m) * targetFDR;
      const nominalP = sorted[i].nominalPValue;

      if (nominalP <= criticalP) {
        maxSignificantK = i;
      }
    }

    for (let i = 0; i < m; i++) {
      const rank = i + 1;
      const criticalP = (rank / m) * targetFDR;
      const adjustedP = Math.min(1.0, sorted[i].nominalPValue * (m / rank));

      results.push({
        testId: sorted[i].testId,
        nominalPValue: sorted[i].nominalPValue,
        criticalPValue: Number(criticalP.toFixed(6)),
        adjustedPValue: Number(adjustedP.toFixed(6)),
        significantFDR: i <= maxSignificantK
      });
    }

    return results;
  }
}
