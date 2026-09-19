import { StrategySignal, PITResearchContext, CandidateFilterEngine, CandidateFilterResult } from './CandidateFilterEngine';

export interface AdaptedSignalEvaluation {
  baseSignal: StrategySignal;
  isRetained: boolean;
  filterEvaluations: Array<{
    filterId: string;
    result: CandidateFilterResult;
  }>;
  suppressionReason?: string;
  adaptedSignal?: StrategySignal;
}

export class CandidateStrategyAdapter {
  /**
   * Applies candidate filters to an immutable baseline strategy signal.
   * BASELINE STRATEGY LOGIC IS UNTOUCHED.
   */
  public static evaluateCandidatePipeline(
    baseSignal: StrategySignal,
    filterIds: string[],
    context: PITResearchContext
  ): AdaptedSignalEvaluation {
    // Preserve baseline signal immutability
    const frozenBaseSignal = Object.freeze({ ...baseSignal });
    const evaluations: Array<{ filterId: string; result: CandidateFilterResult }> = [];

    let isRetained = true;
    let suppressionReason: string | undefined = undefined;

    for (const filterId of filterIds) {
      const result = CandidateFilterEngine.evaluateFilter(filterId, context, frozenBaseSignal);
      evaluations.push({ filterId, result });

      if (!result.passed) {
        isRetained = false;
        suppressionReason = `SUPPRESSED_BY_${filterId}_REASON_${result.reasonCode}`;
        break; // Short-circuit on first rejection
      }
    }

    return {
      baseSignal: frozenBaseSignal,
      isRetained,
      filterEvaluations: evaluations,
      suppressionReason,
      adaptedSignal: isRetained ? frozenBaseSignal : undefined
    };
  }
}
