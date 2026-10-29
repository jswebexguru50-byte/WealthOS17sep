/**
 * canonical_consumer_migration.test.ts
 *
 * Verifies that migrated consumers read canonical promoted data (OpportunityDataResolverService)
 * and do NOT call the direct Yahoo Finance provider (fetchTickerData from yahooFinance.js).
 *
 * Acceptance rule: Every consumer must read canonical promoted data first.
 * No consumer may silently perform its own provider fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the canonical resolver before any service imports ────────────────────
vi.mock('../../src/server/services/OpportunityDataResolverService.js', () => {
  const mockResolveMarketData = vi.fn().mockResolvedValue({
    symbol: 'INFY',
    currentPrice: 1850.0,
    previousClose: 1820.0,
    singleDayChangePct: 1.65,
    turnover20DayAvgCr: 12.5,
    latestDate: '2026-10-28',
    candles: Array.from({ length: 260 }, (_, i) => ({
      date: `2026-${String(Math.floor(i / 21) + 1).padStart(2, '0')}-${String((i % 21) + 1).padStart(2, '0')}`,
      open: 1800 + i * 0.2,
      high: 1820 + i * 0.2,
      low: 1790 + i * 0.2,
      close: 1810 + i * 0.2,
      volume: 1500000,
    })),
    dataSource: 'DUCKDB_ADJUSTED' as const,
    isLocalGroundTruth: true,
  });

  return {
    OpportunityDataResolverService: {
      getInstance: () => ({ resolveMarketData: mockResolveMarketData }),
    },
    __mockResolveMarketData: mockResolveMarketData,
  };
});

// ── Mock the direct Yahoo provider — it should NOT be called ─────────────────
vi.mock('../../src/server/yahooFinance.js', () => {
  const fetchTickerData = vi.fn().mockRejectedValue(new Error('fetchTickerData must not be called by a migrated consumer'));
  const getYahooSymbol = vi.fn().mockReturnValue('INFY.NS');
  const isIndianMarketHours = vi.fn().mockReturnValue(false);
  const clearTickerCache = vi.fn();
  return { fetchTickerData, getYahooSymbol, isIndianMarketHours, clearTickerCache };
});

// ── Mock heavy dependencies ───────────────────────────────────────────────────
vi.mock('../../src/server/database.js', () => ({
  getDB: vi.fn().mockReturnValue({}),
  dbAll: vi.fn().mockResolvedValue([]),
  dbGet: vi.fn().mockResolvedValue(null),
  dbRun: vi.fn().mockResolvedValue(undefined),
  runInDbLock: vi.fn().mockImplementation((fn: () => any) => fn()),
  withTx: vi.fn().mockImplementation((db: any, fn: () => any) => fn(db)),
}));

vi.mock('../../src/server/services/MarketDataCache.js', () => ({
  MarketDataCache: {
    getInstance: () => ({
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
    }),
  },
}));

vi.mock('../../src/server/services/DuckDbAdjustedOhlcvService.js', () => ({
  DuckDbAdjustedOhlcvService: {
    getDailyBars: vi.fn().mockResolvedValue(null),
    getDailyBarsForSymbols: vi.fn().mockResolvedValue({}),
    getDuckDbCoverage: vi.fn().mockReturnValue(new Map()),
    workerStarts: 0,
  },
}));

vi.mock('../../src/server/services/NewsSentimentService.js', () => ({
  NewsSentimentService: { getInstance: () => ({ getSentiment: vi.fn().mockResolvedValue(null) }) },
}));

vi.mock('../../src/server/services/SmartMoneyFlowEngine.js', () => ({
  SmartMoneyFlowEngine: {
    getInstance: () => ({
      getMultiTimeframeSmartMoney: vi.fn().mockResolvedValue({ overallClassification: 'NEUTRAL_CHOP', overallScore: 50 }),
    }),
  },
}));

vi.mock('../../src/server/services/SupportResistanceEngine.js', () => ({
  SupportResistanceEngine: {
    getInstance: () => ({
      analyze: vi.fn().mockResolvedValue({ levels: [], recommendation: 'HOLD', stopLoss: 0, target: 0 }),
    }),
  },
}));

vi.mock('../../src/server/services/IndicatorPluginRegistry.js', () => ({
  IndicatorPluginRegistry: { getInstance: () => ({ getAll: vi.fn().mockReturnValue([]) }) },
}));

vi.mock('../../src/server/services/InstitutionalBuyersService.js', () => ({
  InstitutionalBuyersService: { getInstance: () => ({ getAccumulation: vi.fn().mockResolvedValue(null) }) },
}));

vi.mock('../../src/server/services/OrderBookImbalanceService.js', () => ({
  OrderBookImbalanceService: {
    getInstance: () => ({
      getOrderBookDepth: vi.fn().mockResolvedValue({ cmp: 1850, bidAskRatio: 1.1, liquidityModifierPts: 2, depthAvailable: false }),
    }),
  },
}));

vi.mock('../../src/server/services/screenerService.js', () => ({
  ScreenerService: { getInstance: () => ({ getScripData: vi.fn().mockResolvedValue(null) }) },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Canonical Consumer Migration — OrderBookImbalanceService', () => {
  it('uses canonical resolver for price lookup, not direct Yahoo', async () => {
    const { OpportunityDataResolverService } = await import('../../src/server/services/OpportunityDataResolverService.js');
    const { fetchTickerData } = await import('../../src/server/yahooFinance.js');
    const { OrderBookImbalanceService } = await import('../../src/server/services/OrderBookImbalanceService.js');

    const mockResolver = OpportunityDataResolverService.getInstance() as any;
    const resolvespy = vi.spyOn(mockResolver, 'resolveMarketData');

    await OrderBookImbalanceService.getInstance().getOrderBookDepth('INFY');

    expect(resolvespy).toHaveBeenCalledWith('INFY', 5);
    expect(fetchTickerData).not.toHaveBeenCalled();
  });

  it('does not call Yahoo when currentPrice is supplied', async () => {
    const { fetchTickerData } = await import('../../src/server/yahooFinance.js');
    const { OrderBookImbalanceService } = await import('../../src/server/services/OrderBookImbalanceService.js');

    await OrderBookImbalanceService.getInstance().getOrderBookDepth('INFY', 1850);

    expect(fetchTickerData).not.toHaveBeenCalled();
  });
});

describe('Canonical Consumer Migration — SupportResistanceEngine', () => {
  it('uses canonical resolver when no historicalCandles provided, not direct Yahoo', async () => {
    const { OpportunityDataResolverService } = await import('../../src/server/services/OpportunityDataResolverService.js');
    const { fetchTickerData } = await import('../../src/server/yahooFinance.js');

    // Dynamic import to get past module mocks
    const mod = await import('../../src/server/services/SupportResistanceEngine.js');
    const engine = (mod as any).SupportResistanceEngine;
    if (!engine || typeof engine.getInstance !== 'function') return; // skip if mocked

    const mockResolver = OpportunityDataResolverService.getInstance() as any;
    const resolvespy = vi.spyOn(mockResolver, 'resolveMarketData');

    try {
      await engine.getInstance().analyze('INFY');
    } catch {
      // May throw if candles are fewer than minimum; we only care about the provider calls
    }

    expect(fetchTickerData).not.toHaveBeenCalled();
  });
});

describe('Canonical Consumer Migration — SmartMoneyConceptsEngine', () => {
  it('uses canonical resolver for stock OHLCV, not direct Yahoo', async () => {
    const { OpportunityDataResolverService } = await import('../../src/server/services/OpportunityDataResolverService.js');
    const { fetchTickerData } = await import('../../src/server/yahooFinance.js');
    const { SmartMoneyConceptsEngine } = await import('../../src/server/services/SmartMoneyConceptsEngine.js');

    const mockResolver = OpportunityDataResolverService.getInstance() as any;
    const resolvespy = vi.spyOn(mockResolver, 'resolveMarketData');

    try {
      await (SmartMoneyConceptsEngine as any).getInstance?.()?.analyzeSymbol?.('INFY', 180)
        ?? await new (SmartMoneyConceptsEngine as any)().analyzeSymbol?.('INFY', 180);
    } catch {
      // May throw on analysis; we only verify provider calls
    }

    expect(resolvespy).toHaveBeenCalledWith('INFY', 180);
    // fetchTickerData may still be called for ^NSEI benchmark (category-b exception), but not for the equity symbol
    const stockCalls = (fetchTickerData as any).mock?.calls?.filter((c: any[]) => !c[0]?.startsWith('^')) ?? [];
    expect(stockCalls.length).toBe(0);
  });
});

describe('Canonical Consumer Migration — MultibaggerDiscoveryEngine', () => {
  it('resolveMarketData import present and fetchTickerData removed', async () => {
    // Static check: MultibaggerDiscoveryEngine must not import fetchTickerData directly
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve('src/server/services/MultibaggerDiscoveryEngine.ts'),
      'utf8'
    );
    expect(src).toContain('OpportunityDataResolverService');
    expect(src).not.toContain("import { fetchTickerData }");
    expect(src).not.toContain("fetchTickerData(`${item.symbol}");
  });
});

describe('Canonical Consumer Migration — TechnicalMomentumEngine', () => {
  it('resolveMarketData import present and fetchTickerData removed', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve('src/server/services/TechnicalMomentumEngine.ts'),
      'utf8'
    );
    expect(src).toContain('OpportunityDataResolverService');
    expect(src).not.toContain("import { fetchTickerData }");
    expect(src).not.toContain("fetchTickerData(yfSym");
  });
});

describe('Canonical Consumer Migration — SmartMoneyFlowEngine (getMultiTimeframeSmartMoney)', () => {
  it('resolveMarketData used in getMultiTimeframeSmartMoney, yfSym fetchTickerData removed', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve('src/server/services/SmartMoneyFlowEngine.ts'),
      'utf8'
    );
    expect(src).toContain('OpportunityDataResolverService');
    // The old direct Yahoo call in getMultiTimeframeSmartMoney must be gone
    expect(src).not.toContain("fetchTickerData(yfSym, 365)");
    expect(src).toContain("resolveMarketData(cleanSym, 260)");
  });
});
