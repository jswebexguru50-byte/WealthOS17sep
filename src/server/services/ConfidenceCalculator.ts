/**
 * src/server/services/ConfidenceCalculator.ts
 * Computes confidence scores based on source reliability and data age
 */

export interface Source {
  reliability: number;
  type: string;
  name?: string;
}

export class ConfidenceCalculator {
  private static instance: ConfidenceCalculator;
  private readonly CONFIDENCE_MIN = 0.0;
  private readonly CONFIDENCE_MAX = 1.0;
  private readonly MINIMUM_CONFIDENCE_THRESHOLD = 0.1; // Never go below this
  private readonly AGE_DEGRADATION_PER_MINUTE = 0.01; // 1% per minute
  private readonly CHAIN_DEGRADATION_PER_HOP = 0.05; // 5% per additional hop

  static getInstance(): ConfidenceCalculator {
    if (!ConfidenceCalculator.instance) {
      ConfidenceCalculator.instance = new ConfidenceCalculator();
    }
    return ConfidenceCalculator.instance;
  }

  calculateConfidence(sources: Source[]): number {
    if (!sources || sources.length === 0) {
      return this.CONFIDENCE_MIN;
    }

    // Average reliability from all sources
    const avgReliability = sources.reduce((sum, s) => sum + s.reliability, 0) / sources.length;

    // Clamp to valid range
    return Math.max(this.CONFIDENCE_MIN, Math.min(this.CONFIDENCE_MAX, avgReliability));
  }

  calculateConfidenceWithAge(sources: Source[], ageSeconds: number, chainLength: number): number {
    // Start with base confidence
    let confidence = this.calculateConfidence(sources);

    // Apply age degradation
    const minutesOld = Math.floor(ageSeconds / 60);
    confidence -= minutesOld * this.AGE_DEGRADATION_PER_MINUTE;

    // Apply chain length degradation (longer chains reduce confidence)
    const chainDegradation = Math.max(0, chainLength - 1) * this.CHAIN_DEGRADATION_PER_HOP;
    confidence -= chainDegradation;

    // Clamp to minimum
    return Math.max(this.MINIMUM_CONFIDENCE_THRESHOLD, Math.min(this.CONFIDENCE_MAX, confidence));
  }

  isLowConfidence(confidence: number): boolean {
    return confidence < 0.5;
  }
}
