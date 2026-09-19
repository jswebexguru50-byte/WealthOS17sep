/**
 * WealthOS v6.6–v6.7 - Execution Policy
 * Execution Architecture
 * 
 * SPEC MANDATE (Section 21 & Section 51):
 * 11 Mandatory Pre-Execution Gates:
 *   ExecutionIntent
 *     ↓
 *   1. PIT check
 *   2. Decision graph authorization
 *   3. Risk authorization
 *   4. Capital protection
 *   5. Position limit
 *   6. Concentration limit
 *   7. Liquidity check
 *   8. Duplicate order check
 *   9. Market/session check
 *   10. Broker/instrument identity
 *   11. Live production promotion check
 * IF ANY CHECK FAILS -> NO ORDER SUBMISSION.
 */

import { ExecutionIntent } from './ExecutionIntent.js';
import { ExecutionValidationResult } from './ExecutionResult.js';

export class ExecutionPolicy {
  private static instance: ExecutionPolicy;
  private submittedIntentIds = new Set<string>();

  public static getInstance(): ExecutionPolicy {
    if (!ExecutionPolicy.instance) {
      ExecutionPolicy.instance = new ExecutionPolicy();
    }
    return ExecutionPolicy.instance;
  }

  public validateIntent(intent: ExecutionIntent, productionPromotionAuthorized = false): ExecutionValidationResult {
    const failedChecks: string[] = [];

    // 1. PIT Check
    if (!intent.pitContextHash || intent.pitContextHash.length < 10) {
      failedChecks.push('GATE_1_PIT_CHECK_FAILED');
    }

    // 2. Decision Graph Authorization
    if (!intent.decisionGraphId || !intent.decisionHash) {
      failedChecks.push('GATE_2_DECISION_GRAPH_UNAUTHORIZED');
    }

    // 3. Risk Authorization
    if (!intent.riskAuthorizationId || intent.riskAuthorizationId.startsWith('BLOCKED')) {
      failedChecks.push('GATE_3_RISK_AUTHORIZATION_MISSING');
    }

    // 4. Capital Protection Check
    if (intent.capitalProtectionState === 'CIRCUIT_BREAKER_TRIGGERED') {
      failedChecks.push('GATE_4_CAPITAL_PROTECTION_HALT');
    }

    // 5. Position Limit Check
    if (intent.quantity <= 0 || intent.quantity > 50000) {
      failedChecks.push('GATE_5_POSITION_LIMIT_EXCEEDED');
    }

    // 6. Concentration Limit Check
    if (intent.limitPrice && intent.quantity * intent.limitPrice > 2500000) {
      failedChecks.push('GATE_6_CONCENTRATION_LIMIT_EXCEEDED');
    }

    // 7. Liquidity Check
    if (intent.quantity > 100000) {
      failedChecks.push('GATE_7_LIQUIDITY_LIMIT_EXCEEDED');
    }

    // 8. Duplicate Order Check (Idempotency)
    if (this.submittedIntentIds.has(intent.intentId)) {
      failedChecks.push('GATE_8_DUPLICATE_ORDER_INTENT');
    }

    // 9. Market/Session Check
    if (!intent.decisionTimestamp) {
      failedChecks.push('GATE_9_INVALID_MARKET_SESSION');
    }

    // 10. Broker/Instrument Identity
    if (!intent.securityId || !intent.exchange) {
      failedChecks.push('GATE_10_UNRESOLVED_SECURITY_IDENTITY');
    }

    // 11. Live Production Promotion Check (HARD INVARIANT)
    if (intent.environment === 'LIVE' && !productionPromotionAuthorized) {
      failedChecks.push('GATE_11_PRODUCTION_PROMOTION_NOT_AUTHORIZED');
    }

    const authorized = failedChecks.length === 0;

    if (authorized) {
      this.submittedIntentIds.add(intent.intentId);
    }

    return {
      authorized,
      intentId: intent.intentId,
      failedChecks,
      rejectionCode: failedChecks[0],
      rejectionReason: authorized
        ? undefined
        : `Pre-execution gate validation failed on: ${failedChecks.join(', ')}`,
      validatedAt: new Date().toISOString()
    };
  }
}
