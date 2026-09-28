/**
 * CommitmentMatcher.ts — Wave 1 Agent B
 *
 * Deterministic actual-vs-promise evaluation engine.
 *
 * Constitution invariants:
 * - C13: LLMs interpret language; deterministic logic owns measurable arithmetic
 * - C10: Extraction is not verification — actual evidence determines delivery status
 * - ACHIEVED_LATE is distinct from ACHIEVED — timing matters for credibility
 * - No universal ≥50% rule; each commitment type has semantic evaluators
 */

import { CommitmentType, CommitmentStatus, CommitmentMetricMapping } from '../contracts/ManagementContracts.js';

// ─── Evaluation Input / Output ────────────────────────────────────────────────

export interface CommitmentEvaluationInput {
  commitmentType: CommitmentType;
  metricMapping: CommitmentMetricMapping | null;
  targetValue?: number | null;
  targetMin?: number | null;
  targetMax?: number | null;
  baselineValue?: number | null;
  targetPeriod?: string | null;        // ISO period end
  commitmentDate?: string | null;      // when commitment was made
  actualDate?: string | null;          // when actual was recorded (for ACHIEVED_LATE)
}

export interface CommitmentEvaluation {
  status: CommitmentStatus;
  explanation: string;
  actualValue: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ─── Matcher ──────────────────────────────────────────────────────────────────

export class CommitmentMatcher {
  /**
   * Main evaluation entry point.
   * Deterministic arithmetic — never delegates comparison decisions to an LLM.
   */
  static evaluate(
    input: CommitmentEvaluationInput,
    actual: number | null,
    targetPeriodPassed: boolean,
    deliveredLate?: boolean,          // actual arrived after the committed deadline
  ): CommitmentEvaluation {

    if (!targetPeriodPassed) {
      return {
        status: 'NOT_YET_DUE',
        explanation: 'Target period has not yet elapsed.',
        actualValue: actual,
        confidence: 'HIGH',
      };
    }

    if (actual === null) {
      return {
        status: 'NOT_VERIFIABLE',
        explanation: 'No verified canonical data found for this metric and period.',
        actualValue: null,
        confidence: 'LOW',
      };
    }

    const mapping = input.metricMapping;
    const comparisonType = mapping?.comparisonType;

    // Route to semantic evaluator
    switch (input.commitmentType) {
      case 'NUMERIC_TARGET':
        return this.evaluateNumericTarget(input, actual, deliveredLate);

      case 'RANGE':
        return this.evaluateRange(input, actual, deliveredLate);

      case 'DIRECTIONAL':
        return this.evaluateDirectional(input, actual);

      case 'TIMELINE':
      case 'PROJECT':
        return this.evaluateTimeline(input, actual, deliveredLate);

      case 'CAPITAL_ALLOCATION':
        return this.evaluateCapitalAllocation(input, actual, deliveredLate);

      default:
        // Generic fallback only for unclassifiable types
        return {
          status: 'NOT_VERIFIABLE',
          explanation: 'Commitment type not algorithmically evaluable; requires qualitative assessment.',
          actualValue: actual,
          confidence: 'LOW',
        };
    }
  }

  // ─── Numeric Target Evaluator ─────────────────────────────────────────────

  private static evaluateNumericTarget(
    input: CommitmentEvaluationInput,
    actual: number,
    deliveredLate?: boolean,
  ): CommitmentEvaluation {
    const target = input.targetValue;
    if (target === null || target === undefined) {
      return {
        status: 'NOT_VERIFIABLE',
        explanation: 'No numeric target specified in commitment.',
        actualValue: actual,
        confidence: 'LOW',
      };
    }

    const ratio = Math.abs(target) > 0 ? actual / target : 0;
    const pct = (ratio * 100).toFixed(1);

    // TOLERANCE: 5% within target = ACHIEVED
    if (ratio >= 0.95) {
      return {
        status: deliveredLate ? 'ACHIEVED_LATE' : 'ACHIEVED',
        explanation: `Target: ${target}, Actual: ${actual.toFixed(2)} (${pct}% of target).${deliveredLate ? ' Delivered after committed deadline.' : ''}`,
        actualValue: actual,
        confidence: 'HIGH',
      };
    }

    // 85%–95% = PARTIALLY_ACHIEVED
    if (ratio >= 0.85) {
      return {
        status: 'PARTIALLY_ACHIEVED',
        explanation: `Target: ${target}, Actual: ${actual.toFixed(2)} (${pct}% of target — within 15%).`,
        actualValue: actual,
        confidence: 'HIGH',
      };
    }

    return {
      status: 'MISSED',
      explanation: `Target: ${target}, Actual: ${actual.toFixed(2)} (${pct}% of target — materially missed).`,
      actualValue: actual,
      confidence: 'HIGH',
    };
  }

  // ─── Range Evaluator ──────────────────────────────────────────────────────

