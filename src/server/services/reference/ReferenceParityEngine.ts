/**
 * WealthOS v6.6–v6.7 - Reference Parity Engine
 * External Reference Acceleration Layer
 * 
 * SPEC MANDATE:
 * Compares native WealthOS implementations against external reference implementations.
 * A match means calculations are mathematically consistent, NOT that a strategy is profitable.
 * A mismatch highlights definition/data divergence for investigation.
 */

export type ParityStatus =
  | 'MATCH'
  | 'MISMATCH'
  | 'REFERENCE_ONLY'
  | 'WEALTHOS_ONLY'
  | 'DATA_INSUFFICIENT'
  | 'UNSUPPORTED';

export interface FeatureParityResult {
  featureId: string;
  status: ParityStatus;
  wealthOSValue: unknown;
  referenceValue: unknown;
  tolerance?: number;
  discrepancy?: number;
  explanation?: string;
}

export class ReferenceParityEngine {
  private static instance: ReferenceParityEngine;

  public static getInstance(): ReferenceParityEngine {
    if (!ReferenceParityEngine.instance) {
      ReferenceParityEngine.instance = new ReferenceParityEngine();
    }
    return ReferenceParityEngine.instance;
  }

  public compare(
    wealthOS: Record<string, unknown>,
    reference: Record<string, unknown>,
    tolerances: Record<string, number> = {}
  ): FeatureParityResult[] {
    const features = new Set([
      ...Object.keys(wealthOS),
      ...Object.keys(reference)
    ]);

    const results: FeatureParityResult[] = [];

    for (const featureId of features) {
      const w = wealthOS[featureId];
      const r = reference[featureId];

      if (w === undefined && r === undefined) {
        continue;
      }

      if (w === undefined) {
        results.push({
          featureId,
          status: 'REFERENCE_ONLY',
          wealthOSValue: undefined,
          referenceValue: r,
          explanation: 'Feature present in reference engine but absent in native WealthOS'
        });
        continue;
      }

      if (r === undefined) {
        results.push({
          featureId,
          status: 'UNSUPPORTED',
          wealthOSValue: w,
          referenceValue: undefined,
          explanation: 'Feature present in native WealthOS but unsupported by reference engine'
        });
        continue;
      }

      if (typeof w === 'number' && typeof r === 'number') {
        const tolerance = tolerances[featureId] ?? 0.0001;
        const discrepancy = Math.abs(w - r);
        const match = discrepancy <= tolerance;

        results.push({
          featureId,
          status: match ? 'MATCH' : 'MISMATCH',
          wealthOSValue: w,
          referenceValue: r,
          tolerance,
          discrepancy,
          explanation: match
            ? `Within tolerance (discrepancy ${discrepancy.toFixed(6)} <= ${tolerance})`
            : `Exceeds tolerance (discrepancy ${discrepancy.toFixed(6)} > ${tolerance})`
        });
        continue;
      }

      const match = Object.is(w, r);
      results.push({
        featureId,
        status: match ? 'MATCH' : 'MISMATCH',
        wealthOSValue: w,
        referenceValue: r,
        explanation: match ? 'Exact non-numeric equality' : 'Discrete value mismatch'
      });
    }

    return results;
  }
}
