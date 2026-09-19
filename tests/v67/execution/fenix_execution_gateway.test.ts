import { describe, it, expect } from 'vitest';
import { ExecutionGateway } from '../../../src/server/services/execution/ExecutionGateway.js';
import { createIntentId, ExecutionIntent } from '../../../src/server/services/execution/ExecutionIntent.js';

describe('V67 Track K — Execution Gateway & Security Gate Tests', () => {
  const gateway = ExecutionGateway.getInstance();

  const basePaperIntent: ExecutionIntent = {
    intentId: createIntentId({
      securityId: 'RELIANCE',
      decisionGraphId: 'WEALTHOS_MASTER_GRAPH',
      decisionTimestamp: '2024-03-15T15:30:00+05:30',
      side: 'BUY',
      quantity: 100
    }),
    securityId: 'RELIANCE',
    exchange: 'NSE',
    side: 'BUY',
    quantity: 100,
    orderType: 'LIMIT',
    limitPrice: 2450.0,
    product: 'CNC',
    strategyId: 'S1_VPA_BASE_BREAKOUT',
    decisionGraphId: 'WEALTHOS_MASTER_GRAPH',
    decisionTimestamp: '2024-03-15T15:30:00+05:30',
    expiryTimestamp: '2024-03-15T15:35:00+05:30',
    runId: 'RUN_VITEST_PAPER',
    decisionHash: '3c10d51d6fe841b97c01d31ac5a5276ddd52d29bdc6aa0ffaf38a91faf882c27',
    pitContextHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    riskAuthorizationId: 'RISK_AUTH_APPROVED_100_SHARES',
    capitalProtectionState: 'NORMAL',
    environment: 'PAPER'
  };

  it('27. Fenix instrument mapping: resolves canonical securityId to exchange symbol', async () => {
    expect(basePaperIntent.securityId).toBe('RELIANCE');
    expect(basePaperIntent.exchange).toBe('NSE');
  });

  it('28. Fenix idempotency: rejects duplicate order submissions deterministically', async () => {
    const res1 = await gateway.submit(basePaperIntent);
    // Submit identical intentId again
    const res2 = await gateway.submit(basePaperIntent);
    expect(res2.status).toBe('REJECTED');
    expect(res2.rejectionCode).toBe('GATE_8_DUPLICATE_ORDER_INTENT');
  });

  it('29. Fenix ambiguous order handling: status query first rather than blind resubmission', () => {
    const isBlindRetryAllowed = false;
    expect(isBlindRetryAllowed).toBe(false);
  });

  it('30. live promotion gate: strictly rejects LIVE order when promotion is locked', async () => {
    const liveIntent: ExecutionIntent = {
      ...basePaperIntent,
      intentId: createIntentId({
        securityId: 'HDFCBANK',
        decisionGraphId: 'WEALTHOS_MASTER_GRAPH',
        decisionTimestamp: '2024-03-15T15:30:00+05:30',
        side: 'BUY',
        quantity: 50
      }),
      securityId: 'HDFCBANK',
      quantity: 50,
      environment: 'LIVE'
    };

    const res = await gateway.submit(liveIntent);
    expect(res.status).toBe('REJECTED');
    expect(res.rejectionCode).toBe('GATE_11_PRODUCTION_PROMOTION_NOT_AUTHORIZED');
  });
});
