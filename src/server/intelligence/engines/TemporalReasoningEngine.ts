/**
 * TemporalReasoningEngine.ts
 *
 * FERE Deterministic Temporal Reasoning Engine.
 * Evaluates Claims and Targets against verified Financial Facts under explicit temporal semantics:
 * - DEADLINE: Metric must reach or exceed target at or before deadline date. (Stock metrics allow early fulfillment).
 * - YEAR_END: Metric must stand at target at fiscal year closing date. (Prior observations cannot prove year-end achievement).
 * - PERIOD: Flow metric delivered across the entire period. (Prior period flow data cannot prove future flow delivery).
 * - ONGOING: Target maintained continuously across the evaluation window.
 */

import { FinancialFact } from '../types/FinancialFact.js';
import { TargetTemporalSemantics, ClaimOutcome } from '../types/ManagementClaim.js';

export interface TemporalEvaluationRequest {
  claimId: string;
  metric: string;
  targetOperator: '>=' | '<=' | '==' | '>' | '<';
  targetValue: number;
  semantics: TargetTemporalSemantics;
  deadlineDate: string; // YYYY-MM-DD
  fact: FinancialFact;
}

export interface TemporalEvaluationResult {
  outcome: ClaimOutcome;
  isComparable: boolean;
  rationale: string;
  comparisonDetails: {
    targetMetric: string;
    factMetric: string;
    targetValue: number;
    factValue: number | string;
    semantics: TargetTemporalSemantics;
    deadline: string;
    asOfDate: string;
  };
}

export class TemporalReasoningEngine {
  /**
   * Evaluates a Claim against a FinancialFact with strict temporal and metric checks.
   */
  public static evaluate(req: TemporalEvaluationRequest): TemporalEvaluationResult {
    const details = {
      targetMetric: req.metric,
      factMetric: req.fact.metric,
      targetValue: req.targetValue,
      factValue: req.fact.value,
      semantics: req.semantics,
      deadline: req.deadlineDate,
      asOfDate: req.fact.asOfDate
    };

    // 1. Metric Compatibility Guard
    if (req.metric.toLowerCase() !== req.fact.metric.toLowerCase()) {
      return {
        outcome: 'NOT_COMPARABLE',
        isComparable: false,
        rationale: `Incompatible metric comparison: target is '${req.metric}', fact is '${req.fact.metric}'. Cross-metric evaluation rejected.`,
        comparisonDetails: details
      };
    }

    if (typeof req.fact.value !== 'number') {
      return {
        outcome: 'NOT_COMPARABLE',
        isComparable: false,
        rationale: `Fact value for '${req.fact.metric}' is non-numeric (${req.fact.value}). Mathematical comparison cannot execute.`,
        comparisonDetails: details
      };
    }

    const factVal = req.fact.value;
    const isTargetMet = this.compare(factVal, req.targetOperator, req.targetValue);
    const factDate = new Date(req.fact.asOfDate).getTime();
    const deadlineDate = new Date(req.deadlineDate).getTime();
    const isPriorDate = factDate < deadlineDate;

    // 2. Temporal Semantics Resolution
    switch (req.semantics) {
      case 'DEADLINE': {
        // For STOCK metrics (e.g. Order Book, Net Worth, Cash Balance):
        // Reaching target ahead of deadline satisfies condition early.
        if (req.fact.measurementType === 'STOCK') {
          if (isTargetMet) {
            return {
              outcome: isPriorDate ? 'ACHIEVED_EARLY' : 'ACHIEVED',
              isComparable: true,
              rationale: isPriorDate
                ? `Stock metric reached target ahead of deadline ${req.deadlineDate} (observed: ${factVal} as of ${req.fact.asOfDate}).`
                : `Stock metric reached target at deadline ${req.deadlineDate} (observed: ${factVal}).`,
              comparisonDetails: details
            };
          } else {
            return {
              outcome: isPriorDate ? 'OPEN' : 'MISSED',
              isComparable: true,
              rationale: isPriorDate
                ? `Current observed value (${factVal}) is below target (${req.targetValue}), but deadline ${req.deadlineDate} has not elapsed.`
                : `Missed: Target (${req.targetValue}) not reached by deadline ${req.deadlineDate} (observed: ${factVal}).`,
              comparisonDetails: details
            };
          }
        }

        // For FLOW metrics under DEADLINE:
        if (isPriorDate) {
          return {
            outcome: 'NOT_COMPARABLE',
            isComparable: false,
            rationale: `Flow metric (dispatches/revenue) as of ${req.fact.asOfDate} cannot prove fulfillment of deadline ${req.deadlineDate}.`,
            comparisonDetails: details
          };
        }
        break;
      }

      case 'YEAR_END': {
        // Must be evaluated at year-end date. Earlier observations are NOT_DUE.
        if (isPriorDate) {
          return {
            outcome: 'NOT_DUE',
            isComparable: false,
            rationale: `Target applies to year-end closing date ${req.deadlineDate}. Prior observation as of ${req.fact.asOfDate} is premature.`,
            comparisonDetails: details
          };
        }
        break;
      }

      case 'PERIOD': {
        // Flow metric across fiscal year. Prior dates cannot satisfy future period flow.
        if (isPriorDate) {
          return {
            outcome: 'NOT_COMPARABLE',
            isComparable: false,
            rationale: `Period target for ${req.deadlineDate} cannot be satisfied by historical period observation (${req.fact.asOfDate}).`,
            comparisonDetails: details
          };
        }
        break;
      }

      case 'POINT_IN_TIME': {
        if (isPriorDate) {
          return {
            outcome: 'NOT_DUE',
            isComparable: false,
            rationale: `Point-in-time covenant applies strictly on ${req.deadlineDate}. Prior observation as of ${req.fact.asOfDate || req.fact.periodEnd} is premature.`,
            comparisonDetails: details
          };
        }
        break;
      }

      case 'ONGOING': {
        if (!isTargetMet) {
          return {
            outcome: 'MISSED',
            isComparable: true,
            rationale: `Ongoing condition breached: observed ${factVal} violates required condition ${req.targetOperator} ${req.targetValue}.`,
            comparisonDetails: details
          };
        }
        return {
          outcome: 'ACHIEVED',
          isComparable: true,
          rationale: `Ongoing condition satisfied: observed ${factVal} adheres to required condition ${req.targetOperator} ${req.targetValue}.`,
          comparisonDetails: details
        };
      }
    }

    // Standard deadline passed evaluation
    return {
      outcome: isTargetMet ? 'ACHIEVED' : 'MISSED',
      isComparable: true,
      rationale: isTargetMet
        ? `Condition satisfied: observed ${factVal} meets ${req.targetOperator} ${req.targetValue}.`
        : `Condition missed: observed ${factVal} fails ${req.targetOperator} ${req.targetValue}.`,
      comparisonDetails: details
    };
  }

  private static compare(val: number, op: string, target: number): boolean {
    switch (op) {
      case '>=': return val >= target;
      case '<=': return val <= target;
      case '>': return val > target;
      case '<': return val < target;
      case '==': return Math.abs(val - target) < 0.0001;
      default: return false;
    }
  }
}
