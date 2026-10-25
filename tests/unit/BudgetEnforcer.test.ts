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

// Mock CostTracker module to control values in tests
vi.mock('../../src/server/services/CostTracker.js', () => {
  const mockInstance = {
    totalCostINR: vi.fn().mockReturnValue(0),
    summary: vi.fn().mockReturnValue({
      byProvider: {},
      totalCostINR: 0,
      monthStart: new Date().toISOString(),
    }),
    recordCall: vi.fn(),
    reset: vi.fn(),
  };
  return {
    CostTracker: {
      getInstance: vi.fn().mockReturnValue(mockInstance),
    },
  };
});

import { BudgetEnforcer } from '../../src/server/services/BudgetEnforcer.js';
import { CostTracker } from '../../src/server/services/CostTracker.js';
import { PROVIDER } from '../../src/server/services/DataProviderRegistry.js';

function getMockTracker() {
  return CostTracker.getInstance() as ReturnType<typeof CostTracker.getInstance> & {
    totalCostINR: ReturnType<typeof vi.fn>;
    summary: ReturnType<typeof vi.fn>;
  };
}

describe('BudgetEnforcer', () => {
  let enforcer: BudgetEnforcer;

  beforeEach(() => {
    // Reset singleton
    (BudgetEnforcer as any).instance = undefined;
    enforcer = BudgetEnforcer.getInstance();

    const tracker = getMockTracker();
    (tracker.totalCostINR as any).mockReturnValue(0);
    (tracker.summary as any).mockReturnValue({
      byProvider: {},
      totalCostINR: 0,
      monthStart: new Date().toISOString(),
    });
    vi.clearAllMocks();
    // Re-apply mocks after clearAllMocks
    (tracker.totalCostINR as any).mockReturnValue(0);
    (tracker.summary as any).mockReturnValue({
      byProvider: {},
      totalCostINR: 0,
      monthStart: new Date().toISOString(),
    });
  });

  it('isAllowed(provider) — returns true when under global budget', () => {
    const tracker = getMockTracker();
    (tracker.totalCostINR as any).mockReturnValue(100); // well under 2000
    (tracker.summary as any).mockReturnValue({
      byProvider: { [PROVIDER.UPSTOX]: { calls: 1, estimatedCostINR: 100, errors: 0 } },
      totalCostINR: 100,
      monthStart: new Date().toISOString(),
    });

    expect(enforcer.isAllowed(PROVIDER.UPSTOX)).toBe(true);
  });

  it('isAllowed(provider) — returns false when global budget exceeded', () => {
    const tracker = getMockTracker();
    (tracker.totalCostINR as any).mockReturnValue(2001); // over 2000 limit

    expect(enforcer.isAllowed(PROVIDER.UPSTOX)).toBe(false);
  });

  it('isAllowed(provider) — returns false when per-provider budget exceeded', () => {
    const tracker = getMockTracker();
    // Global under limit but UPSTOX over its 500 INR limit
    (tracker.totalCostINR as any).mockReturnValue(600);
    (tracker.summary as any).mockReturnValue({
      byProvider: {
        [PROVIDER.UPSTOX]: { calls: 1200, estimatedCostINR: 600, errors: 0 },
      },
      totalCostINR: 600,
      monthStart: new Date().toISOString(),
    });

    expect(enforcer.isAllowed(PROVIDER.UPSTOX)).toBe(false);
  });

  it('status() — returns globalUsedINR, globalLimitINR, globalPct, providers object', () => {
    const tracker = getMockTracker();
    (tracker.totalCostINR as any).mockReturnValue(500);
    (tracker.summary as any).mockReturnValue({
      byProvider: {
        [PROVIDER.UPSTOX]: { calls: 10, estimatedCostINR: 300, errors: 0 },
        [PROVIDER.KITE]: { calls: 5, estimatedCostINR: 200, errors: 0 },
      },
      totalCostINR: 500,
      monthStart: new Date().toISOString(),
    });

    const status = enforcer.status();
    expect(status).toHaveProperty('globalUsedINR', 500);
    expect(status).toHaveProperty('globalLimitINR', 2000);
    expect(status).toHaveProperty('globalPct');
    expect(status).toHaveProperty('providers');
    expect(typeof status.providers).toBe('object');
  });

  it('status().globalPct — correct percentage calculation', () => {
    const tracker = getMockTracker();
    (tracker.totalCostINR as any).mockReturnValue(1000);
    (tracker.summary as any).mockReturnValue({
      byProvider: {},
      totalCostINR: 1000,
      monthStart: new Date().toISOString(),
    });

    const status = enforcer.status();
    // 1000 / 2000 * 100 = 50%
    expect(status.globalPct).toBe(50);
  });
});
