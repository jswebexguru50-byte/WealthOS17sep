import type { SubAnswer } from '../domain/index.js';

/** BLOCKING defects stop publication; WARNING defects are shown to the reviewer and the human. */
export type DefectSeverity = 'BLOCKING' | 'WARNING';

/** Stable machine codes for deterministic defects. */
export type DefectCode =
  | 'SCHEMA_INVALID'
  | 'MISSING_REF'
  | 'REF_KIND_MISMATCH'
  | 'NULL_VALUE_REF'
  | 'VALUE_MISMATCH'
  | 'UNIT_MISMATCH'
  | 'PERIOD_MISMATCH'
  | 'SCOPE_MISMATCH'
  | 'MISSING_LABEL'
  | 'QUARANTINED_EVIDENCE'
  | 'SIMULATED_EVIDENCE'
  | 'LATEST_AS_STATUTORY'
  | 'SECONDARY_AS_STATUTORY'
  | 'REJECTED_EVIDENCE'
  | 'RECON_FAILED_EVIDENCE'
  | 'UNSUPPORTED_CALC'
  | 'UNCLAIMED_NUMBER'
  | 'PERIOD_LABEL_UNSUPPORTED'
  | 'DUPLICATE_CLAIM_ID'
  | 'MISSING_ANSWER'
  | 'DUPLICATE_ANSWER'
  | 'UNKNOWN_SUBQUESTION'
  | 'NON_TERMINAL_STATE'
  | 'EMPTY_NARRATIVE'
  | 'ANSWERED_WITHOUT_CLAIMS'
  | 'CLAIM_WITHOUT_REFS'
  | 'PARTIAL_WITHOUT_GAP'
  | 'NOT_DISCLOSED_WITHOUT_SOURCES'
  | 'NA_WITHOUT_PREMISE_CHECK'
  | 'NA_PREMISE_HOLDS'
  | 'OUT_OF_SCOPE_MUST_BE_NA'
  | 'NA_NOT_ALLOWED'
  | 'ANSWER_CONTRADICTS_READINESS'
  | 'DUPLICATE_NARRATIVE'
  | 'FORBIDDEN_LANGUAGE'
  | 'CROSS_SCRIP_LEAKAGE';

/** One deterministic finding about a draft. */
export interface Defect {
  code: DefectCode;
  severity: DefectSeverity;
  subQuestionId: string;
  claimId?: string;
  message: string;
  evidence?: string;
}

/** Outcome of a deterministic check: ok is true when no BLOCKING defect exists. */
export interface CheckVerdict {
  ok: boolean;
  defects: Defect[];
}

/** Reviewer finding severity. Only BLOCKING findings force a revision. */
export type FindingSeverity = 'BLOCKING' | 'WARNING' | 'INFO';

/** One reviewer finding (reviews/schema in review.schema.json). */
export interface ReviewFinding {
  subQuestionId: string;
  severity: FindingSeverity;
  defect: string;
  evidence: string;
  requiredFix: string;
}

/** Reviewer output. The reviewer may only report findings; it cannot add facts or claims. */
export interface ReviewResult {
  verdict: 'PASS' | 'REVISE';
  findings: ReviewFinding[];
}

/** Draft payload as accepted by the pipeline. */
export interface DraftPayload {
  answers: SubAnswer[];
}

/** Builds a verdict from a defect list. */
export function verdictOf(defects: Defect[]): CheckVerdict {
  return { ok: !defects.some(d => d.severity === 'BLOCKING'), defects };
}

/** The question number from a sub-question id such as `Q17.b`, or null. */
export function questionNumberOf(subQuestionId: string): number | null {
  const match = /^Q(\d+)(?:\.|$)/.exec(subQuestionId);
  return match ? Number(match[1]) : null;
}
