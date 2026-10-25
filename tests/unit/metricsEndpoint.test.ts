/**
 * Unit tests for GET /metrics — Prometheus text exposition format
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mocks (must be hoisted before importing the router) ───────────────────────

vi.mock('../../src/server/services/ObservabilityHub.js', () => ({
  obs: {
    snapshot: () => ({
      counters: {
        'api.calls{provider=yahoo,success=true}': 10,
        'cache.hits': 5,
      },
      histograms: {
        'fetch.latency{provider=upstox}': { avg: 120.5, p99: 300.0, count: 8 },
      },
      ts: '2026-10-25T00:00:00.000Z',
    }),
  },
}));

vi.mock('../../src/server/services/CircuitBreaker.js', () => ({
  CircuitBreaker: {
    status: () => ({
      'yahoo-finance': 'CLOSED',
      'upstox': 'OPEN',
    }),
  },
}));

vi.mock('../../src/server/services/CostTracker.js', () => ({
  CostTracker: {
    getInstance: () => ({
      summary: () => ({
        byProvider: {
          yahoo: { calls: 42, estimatedCostINR: 4.2, errors: 1 },
          upstox: { calls: 10, estimatedCostINR: 5.0, errors: 0 },
        },
        totalCostINR: 9.2,
        monthStart: '2026-10-01T00:00:00.000Z',
      }),
    }),
  },
}));

// Stub out every other import system.ts pulls in so we don't need a real DB
vi.mock('../../src/server/services/ReadinessService.js', () => ({
  readReadiness: async () => ({ statusCode: 200, body: { ok: true } }),
}));
vi.mock('../../src/server/database.js', () => ({
  getDB: () => ({}),
  dbAll: async () => [],
  dbGet: async () => null,
  dbRun: async () => ({}),
}));
vi.mock('../../src/server/services/DatabaseManager.js', () => ({ DatabaseManager: {} }));
vi.mock('../../src/server/services/DataProviderRegistry.js', () => ({
  providerMeta: {},
  PROVIDER: {},
}));
vi.mock('../../src/server/services/DataRefreshScheduler.js', () => ({
  DataRefreshScheduler: { getInstance: () => ({ status: () => ({}), runNow: async () => ({ ok: true }) }) },
}));
vi.mock('../../src/server/services/MultiLayerCache.js', () => ({
  MultiLayerCache: { getInstance: () => ({ stats: () => ({}) }) },
}));
vi.mock('../../src/server/services/BudgetEnforcer.js', () => ({
  BudgetEnforcer: { getInstance: () => ({ status: () => ({}) }) },
}));
vi.mock('../../src/server/services/DataProvenanceService.js', () => ({
  DataProvenanceService: { getInstance: () => ({ query: () => [], stats: () => ({}) }) },
}));
vi.mock('../../src/server/services/FeatureFlags.js', () => ({
  FeatureFlags: { getInstance: () => ({ snapshot: () => ({}) }) },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

async function buildApp() {
  const router = (await import('../../src/server/routes/system.js')).default;
  const app = express();
  app.use('/', router);
  return app;
}

describe('GET /metrics', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.resetModules();
    app = await buildApp();
  });

  it('responds with Content-Type text/plain', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('body contains # HELP wealthos_counter', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('# HELP wealthos_counter');
  });

  it('body contains # HELP wealthos_circuit_breaker_state', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('# HELP wealthos_circuit_breaker_state');
  });

  it('body contains # HELP wealthos_provider_cost_inr', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('# HELP wealthos_provider_cost_inr');
  });

  it('CLOSED circuit breaker emits state value 0', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/wealthos_circuit_breaker_state\{provider="yahoo-finance"\} 0/);
  });

  it('OPEN circuit breaker emits state value 2', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/wealthos_circuit_breaker_state\{provider="upstox"\} 2/);
  });

  it('body ends with a newline', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text.endsWith('\n')).toBe(true);
  });
});
