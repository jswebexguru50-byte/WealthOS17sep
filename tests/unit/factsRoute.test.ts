import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock deps before importing the router
vi.mock('../../src/server/services/ObservabilityHub.js', () => ({
  obs: { info: vi.fn(), timing: vi.fn(), increment: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/server/services/DataProviderRegistry.js', () => ({
  PROVIDER: {},
  DATA_CLASS: {},
}));

const mockResolver = {
  getTicker: vi.fn(),
  getFundamentals: vi.fn(),
  getHoldings: vi.fn(),
  getEquityUniverse: vi.fn(),
  getActiveStrategies: vi.fn(),
};

vi.mock('../../src/server/services/UnifiedDataResolver.js', () => ({
  UnifiedDataResolver: {
    getInstance: vi.fn().mockReturnValue(mockResolver),
  },
}));

// Import AFTER mocks are set up
const { default: factsRouter } = await import('../../src/server/routes/facts.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', factsRouter);
  return app;
}

describe('facts router', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── /ticker/:symbol ────────────────────────────────────────────────────

  it('GET /ticker/:symbol — 200 with ok:true when resolver returns data', async () => {
    mockResolver.getTicker.mockResolvedValueOnce({ symbol: 'INFY', ltp: 1500 });

    const res = await request(app).get('/ticker/infy');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ symbol: 'INFY', ltp: 1500 });
    expect(mockResolver.getTicker).toHaveBeenCalledWith('INFY'); // uppercased
  });

  it('GET /ticker/:symbol — 404 with ok:false when resolver returns null', async () => {
    mockResolver.getTicker.mockResolvedValueOnce(null);

    const res = await request(app).get('/ticker/UNKNOWN');

    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  // ── /fundamentals/:symbol ─────────────────────────────────────────────

  it('GET /fundamentals/:symbol — 200 with data when resolver returns data', async () => {
    mockResolver.getFundamentals.mockResolvedValueOnce({ pe: 25, roe: 0.18 });

    const res = await request(app).get('/fundamentals/TCS');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ pe: 25 });
  });

  it('GET /fundamentals/:symbol — 404 when resolver returns null', async () => {
    mockResolver.getFundamentals.mockResolvedValueOnce(null);

    const res = await request(app).get('/fundamentals/GHOST');

    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  // ── /holdings ─────────────────────────────────────────────────────────

  it('GET /holdings — 200 with data array', async () => {
    mockResolver.getHoldings.mockResolvedValueOnce([{ symbol: 'INFY', qty: 100 }]);

    const res = await request(app).get('/holdings');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].symbol).toBe('INFY');
  });

  it('GET /holdings passes portfolio query param to resolver', async () => {
    mockResolver.getHoldings.mockResolvedValueOnce([]);

    await request(app).get('/holdings?portfolio=family_office');

    expect(mockResolver.getHoldings).toHaveBeenCalledWith('family_office');
  });

  // ── /universe ─────────────────────────────────────────────────────────

  it('GET /universe — 200 with array', async () => {
    mockResolver.getEquityUniverse.mockResolvedValueOnce([{ symbol: 'NIFTY50' }]);

    const res = await request(app).get('/universe');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ── /strategies ───────────────────────────────────────────────────────

  it('GET /strategies — 200 with array', async () => {
    mockResolver.getActiveStrategies.mockResolvedValueOnce([{ name: 'momentum' }]);

    const res = await request(app).get('/strategies');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data[0].name).toBe('momentum');
  });

  // ── error handling ────────────────────────────────────────────────────

  it('GET /ticker/:symbol — 500 when resolver throws', async () => {
    mockResolver.getTicker.mockRejectedValueOnce(new Error('DB timeout'));

    const res = await request(app).get('/ticker/INFY');

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });
});
