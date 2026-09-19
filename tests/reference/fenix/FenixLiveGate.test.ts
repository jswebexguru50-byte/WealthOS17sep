import { describe, it, expect } from 'vitest';
import { ExecutionGateway } from '../../../src/server/services/execution/ExecutionGateway.js';
import { ExecutionIntent, createIntentId } from '../../../src/server/services/execution/ExecutionIntent.js';

describe('Fenix & ExecutionGateway Security Gates (Section 51)', () => {
  it('cannot enter live mode without promotion authorization', async () => {
    const gateway = ExecutionGateway.getInstance();

    const intentId = createIntentId({
      securityId: 'RELIANCE',
      decisionGraphId: 'WEALTHOS_TEST_GRAPH',
      decisionTimestamp: '2024-03-15T15:30:00+05:30',
      side: 'BUY',
      quantity: 50
    });

    const liveIntent: ExecutionIntent = {
      intentId,
      securityId: 'RELIANCE',
      exchange: 'NSE',
      side: 'BUY',
      quantity: 50,
      orderType: 'LIMIT',
      limitPrice: 2400.0,
      product: 'CNC',
      strategyId: 'S1',
      decisionGraphId: 'WEALTHOS_TEST_GRAPH',
      decisionTimestamp: '2024-03-15T15:30:00+05:30',
      expiryTimestamp: '2024-03-15T15:35:00+05:30',
      riskAuthorizationId: 'RISK_AUTH_OK',
      capitalProtectionState: 'NORMAL',
      pitContextHash: 'HASH_PIT_VALID',
      decisionHash: 'HASH_DEC_VALID',
      runId: 'RUN_SEC_TEST',
      environment: 'LIVE'
    };

    const result = await gateway.submit(liveIntent);
    expect(result.status).toBe('REJECTED');
    expect(result.rejectionCode).toBe('GATE_11_PRODUCTION_PROMOTION_NOT_AUTHORIZED');
  });

  it('permits PAPER execution lifecycle when all pre-execution checks pass', async () => {
    const gateway = ExecutionGateway.getInstance();

    const intentId = createIntentId({
      securityId: 'TCS',
      decisionGraphId: 'WEALTHOS_TEST_GRAPH',
      decisionTimestamp: '2024-03-15T15:30:00+05:30',
      side: 'BUY',
      quantity: 25
    });

    const paperIntent: ExecutionIntent = {
      intentId,
      securityId: 'TCS',
      exchange: 'NSE',
      side: 'BUY',
      quantity: 25,
      orderType: 'LIMIT',
      limitPrice: 3200.0,
      product: 'CNC',
      strategyId: 'S1',
      decisionGraphId: 'WEALTHOS_TEST_GRAPH',
      decisionTimestamp: '2024-03-15T15:30:00+05:30',
      expiryTimestamp: '2024-03-15T15:35:00+05:30',
      riskAuthorizationId: 'RISK_AUTH_OK',
      capitalProtectionState: 'NORMAL',
      pitContextHash: 'HASH_PIT_VALID',
      decisionHash: 'HASH_DEC_VALID',
      runId: 'RUN_PAPER_TEST',
      environment: 'PAPER'
    };

    const result = await gateway.submit(paperIntent);
    expect(result.status).toBe('FILLED');
    expect(result.filledQuantity).toBe(25);
  });
});
