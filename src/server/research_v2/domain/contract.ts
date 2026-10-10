/** Whether a question is answered by the fundamental-analysis program. */
export type AppliesIn = 'FUNDAMENTAL' | 'OUT_OF_SCOPE';

/** Source classes a sub-question may need; the gap planner requests only what is missing. */
export type SourceNeed =
  | 'XBRL_FACTS'
  | 'SHAREHOLDING'
  | 'FILING_DOCUMENT'
  | 'CONCALL'
  | 'ANNUAL_REPORT'
  | 'PROVIDER_FUNDAMENTALS'
  | 'WEB_PRIMARY';

/** A premise a question assumes (for example that the company has an order book). */
export interface Premise {
  /** Named test, e.g. `has_order_book`. */
  test: string;
  /** What to do when the premise is false. */
  ifFalse: 'ANSWER_UNDERLYING_QUESTION' | 'NOT_APPLICABLE';
}

/** One sub-question of a question; id looks like `Q7.b`. */
export interface SubQuestion {
  id: string;
  /** Parent question number 1..29. */
  question: number;
  text: string;
  /** Canonical metric names the readiness rule checks. */
  requiredMetrics: string[];
  /** Calculator ids the answer may rely on. */
  calcIds: string[];
  sourceNeeds: SourceNeed[];
  premise: Premise | null;
  appliesIn: AppliesIn;
  /** Required when appliesIn is OUT_OF_SCOPE: why it resolves to NOT_APPLICABLE. */
  outOfScopeReason?: string;
}

/** One of the 29 questions with its sub-questions. */
export interface QuestionContract {
  /** 1..29. */
  id: number;
  topic: string;
  question: string;
  subQuestions: SubQuestion[];
  premise: Premise | null;
  appliesIn: AppliesIn;
  /** Optional word budget per answer. */
  wordBudget?: number;
}
