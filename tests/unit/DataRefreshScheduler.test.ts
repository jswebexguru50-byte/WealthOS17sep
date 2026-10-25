import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ObservabilityHub
vi.mock('../../src/server/services/ObservabilityHub.js', () => ({
  obs: {
    increment: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    timing: vi.fn(),
  },
}));

// Mock CircuitBreaker — isAvailable returns true by default
vi.mock('../../src/server/services/CircuitBreaker.js', () => ({
  CircuitBreaker: {
    for: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(true) }),
  },
}));

// Mock DataProviderRegistry
vi.mock('../../src/server/services/DataProviderRegistry.js', () => ({
  PROVIDER: { SCREENER: 'screener' },
  DATA_CLASS: {},
  providerMeta: {
    screener: { ttlMs: 172_800_000 },
  },
  fallbackChain: vi.fn().mockReturnValue([]),
}));

// Mock FactsRepository
vi.mock('../../src/server/services/FactsRepository.js', () => ({
  FactsRepository: {
    getInstance: vi.fn().mockReturnValue({
      invalidateTicker: vi.fn(),
      getNseEquityUniverse: vi.fn().mockResolvedValue([]),
      getHoldings: vi.fn().mockResolvedValue([]),
      invalidatePortfolios: vi.fn(),
      listStrategies: vi.fn().mockResolvedValue([]),
      getTicker: vi.fn(),
      getCorporateActions: vi.fn(),
    }),
  },
}));

// Mock BatchFundamentalProvider
vi.mock('../../src/server/services/BatchFundamentalProvider.js', () => ({
  BatchFundamentalProvider: {
    getInstance: vi.fn().mockReturnValue({
      prefetch: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
    }),
  },
}));

import { DataRefreshScheduler } from '../../src/server/services/DataRefreshScheduler.js';
import { CircuitBreaker } from '../../src/server/services/CircuitBreaker.js';
import { FactsRepository } from '../../src/server/services/FactsRepository.js';
import { BatchFundamentalProvider } from '../../src/server/services/BatchFundamentalProvider.js';

describe('DataRefreshScheduler', () => {
  let scheduler: DataRefreshScheduler;
  let mockRepo: ReturnType<typeof FactsRepository.getInstance>;
  let mockPrefetch: ReturnType<typeof vi.fn>;
  let mockIsAvailable: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    (DataRefreshScheduler as any).instance = undefined;

    // Re-set default mock behaviors after clearAllMocks
    mockRepo = FactsRepository.getInstance();
    (mockRepo.getNseEquityUniverse as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockRepo.getHoldings as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    mockPrefetch = BatchFundamentalProvider.getInstance().prefetch as ReturnType<typeof vi.fn>;
    mockPrefetch.mockResolvedValue(undefined);

    mockIsAvailable = vi.fn().mockReturnValue(true);
    (CircuitBreaker.for as ReturnType<typeof vi.fn>).mockReturnValue({ isAvailable: mockIsAvailable });

    scheduler = DataRefreshScheduler.getInstance();
  });

  afterEach(() => {
    try { scheduler.stop(); } catch {}
  });

  it('getInstance() returns singleton', () => {
    const a = DataRefreshScheduler.getInstance();
    const b = DataRefreshScheduler.getInstance();
    expect(a).toBe(b);
  });

  it('status() lists all 3 jobs with running: false before start()', () => {
    const statuses = scheduler.status();
    expect(statuses).toHaveLength(3);
    for (const s of statuses) {
      expect(s.running).toBe(false);
    }
    const names = statuses.map(s => s.name);
    expect(names).toContain('fundamentals');
    expect(names).toContain('corporate-actions');
    expect(names).toContain('universe-cache-warm');
  });

  it('status() shows scheduled: false before start()', () => {
    const statuses = scheduler.status();
    for (const s of statuses) {
      expect(s.scheduled).toBe(false);
    }
  });

  it('runNow("universe-cache-warm") executes and returns { ok: true }', async () => {
    const result = await scheduler.runNow('universe-cache-warm');
    expect(result.ok).toBe(true);
    expect(mockRepo.invalidateTicker).toHaveBeenCalled();
    expect(mockRepo.getNseEquityUniverse).toHaveBeenCalled();
  });

  it('runNow("fundamentals") executes and returns { ok: true }', async () => {
    (mockRepo.getHoldings as ReturnType<typeof vi.fn>).mockResolvedValue([
      { portfolio: 'main', symbol: 'INFY', isin: 'INE009A01021', quantity: 100, avg_buy_price: 1500 },
    ]);
    const result = await scheduler.runNow('fundamentals');
    expect(result.ok).toBe(true);
    expect(mockPrefetch).toHaveBeenCalledWith(['INFY'], 1500);
  });

  it('runNow("corporate-actions") executes and returns { ok: true }', async () => {
    const result = await scheduler.runNow('corporate-actions');
    expect(result.ok).toBe(true);
    expect(mockRepo.invalidatePortfolios).toHaveBeenCalled();
  });

  it('runNow("unknown-job") returns { ok: false } with error message', async () => {
    const result = await scheduler.runNow('unknown-job' as any);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown job/i);
  });

  it('runNow skips prefetch when circuit breaker is open', async () => {
    mockIsAvailable.mockReturnValue(false);
    const result = await scheduler.runNow('fundamentals');
    // Job runs but skips the actual prefetch
    expect(result.ok).toBe(true);
    expect(mockPrefetch).not.toHaveBeenCalled();
  });

  it('stop() clears intervals without throwing', () => {
    scheduler.start();
    expect(() => scheduler.stop()).not.toThrow();
  });

  it('start() is idempotent — calling twice does not double-register jobs', () => {
    scheduler.start();
    const countAfterFirst = scheduler.status().filter(s => s.scheduled).length;
    scheduler.start(); // second call should be no-op
    const countAfterSecond = scheduler.status().filter(s => s.scheduled).length;
    expect(countAfterFirst).toBe(3);
    expect(countAfterSecond).toBe(3);
  });
});
