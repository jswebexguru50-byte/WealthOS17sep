import { StopTheLineError } from './StopTheLineRegistry';

export interface HypothesisTest {
  hypothesisId: string;
  hypothesisFamilyId: string;
  testName: string;
  pValue: number;
  sampleSize: number;
  method: string;
  numerator?: number;
  denominator?: number;
  predeclared: boolean;
  completed: boolean;
  qValue?: number;
}

export class BHFDRValidator {
  /**
   * Independently recalculates the BH-FDR q-values.
   * Asserts validity if raw p-values are legitimate (0 <= p <= 1).
   */
  public validate(tests: HypothesisTest[], m: number): HypothesisTest[] {
    if (m < tests.length) {
      throw new StopTheLineError('BH_FDR_INPUT_INVALID', 'Predeclared denominator m cannot be less than the number of completed tests.');
    }

    const sorted = [...tests].sort((a, b) => a.pValue - b.pValue);

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].pValue < 0 || sorted[i].pValue > 1) {
        throw new StopTheLineError('BH_FDR_INPUT_INVALID', `Invalid p-value: ${sorted[i].pValue}`);
      }

      const q = (sorted[i].pValue * m) / (i + 1);
      sorted[i].qValue = Math.min(q, 1.0);
    }

    for (let i = sorted.length - 2; i >= 0; i--) {
      if (sorted[i].qValue !== undefined && sorted[i + 1].qValue !== undefined) {
        sorted[i].qValue = Math.min(sorted[i].qValue!, sorted[i + 1].qValue!);
      }
    }

    return sorted;
  }
}
