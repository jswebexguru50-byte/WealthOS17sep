/**
 * WatchContracts.ts — Section 10 & Stage 6 Generic Monitoring Loop
 *
 * Formal contracts for user-configured watch rules and state evaluations.
 */

export type WatchSubjectType =
  | 'METRIC'
  | 'EVENT'
  | 'COMMITMENT'
  | 'VALUATION'
  | 'TECHNICAL'
  | 'PRICE';

export type WatchConditionOperator =
  | 'BELOW_THRESHOLD'
  | 'ABOVE_THRESHOLD'
  | 'MAINTAIN_ABOVE'
  | 'MAINTAIN_BELOW'
  | 'EVENT_TRIGGER'
  | 'STATUS_CHANGE';

export type WatchRuleStatus = 'ACTIVE' | 'PAUSED' | 'TRIGGERED' | 'DISMISSED';

export interface WatchRule {
  watchId: string;
  userId?: string;
  securityId: string;
  symbol: string;
  subjectType: WatchSubjectType;
  subject: string;                  // metric name or event type
  operator?: WatchConditionOperator;
  threshold?: number | string;
  unit?: string;
  status: WatchRuleStatus;
  description: string;
  createdAt: string;
  updatedAt?: string;
}

export interface WatchEvaluation {
  watchId: string;
  securityId: string;
  symbol: string;
  evaluatedAt: string;
  previousState?: 'SATISFIED' | 'TRIGGERED' | 'BREACHED' | 'UNKNOWN';
  currentState: 'SATISFIED' | 'TRIGGERED' | 'BREACHED' | 'UNKNOWN';
  triggeringEvidenceIds: string[];
  explanation: string;
}

export interface WatchEvent {
  eventId: string;
  watchId: string;
  securityId: string;
  symbol: string;
  occurredAt: string;
  summary: string;
  severity: 'INFO' | 'ALERT' | 'CRITICAL';
  evidenceIds: string[];
}
