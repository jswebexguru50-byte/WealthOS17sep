/**
 * Unit tests for commandCenter.ts RealizedGains feature-flag branching
 *
 * Tests that:
 *   FLAG OFF → 5 serial per-portfolio dbAll calls (one per closed portfolio)
 *   FLAG ON  → single batched GROUP BY dbAll call replacing the loop
 *   Both paths return the same response shape
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockDbAll, mockDbGet, mockDbRun } = vi.hoisted(() => ({
  mockDbAll: vi.fn(),
  mockDbGet: vi.fn(),
  mockDbRun: vi.fn(),
}));

const { mockIsEnabled } = vi.hoisted(() => ({
  mockIsEnabled: vi.fn(),
}));

const { mockGetUnifiedValuation } = vi.hoisted(() => ({
  mockGetUnifiedValuation: vi.fn(),
}));

const { mockGetCurrencyRates, mockGetAllBankAndFDs } = vi.hoisted(() => ({
  mockGetCurrencyRates: vi.fn(),
  mockGetAllBankAndFDs: vi.fn(),
}));

vi.mock('../../src/server/database.js', () => ({
  getDB: () => ({}),
  dbAll: mockDbAll,
  dbGet: mockDbGet,
  dbRun: mockDbRun,
}));

vi.mock('../../src/server/services/FeatureFlags.js', () => ({
  FLAG: { USE_FACTS_REPO_HOLDINGS: 'USE_FACTS_REPO_HOLDINGS' },
  FeatureFlags: {
    getInstance: () => ({ isEnabled: mockIsEnabled }),
  },
}));

vi.mock('../../src/server/services/FactsRepository.js', () => ({
  FactsRepository: {
    getInstance: () => ({}),
  },
}));

vi.mock('../../src/server/services/UnifiedValuationService.js', () => ({
  UnifiedValuationService: {
    getInstance: () => ({ getUnifiedValuation: mockGetUnifiedValuation }),
  },
}));

vi.mock('../../src/server/services/BankAndFDService.js', () => ({
  BankAndFDService: {
    getInstance: () => ({
      getCurrencyRates: mockGetCurrencyRates,
      getAllBankAndFDs: mockGetAllBankAndFDs,
    }),
  },
}));

// ── Import router after mocks ─────────────────────────────────────────────────

import router from '../../src/server/routes/commandCenter.js';

// ── Fixture data ──────────────────────────────────────────────────────────────

const CLOSED_PORTFOLIOS = ['IIFL360', 'Maa HDFC Sky', 'DBFS', 'Self HDFC Securities', 'Self Mutual Fund'];

function makeValuation(memberId: number = 1) {
  return {
    memberId,
    allowedPortfolios: ['TestPort'],
    holdings: [],
    totalBankAndFdValINR: 0,
    pmsCashInHand: 0,
    unallocatedPmsCash: 0,
    pmsBaselineCost: 0,
    totalNetWorthINR: 1000000,
    totalPortfolioValINR: 1000000,
    totalCostBasisINR: 800000,
    totalTaxCostBasisINR: 800000,
    totalDayChangeINR: 0,
    totalDayChangePct: 0,
    totalUnrealizedGainINR: 200000,
    totalUnrealizedGainPct: 25,
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', router);
  return app;
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

function setupCommonMocks() {
  mockGetUnifiedValuation.mockResolvedValue(makeValuation());
  mockGetCurrencyRates.mockResolvedValue({ USD: 84 });
  mockGetAllBankAndFDs.mockResolvedValue([]);
}

/**
 * FLAG OFF: every SQL call hits dbAll individually.
 * We count the calls that have `WHERE portfolio = ?` (the per-portfolio RealizedGains queries).
 */
function setupFlagOff() {
  setupCommonMocks();
  mockIsEnabled.mockReturnValue(false);
  mockDbAll.mockImplementation((db: any, sql: string, params?: any[]) => {
    // XIRR query
    if (sql.includes('PortfolioHistory'))    return Promise.resolve([]);
    // PMS Transactions
    if (sql.includes('Transactions'))        return Promise.resolve([]);
    // Per-portfolio RealizedGains (5 calls, each for one closed portfolio)
    if (sql.includes('RealizedGains') && sql.includes('WHERE portfolio = ?'))
      return Promise.resolve([{ cost: 0, sales: 0, pnl: 0, start_date: null, end_date: null }]);
    // ValuationSnapshots drift alert check
    if (sql.includes('ValuationSnapshots'))  return Promise.resolve([]);
    return Promise.resolve([]);
  });
  mockDbGet.mockImplementation((db: any, sql: string) => {
    if (sql.includes('ValuationSnapshots') && sql.includes('COUNT'))
      return Promise.resolve({ count: 0, last_ts: null });
    return Promise.resolve(undefined);
  });
}

