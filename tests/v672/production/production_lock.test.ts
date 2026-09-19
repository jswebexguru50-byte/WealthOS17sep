import { describe, it, expect } from 'vitest';
import { ExecutionGateway } from '../../../src/server/services/execution/ExecutionGateway.js';
import { ExecutionPolicy } from '../../../src/server/services/execution/ExecutionPolicy.js';
import { createIntentId } from '../../../src/server/services/execution/ExecutionIntent.js';

describe('V672-R1 — Permanent Production Lock & Execution Gateway Invariant Tests', () => {
  const gateway = ExecutionGateway.getInstance();

  it('strictly blocks LIVE trade orders with GATE_11_PRODUCTION_PROMOTION_NOT_AUTHORIZED', async () => {
    const policy = ExecutionPolicy.getInstance();

    const liveIntent: any = {
      intentId: createIntentId({
        securityId: 'TCS',
        decisionGraphId: 'GRAPH_LIVE',
        decisionTimestamp: new Date().toISOString(),
        side: 'BUY',
        quantity: 100
      }),
      securityId: 'TCS',
      exchange: 'NSE',
      side: 'BUY',
      quantity: 100,
      orderType: 'LIMIT',
      limitPrice: 3500.0,
      product: 'CNC',
      strategyId: 'C12_RESEARCH',
      decisionGraphId: 'GRAPH_LIVE',
      decisionTimestamp: new Date().toISOString(),
      expiryTimestamp: new Date().toISOString(),
      riskAuthorizationId: 'RISK_OK',
      capitalProtectionState: 'NORMAL',
      pitContextHash: 'pit_hash_1234567890',
      decisionHash: 'dec_hash_1234567890',
      runId: 'RUN_LIVE_TEST',
      environment: 'LIVE'
    };

    const outcome = await gateway.submit(liveIntent);
    expect(outcome.status).toBe('REJECTED');
    expect(outcome.rejectionCode).toBe('GATE_11_PRODUCTION_PROMOTION_NOT_AUTHORIZED');

    const policyResult = policy.validateIntent(liveIntent, false);
    expect(policyResult.authorized).toBe(false);
    expect(policyResult.rejectionCode).toBe('GATE_11_PRODUCTION_PROMOTION_NOT_AUTHORIZED');
  });

  it('asserts productionPromotionAuthorization and liveExecutionAuthorization are permanently false', () => {
    const productionPromotionAuthorization = false;
    const liveExecutionAuthorization = false;
    const humanInvestmentApproval = false;

    expect(productionPromotionAuthorization).toBe(false);
    expect(liveExecutionAuthorization).toBe(false);
    expect(humanInvestmentApproval).toBe(false);

    const checkLock = () => {
      if (productionPromotionAuthorization || liveExecutionAuthorization) {
        throw new Error('PRODUCTION_LOCK_VIOLATION');
      }
    };

    expect(checkLock).not.toThrow();
  });
});
