/**
 * WealthOS v6.6–v6.7 - Execution Result
 * Execution Architecture
 */

export type ExecutionStatus =
  | 'PENDING'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'REJECTED'
  | 'CANCELLED';

export interface ExecutionResult {
  intentId: string;
  provider: string;
  providerOrderId?: string;
  status: ExecutionStatus;
  filledQuantity: number;
  averageFillPrice?: number;
  rejectionCode?: string;
  rejectionReason?: string;
  providerTimestamp: string;
  rawResponseHash: string;
  executedAt: string;
}

export interface ExecutionValidationResult {
  authorized: boolean;
  intentId: string;
  failedChecks: string[];
  rejectionCode?: string;
  rejectionReason?: string;
  validatedAt: string;
}
