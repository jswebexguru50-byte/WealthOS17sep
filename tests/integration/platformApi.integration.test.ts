/**
 * Integration tests for platform API endpoints:
 *   GET /api/platform/health
 *   GET /api/platform/provenance
 *   GET /api/v2/facts/ticker/:symbol
 *   GET /api/v2/facts/fundamentals/:symbol
 *   GET /api/v2/facts/holdings
 *   GET /api/v2/facts/universe
 *   GET /api/v2/facts/strategies
 *
 * Uses supertest + vitest; all heavy dependencies are mocked before route import.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';

// --- mocks must be declared before importing the routes ---

vi.mock('../../src/server/services/CircuitBreaker.js', () => ({
  CircuitBreaker: { status: vi.fn().mockReturnValue({}) },
}));

vi.mock('../../src/server/services/ObservabilityHub.js', () => ({
  obs: {
    snapshot: vi.fn().mockReturnValue({
      counters: {},
      histograms: {},
      ts: '2026-01-01T00:00:00Z',
    }),
  },
}));

vi.mock('../../src/server/services/DataProviderRegistry.js', () => ({
  providerMeta: {
    upstox: { priority: 1, requiresSession: false, isExplicitOnly: false },
  },
  PROVIDER: { UPSTOX: 'upstox' },
  initProviderCircuitBreakers: vi.fn(),
}));

vi.mock('../../src/server/services/DataRefreshScheduler.js', () => ({
  DataRefreshScheduler: {
    getInstance: vi.fn().mockReturnValue({
      status: vi.fn().mockReturnValue({}),
      runNow: vi.fn().mockResolvedValue({ ok: true }),
    }),
  },
}));

vi.mock('../../src/server/services/MultiLayerCache.js', () => ({
  MultiLayerCache: {
    getInstance: vi.fn().mockReturnValue({
      stats: vi.fn().mockReturnValue({ total: 0, byClass: {} }),
    }),
  },
}));

vi.mock('../../src/server/services/BudgetEnforcer.js', () => ({
  BudgetEnforcer: {
    getInstance: vi.fn().mockReturnValue({
      status: vi.fn().mockReturnValue({
        globalUsedINR: 0,
        globalLimitINR: 2000,
        globalPct: 0,
        providers: {},
      }),
    }),
  },
}));

vi.mock('../../src/server/services/CostTracker.js', () => ({
  CostTracker: {
    getInstance: vi.fn().mockReturnValue({
      summary: vi.fn().mockReturnValue({
        byProvider: {},
        totalCostINR: 0,
        monthStart: '',
      }),
    }),
  },
}));

const mockProvenanceQuery = vi.fn().mockReturnValue([]);
const mockProvenanceStats = vi.fn().mockReturnValue({ total: 0, byProvider: {}, hitRate: 0 });

vi.mock('../../src/server/services/DataProvenanceService.js', () => ({
  DataProvenanceService: {
    getInstance: vi.fn().mockReturnValue({
      query: mockProvenanceQuery,
      stats: mockProvenanceStats,
    }),
  },
}));

const mockGetTicker = vi.fn().mockResolvedValue({ symbol: 'INFY', name: 'Infosys' });
const mockGetFundamentals = vi.fn().mockResolvedValue({ pe: 25 });
const mockGetHoldings = vi.fn().mockResolvedValue([]);
const mockGetEquityUniverse = vi.fn().mockResolvedValue([]);
const mockGetActiveStrategies = vi.fn().mockResolvedValue([]);

vi.mock('../../src/server/services/UnifiedDataResolver.js', () => ({
  UnifiedDataResolver: {
    getInstance: vi.fn().mockReturnValue({
      getTicker: mockGetTicker,
      getFundamentals: mockGetFundamentals,
      getHoldings: mockGetHoldings,
      getEquityUniverse: mockGetEquityUniverse,
      getActiveStrategies: mockGetActiveStrategies,
    }),
  },
}));

vi.mock('../../src/server/services/ReadinessService.js', () => ({
  readReadiness: vi.fn().mockResolvedValue({ statusCode: 200, body: { ok: true } }),
}));

vi.mock('../../src/server/database.js', () => ({
  getDB: vi.fn(),
  dbAll: vi.fn().mockResolvedValue([]),
  dbGet: vi.fn(),
  dbRun: vi.fn(),
}));

vi.mock('../../src/server/services/DatabaseManager.js', () => ({
  DatabaseManager: {
    getInstance: vi.fn().mockReturnValue({ createBackup: vi.fn() }),
  },
}));

// --- build the minimal Express app ---

let app: express.Express;

beforeAll(async () => {
  const { default: systemRouter } = await import('../../src/server/routes/system.js');
  const { default: factsRouter } = await import('../../src/server/routes/facts.js');

  app = express();
  app.use(express.json());
  app.use('/api', systemRouter);
  app.use('/api/v2/facts', factsRouter);
});

// ────────────────────────────────────────────────
// Platform health
// ────────────────────────────────────────────────

describe('GET /api/platform/health', () => {
  it('returns 200 with ok:true and all expected top-level keys', async () => {
    const res = await request(app).get('/api/platform/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('providers');
    expect(res.body).toHaveProperty('scheduler');
    expect(res.body).toHaveProperty('metrics');
    expect(res.body).toHaveProperty('cache');
    expect(res.body).toHaveProperty('budget');
    expect(res.body).toHaveProperty('costs');
  });

  it('includes provider metadata from providerMeta', async () => {
    const res = await request(app).get('/api/platform/health');
    expect(res.body.providers).toHaveProperty('upstox');
    expect(res.body.providers.upstox).toMatchObject({
      priority: 1,
      requiresSession: false,
      isExplicitOnly: false,
    });
  });
});

// ────────────────────────────────────────────────
// Platform provenance
// ────────────────────────────────────────────────

describe('GET /api/platform/provenance', () => {
  it('returns 200 with ok:true, records array, and stats', async () => {
    const res = await request(app).get('/api/platform/provenance');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.records)).toBe(true);
    expect(res.body).toHaveProperty('stats');
  });

  it('passes symbol query param through to DataProvenanceService.query', async () => {
    mockProvenanceQuery.mockClear();
    const res = await request(app).get('/api/platform/provenance?symbol=INFY');
    expect(res.status).toBe(200);
    expect(mockProvenanceQuery).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'INFY' }),
    );
  });
});

// ────────────────────────────────────────────────
// Facts v2 — ticker
// ────────────────────────────────────────────────

describe('GET /api/v2/facts/ticker/:symbol', () => {
  it('returns 200 with ok:true and ticker data for a known symbol', async () => {
    const res = await request(app).get('/api/v2/facts/ticker/INFY');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ symbol: 'INFY' });
  });

  it('returns 404 with ok:false when resolver returns null', async () => {
    mockGetTicker.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/v2/facts/ticker/UNKNOWN');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

// ────────────────────────────────────────────────
// Facts v2 — fundamentals
// ────────────────────────────────────────────────

describe('GET /api/v2/facts/fundamentals/:symbol', () => {
  it('returns 200 with ok:true and fundamentals data', async () => {
    const res = await request(app).get('/api/v2/facts/fundamentals/INFY');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ pe: 25 });
  });

  it('returns 404 with ok:false when resolver returns null', async () => {
    mockGetFundamentals.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/v2/facts/fundamentals/UNKNOWN');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

// ────────────────────────────────────────────────
// Facts v2 — holdings
// ────────────────────────────────────────────────

describe('GET /api/v2/facts/holdings', () => {
  it('returns 200 with ok:true and data array', async () => {
    const res = await request(app).get('/api/v2/facts/holdings');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ────────────────────────────────────────────────
// Facts v2 — universe
// ────────────────────────────────────────────────

describe('GET /api/v2/facts/universe', () => {
  it('returns 200 with ok:true and data array', async () => {
    const res = await request(app).get('/api/v2/facts/universe');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ────────────────────────────────────────────────
// Facts v2 — strategies
// ────────────────────────────────────────────────

describe('GET /api/v2/facts/strategies', () => {
  it('returns 200 with ok:true and data array', async () => {
    const res = await request(app).get('/api/v2/facts/strategies');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
