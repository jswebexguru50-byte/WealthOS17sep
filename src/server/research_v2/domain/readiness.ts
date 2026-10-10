/** READY only when every declared input passes; otherwise PARTIAL (missing listed) or DATA_INSUFFICIENT. */
export type ReadinessState = 'READY' | 'PARTIAL' | 'DATA_INSUFFICIENT' | 'NOT_APPLICABLE';

/** Why one input failed the readiness rule. */
export type ReadinessReason =
  | 'MISSING'
  | 'SCOPE_INCONSISTENT'
  | 'PERIOD_COVERAGE'
  | 'UNIT_UNVALIDATED'
  | 'TIER_TOO_LOW'
  | 'STALE'
  | 'UNRESOLVED_CONFLICT'
  | 'DOCUMENT_UNPARSED'
  | 'PREMISE_FAILED';

/** One failed input. */
export interface ReadinessGapItem {
  input: string;
  reason: ReadinessReason;
  detail: string;
}

/** Readiness of one sub-question for one scrip at one as-of date. */
export interface ReadinessResult {
  subQuestionId: string;
  state: ReadinessState;
  /** factIds / calcIds / researchItemIds that satisfied the rule. */
  satisfiedBy: string[];
  gaps: ReadinessGapItem[];
  /** Present when the contract declares a premise. */
  premiseHolds?: boolean;
  note?: string;
}
