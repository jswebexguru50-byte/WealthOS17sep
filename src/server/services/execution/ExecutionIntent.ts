/**
 * WealthOS v6.6–v6.7 - Execution Intent
 * Execution Architecture
 * 
 * SPEC MANDATE:
 * Deterministic unique execution intent with idempotency:
 * A duplicate intent must not submit a second order.
 */

import crypto from 'crypto';

export interface ExecutionIntent {
  intentId: string;
  securityId: string; // Canonical UUID
  exchange: 'NSE' | 'BSE' | 'NFO' | 'BFO';
  side: 'BUY' | 'SELL';
  quantity: number;
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SLM';
  limitPrice?: number;
  triggerPrice?: number;
  product: 'CNC' | 'MIS' | 'NRML';
  strategyId: string;
  decisionGraphId: string;
  decisionTimestamp: string;
  expiryTimestamp: string;
  riskAuthorizationId: string;
  capitalProtectionState: string;
  pitContextHash: string;
  decisionHash: string;
  runId: string;
  environment: 'RESEARCH' | 'PAPER' | 'LIVE';
}

/**
 * Section 29 Idempotency creation function
 */
export function createIntentId(input: {
  securityId: string;
  decisionGraphId: string;
  decisionTimestamp: string;
  side: string;
  quantity: number;
}): string {
  const preImage = JSON.stringify({
    securityId: input.securityId,
    decisionGraphId: input.decisionGraphId,
    decisionTimestamp: input.decisionTimestamp,
    side: input.side,
    quantity: input.quantity
  });
  return crypto.createHash('sha256').update(preImage).digest('hex');
}
