import { describe, it, expect } from 'vitest';
import { FenixPaperExecutionAdapter } from '../../../src/server/services/reference/fenix/FenixPaperExecutionAdapter.js';

describe('V672 Track J — Fenix Paper Failure Matrix Tests', () => {
  const adapter = new FenixPaperExecutionAdapter();

  it('validates paper order execution lifecycle and reconciliation', async () => {
    const trace = await adapter.executePaperLifecycle({
      intentId: 'INT_TEST_01',
      exchange: 'NSE',
      symbol: 'INFY',
      side: 'BUY',
      quantity: 100,
      orderType: 'LIMIT',
      limitPrice: 1500,
      product: 'CNC',
      environment: 'PAPER'
    });

    expect(trace.orderSubmitted).toBe(true);
    expect(trace.reconciliationMatch).toBe(true);
    expect(trace.filledQuantity).toBe(100);
  });
});
