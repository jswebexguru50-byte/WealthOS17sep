import { describe, it, expect } from 'vitest';
import { ExecutionPolicy } from '../../../src/server/services/execution/ExecutionPolicy.js';
import { createIntentId } from '../../../src/server/services/execution/ExecutionIntent.js';

describe('V672 Track J — Permanent Production Lock Tests', () => {
  const policy = ExecutionPolicy.getInstance();

  it('strictly blocks LIVE execution with GATE_11_PRODUCTION_PROMOTION_NOT_AUTHORIZED', () => {
    const intent: any = {
      intentId: createIntentId({
        securityId: 'TCS',
        decisionGraphId: 'GRAPH_LIVE',
        decisionTimestamp: new Date().toISOString(),
        side: 'BUY',
        quantity: 50
      }),
      securityId: 'TCS',
      exchange: 'NSE',
      side: 'BUY',
      quantity: 50,
      orderType: 'LIMIT',
      limitPrice: 3500,
      product: 'CNC',
      strategyId: 'S1',
      decisionGraphId: 'GRAPH_LIVE',
      decisionTimestamp: new Date().toISOString(),
      expiryTimestamp: new Date().toISOString(),
      riskAuthorizationId: 'RISK_OK',
      capitalProtectionState: 'NORMAL',
      pitContextHash: 'pit_hash_123',
      decisionHash: 'dec_hash_123',
      runId: 'RUN_LIVE_TEST',
      environment: 'LIVE'
    };

    const result = policy.validateIntent(intent, false); // productionPromotionAuthorized = false
    expect(result.authorized).toBe(false);
    expect(result.rejectionCode).toBe('GATE_11_PRODUCTION_PROMOTION_NOT_AUTHORIZED');
  });
});