/**
 * FLAG ON: the batched GROUP BY query is used; individual per-portfolio
 * WHERE portfolio = ? queries must NOT appear.
 */
function setupFlagOn() {
  setupCommonMocks();
  mockIsEnabled.mockReturnValue(true);
  mockDbAll.mockImplementation((db: any, sql: string, params?: any[]) => {
    if (sql.includes('PortfolioHistory'))    return Promise.resolve([]);
    if (sql.includes('Transactions'))        return Promise.resolve([]);
    // Batched RealizedGains with GROUP BY — return one row per portfolio
    if (sql.includes('RealizedGains') && sql.includes('GROUP BY portfolio'))
      return Promise.resolve(
        CLOSED_PORTFOLIOS.map(p => ({ portfolio: p, cost: 0, sales: 0, pnl: 0, start_date: null, end_date: null }))
      );
    if (sql.includes('ValuationSnapshots'))  return Promise.resolve([]);
    return Promise.resolve([]);
  });
  mockDbGet.mockImplementation((db: any, sql: string) => {
    if (sql.includes('COUNT'))
      return Promise.resolve({ count: 0, last_ts: null });
    return Promise.resolve(undefined);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('commandCenter GET / — RealizedGains feature-flag branching', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('FLAG OFF (USE_FACTS_REPO_HOLDINGS = false)', () => {
    beforeEach(() => setupFlagOff());

    it('makes 5 individual per-portfolio RealizedGains dbAll calls', async () => {
      await supertest(app).get('/').expect(200);

      const perPortfolioCalls = mockDbAll.mock.calls.filter(([, sql]: [any, string]) =>
        sql.includes('RealizedGains') && sql.includes('WHERE portfolio = ?')
      );
      expect(perPortfolioCalls.length).toBe(CLOSED_PORTFOLIOS.length);
    });

    it('does NOT make a GROUP BY batched query when flag is off', async () => {
      await supertest(app).get('/').expect(200);

      const batchedCalls = mockDbAll.mock.calls.filter(([, sql]: [any, string]) =>
        sql.includes('RealizedGains') && sql.includes('GROUP BY portfolio')
      );
      expect(batchedCalls.length).toBe(0);
    });

    it('returns 200 with expected summary shape', async () => {
      const res = await supertest(app).get('/').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('closedPortfolios');
      expect(Array.isArray(res.body.closedPortfolios)).toBe(true);
      expect(res.body.closedPortfolios.length).toBe(CLOSED_PORTFOLIOS.length);
    });
  });

  describe('FLAG ON (USE_FACTS_REPO_HOLDINGS = true)', () => {
    beforeEach(() => setupFlagOn());

    it('makes exactly ONE batched GROUP BY RealizedGains query', async () => {
      await supertest(app).get('/').expect(200);

      const batchedCalls = mockDbAll.mock.calls.filter(([, sql]: [any, string]) =>
        sql.includes('RealizedGains') && sql.includes('GROUP BY portfolio')
      );
      expect(batchedCalls.length).toBe(1);
    });

    it('does NOT make per-portfolio WHERE portfolio = ? queries when flag is on', async () => {
      await supertest(app).get('/').expect(200);

      const perPortfolioCalls = mockDbAll.mock.calls.filter(([, sql]: [any, string]) =>
        sql.includes('RealizedGains') && sql.includes('WHERE portfolio = ?')
      );
      expect(perPortfolioCalls.length).toBe(0);
    });

    it('returns same shape response as FLAG OFF', async () => {
      const res = await supertest(app).get('/').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('closedPortfolios');
      expect(Array.isArray(res.body.closedPortfolios)).toBe(true);
      expect(res.body.closedPortfolios.length).toBe(CLOSED_PORTFOLIOS.length);
    });

    it('batched query params include all 5 closed portfolio names', async () => {
      await supertest(app).get('/').expect(200);

      const batchedCall = mockDbAll.mock.calls.find(([, sql]: [any, string]) =>
        sql.includes('RealizedGains') && sql.includes('GROUP BY portfolio')
      );
      expect(batchedCall).toBeDefined();
      const params = batchedCall![2] as string[];
      for (const p of CLOSED_PORTFOLIOS) {
        expect(params).toContain(p);
      }
    });
  });
});
