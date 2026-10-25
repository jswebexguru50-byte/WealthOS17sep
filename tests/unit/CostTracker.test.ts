import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/server/services/ObservabilityHub.js', () => ({
  obs: {
    increment: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/server/services/DataProviderRegistry.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/server/services/DataProviderRegistry.js')>(
    '../../src/server/services/DataProviderRegistry.js'
  );
  return actual;
});

import { CostTracker } from '../../src/server/services/CostTracker.js';
import { PROVIDER } from '../../src/server/services/DataProviderRegistry.js';

describe('CostTracker', () => {
  beforeEach(() => {
    // Reset singleton
    (CostTracker as any).instance = undefined;
    vi.clearAllMocks();
  });

  it('getInstance() — returns singleton (same reference twice)', () => {
    const a = CostTracker.getInstance();
    const b = CostTracker.getInstance();
    expect(a).toBe(b);
  });

  it('recordCall(provider, true) — increments call count and cost', () => {
    const tracker = CostTracker.getInstance();
    tracker.recordCall(PROVIDER.UPSTOX, true);
    tracker.recordCall(PROVIDER.UPSTOX, true);

    const summary = tracker.summary();
    const stats = summary.byProvider[PROVIDER.UPSTOX];
    expect(stats.calls).toBe(2);
    expect(stats.estimatedCostINR).toBeCloseTo(1.0); // 2 × 0.50
    expect(stats.errors).toBe(0);
  });

  it('recordCall(provider, false) — increments error count', () => {
    const tracker = CostTracker.getInstance();
    tracker.recordCall(PROVIDER.UPSTOX, true);
    tracker.recordCall(PROVIDER.UPSTOX, false);

    const summary = tracker.summary();
    const stats = summary.byProvider[PROVIDER.UPSTOX];
    expect(stats.calls).toBe(2);
    expect(stats.errors).toBe(1);
  });

  it('totalCostINR() — sums across providers', () => {
    const tracker = CostTracker.getInstance();
    tracker.recordCall(PROVIDER.UPSTOX, true); // 0.50
    tracker.recordCall(PROVIDER.NSE, true);    // 0.05
    tracker.recordCall(PROVIDER.YAHOO, true);  // 0.10

    expect(tracker.totalCostINR()).toBeCloseTo(0.65);
  });

  it('summary() — byProvider breakdown correct, totalCostINR correct, monthStart is a string', () => {
    const tracker = CostTracker.getInstance();
    tracker.recordCall(PROVIDER.KITE, true);
    tracker.recordCall(PROVIDER.SCREENER, true);

    const summary = tracker.summary();
    expect(summary.byProvider[PROVIDER.KITE].calls).toBe(1);
    expect(summary.byProvider[PROVIDER.SCREENER].calls).toBe(1);
    expect(summary.totalCostINR).toBeCloseTo(0.60); // 0.50 + 0.10
    expect(typeof summary.monthStart).toBe('string');
    // monthStart should be a valid ISO date string
    expect(() => new Date(summary.monthStart)).not.toThrow();
  });

  it('reset() — clears all stats; totalCostINR returns 0 after reset', () => {
    const tracker = CostTracker.getInstance();
    tracker.recordCall(PROVIDER.UPSTOX, true);
    tracker.recordCall(PROVIDER.NSE, true);
    expect(tracker.totalCostINR()).toBeGreaterThan(0);

    tracker.reset();
    expect(tracker.totalCostINR()).toBe(0);
    expect(tracker.summary().byProvider).toEqual({});
  });

  it('multiple providers tracked independently', () => {
    const tracker = CostTracker.getInstance();
    tracker.recordCall(PROVIDER.UPSTOX, true);
    tracker.recordCall(PROVIDER.UPSTOX, true);
    tracker.recordCall(PROVIDER.NSE, true);
    tracker.recordCall(PROVIDER.NSE, false);

    const summary = tracker.summary();
    expect(summary.byProvider[PROVIDER.UPSTOX].calls).toBe(2);
    expect(summary.byProvider[PROVIDER.UPSTOX].errors).toBe(0);
    expect(summary.byProvider[PROVIDER.NSE].calls).toBe(2);
    expect(summary.byProvider[PROVIDER.NSE].errors).toBe(1);
  });
});