  private static evaluateRange(
    input: CommitmentEvaluationInput,
    actual: number,
    deliveredLate?: boolean,
  ): CommitmentEvaluation {
    const { targetMin, targetMax } = input;

    if (targetMin === null && targetMax === null) {
      return {
        status: 'NOT_VERIFIABLE',
        explanation: 'No target range specified.',
        actualValue: actual,
        confidence: 'LOW',
      };
    }

    const aboveMin = targetMin === null || targetMin === undefined || actual >= targetMin;
    const belowMax = targetMax === null || targetMax === undefined || actual <= targetMax;
    const rangeStr = `[${targetMin ?? '–'}–${targetMax ?? '–'}]`;

    if (aboveMin && belowMax) {
      return {
        status: deliveredLate ? 'ACHIEVED_LATE' : 'ACHIEVED',
        explanation: `Actual ${actual.toFixed(2)} within guided range ${rangeStr}.${deliveredLate ? ' Delivered after deadline.' : ''}`,
        actualValue: actual,
        confidence: 'HIGH',
      };
    }

    // Calculate deviation from midpoint for severity
    const midpoint = ((targetMin || 0) + (targetMax || 0)) / 2;
    const deviation = midpoint !== 0 ? Math.abs(actual - midpoint) / Math.abs(midpoint) : Infinity;

    // Near but outside (<10% deviation) → PARTIALLY_ACHIEVED
    if (deviation < 0.10) {
      return {
        status: 'PARTIALLY_ACHIEVED',
        explanation: `Actual ${actual.toFixed(2)} slightly outside guided range ${rangeStr} (${(deviation * 100).toFixed(1)}% from midpoint).`,
        actualValue: actual,
        confidence: 'MEDIUM',
      };
    }

    return {
      status: 'MISSED',
      explanation: `Actual ${actual.toFixed(2)} materially outside guided range ${rangeStr}.`,
      actualValue: actual,
      confidence: 'HIGH',
    };
  }

  // ─── Directional Evaluator ────────────────────────────────────────────────

  private static evaluateDirectional(
    input: CommitmentEvaluationInput,
    actual: number,
  ): CommitmentEvaluation {
    const { baselineValue } = input;

    if (baselineValue === null || baselineValue === undefined) {
      return {
        status: 'NOT_VERIFIABLE',
        explanation: 'No baseline value available to assess directional change.',
        actualValue: actual,
        confidence: 'LOW',
      };
    }

    const changePct = baselineValue !== 0
      ? ((actual - baselineValue) / Math.abs(baselineValue) * 100).toFixed(1)
      : 'N/A';

    const improved = actual > baselineValue;
    const changeStr = `Baseline ${baselineValue.toFixed(2)} → Actual ${actual.toFixed(2)} (${changePct}% change)`;

    if (improved) {
      return {
        status: 'ACHIEVED',
        explanation: `Directional improvement: ${changeStr}.`,
        actualValue: actual,
        confidence: 'MEDIUM',  // Directional assessment is inherently lower confidence
      };
    }

    return {
      status: 'MISSED',
      explanation: `No directional improvement: ${changeStr}.`,
      actualValue: actual,
      confidence: 'MEDIUM',
    };
  }

  // ─── Timeline / Project Evaluator ─────────────────────────────────────────

  private static evaluateTimeline(
    input: CommitmentEvaluationInput,
    actual: number,
    deliveredLate?: boolean,
  ): CommitmentEvaluation {
    // actual = 1 means completed, 0 means not
    // deliveredLate drives ACHIEVED_LATE distinction
    if (actual >= 1) {
      return {
        status: deliveredLate ? 'ACHIEVED_LATE' : 'ACHIEVED',
        explanation: `Project/milestone ${deliveredLate ? 'completed after committed deadline' : 'completed on schedule'}.`,
        actualValue: actual,
        confidence: 'HIGH',
      };
    }

    return {
      status: 'MISSED',
      explanation: 'Project/milestone not completed by the committed period.',
      actualValue: actual,
      confidence: 'HIGH',
    };
  }

  // ─── Capital Allocation Evaluator (capex, debt reduction) ────────────────

  private static evaluateCapitalAllocation(
    input: CommitmentEvaluationInput,
    actual: number,
    deliveredLate?: boolean,
  ): CommitmentEvaluation {
    const mapping = input.metricMapping;

    // For MAXIMUM type (e.g. "net debt ≤ ₹X"): lower is better
    if (mapping?.comparisonType === 'MAXIMUM') {
      const threshold = input.targetValue ?? input.targetMax;
      if (threshold === null || threshold === undefined) {
        return { status: 'NOT_VERIFIABLE', explanation: 'No threshold value specified.', actualValue: actual, confidence: 'LOW' };
      }
      if (actual <= threshold) {
        return { status: 'ACHIEVED', explanation: `Net debt ${actual.toFixed(0)} ≤ target ${threshold} (achieved${deliveredLate ? ', late' : ''}).`, actualValue: actual, confidence: 'HIGH' };
      }
      return { status: 'MISSED', explanation: `Net debt ${actual.toFixed(0)} > target ${threshold} (not achieved).`, actualValue: actual, confidence: 'HIGH' };
    }

    // For MINIMUM type (e.g. "capex ≥ ₹X"): higher is better
    if (mapping?.comparisonType === 'MINIMUM') {
      const threshold = input.targetValue ?? input.targetMin;
      if (threshold === null || threshold === undefined) {
        return { status: 'NOT_VERIFIABLE', explanation: 'No minimum threshold specified.', actualValue: actual, confidence: 'LOW' };
      }
      if (actual >= threshold * 0.95) {
        return { status: 'ACHIEVED', explanation: `Capex ${actual.toFixed(0)} ≥ target ${threshold} (achieved).`, actualValue: actual, confidence: 'HIGH' };
      }
      return { status: 'MISSED', explanation: `Capex ${actual.toFixed(0)} < target ${threshold}.`, actualValue: actual, confidence: 'HIGH' };
    }

    // Default: use numeric target evaluator
    return this.evaluateNumericTarget(input, actual, deliveredLate);
  }
}
