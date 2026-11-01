/**
 * Unit tests for reconciliationAudit.ts /waterfall feature-flag branching
 *
 * Tests that:
 *   FLAG OFF → raw dbAll called for Holdings and Transactions
 *   FLAG ON  → FactsRepository.getHoldings / getTransactions called instead
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

const { mockGetHoldings, mockGetTransactions } = vi.hoisted(() => ({
  mockGetHoldings: vi.fn(),
  mockGetTransactions: vi.fn(),
}));

const { mockIsEnabled } = vi.hoisted(() => ({
  mockIsEnabled: vi.fn(),
}));

vi.mock('../../src/server/database.js', () => ({
  getDB: () => ({}),
  dbAll: mockDbAll,
  dbGet: mockDbGet,
  dbRun: mockDbRun,
}));

vi.mock('../../src/server/services/FactsRepository.js', () => ({
  FactsRepository: {
    getInstance: () => ({
      getHoldings: mockGetHoldings,
      getTransactions: mockGetTransactions,
    }),
  },
}));

vi.mock('../../src/server/services/FeatureFlags.js', () => ({
  FLAG: { USE_FACTS_REPO_HOLDINGS: 'USE_FACTS_REPO_HOLDINGS' },
  FeatureFlags: {
    getInstance: () => ({ isEnabled: mockIsEnabled }),
  },
}));

// ── Import router after mocks ─────────────────────────────────────────────────

import router from '../../src/server/routes/reconciliationAudit.js';

// ── Fixture data ──────────────────────────────────────────────────────────────

const BASELINE = {
  portfolio: 'TestPort',
  currency: 'INR',
  baseline_valuation: 100000,
  baseline_cost: 80000,
  baseline_cash: 0,
  baseline_holdings_count: 5,
  statement_date: '2026-01-01',
  statement_filename: 'stmt.csv',
  notes: 'test',
};

const HOLDING = {
  portfolio: 'TestPort',
  symbol: 'INFY',
  isin: 'INE009A01021',
  quantity: 10,
  avg_buy_price: 1500,
  current_value: 15000,
  total_cost: 15000,
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', router);
  return app;
}

// ── Shared setup helpers ──────────────────────────────────────────────────────

/**
 * Wire up the dbAll mock to return appropriate data per SQL fragment.
 * Order matters: ensureAuditTables check, baselines, holdings (flag OFF), bankFDs.
 */
function setupDbAllFlagOff() {
  mockDbAll.mockImplementation((db: any, sql: string, params?: any[]) => {
    if (sql.includes('ReconciliationAuditSnapshots')) return Promise.resolve([BASELINE]);
    if (sql.includes('Holdings'))                     return Promise.resolve([HOLDING]);
    if (sql.includes('Transactions'))                 return Promise.resolve([]);
    if (sql.includes('BankAccountsAndFDs'))           return Promise.resolve([]);
    return Promise.resolve([]);
  });
  // ensureAuditTables: COUNT check returns 1 so seed is skipped
  mockDbGet.mockImplementation((db: any, sql: string) => {
    if (sql.includes('COUNT'))   return Promise.resolve({ c: 1 });
    if (sql.includes('rate_to_inr')) return Promise.resolve({ rate_to_inr: 84 });
    return Promise.resolve(undefined);
  });
  mockDbRun.mockResolvedValue(undefined);
}

function setupDbAllFlagOn() {
  mockDbAll.mockImplementation((db: any, sql: string, params?: any[]) => {
    if (sql.includes('ReconciliationAuditSnapshots')) return Promise.resolve([BASELINE]);
    if (sql.includes('BankAccountsAndFDs'))           return Promise.resolve([]);
    // Holdings/Transactions are NOT expected via dbAll when flag is ON
    return Promise.resolve([]);
  });
  mockDbGet.mockImplementation((db: any, sql: string) => {
    if (sql.includes('COUNT'))   return Promise.resolve({ c: 1 });
    if (sql.includes('rate_to_inr')) return Promise.resolve({ rate_to_inr: 84 });
    return Promise.resolve(undefined);
  });
  mockDbRun.mockResolvedValue(undefined);

  mockGetHoldings.mockResolvedValue([HOLDING]);
  mockGetTransactions.mockResolvedValue([]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('reconciliationAudit /waterfall — feature flag branching', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('FLAG OFF (USE_FACTS_REPO_HOLDINGS = false)', () => {
    beforeEach(() => {
      mockIsEnabled.mockReturnValue(false);
      setupDbAllFlagOff();
    });

    it('calls dbAll with Holdings SQL instead of FactsRepository', async () => {
      await supertest(app).get('/waterfall?portfolio=TestPort').expect(200);

      const holdingsCalls = mockDbAll.mock.calls.filter(([, sql]: [any, string]) =>
        sql.includes('Holdings')
      );
      expect(holdingsCalls.length).toBeGreaterThan(0);
      expect(mockGetHoldings).not.toHaveBeenCalled();
    });

    it('calls dbAll with Transactions SQL inside the portfolio loop', async () => {
      await supertest(app).get('/waterfall?portfolio=TestPort').expect(200);

      const txCalls = mockDbAll.mock.calls.filter(([, sql]: [any, string]) =>
        sql.includes('Transactions')
      );
      expect(txCalls.length).toBeGreaterThan(0);
      expect(mockGetTransactions).not.toHaveBeenCalled();
    });

    it('returns 200 with expected response shape', async () => {
      const res = await supertest(app).get('/waterfall?portfolio=TestPort').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('portfolioDeltas');
      expect(Array.isArray(res.body.portfolioDeltas)).toBe(true);
    });
  });

  describe('FLAG ON (USE_FACTS_REPO_HOLDINGS = true)', () => {
    beforeEach(() => {
      mockIsEnabled.mockReturnValue(true);
      setupDbAllFlagOn();
    });

    it('calls FactsRepository.getHoldings() instead of dbAll for Holdings', async () => {
      await supertest(app).get('/waterfall?portfolio=TestPort').expect(200);

      expect(mockGetHoldings).toHaveBeenCalledWith('TestPort');
      // dbAll must NOT have been called with Holdings SQL
      const holdingsCalls = mockDbAll.mock.calls.filter(([, sql]: [any, string]) =>
        sql.includes('FROM Holdings')
      );
      expect(holdingsCalls.length).toBe(0);
    });

    it('calls FactsRepository.getTransactions() inside the portfolio loop', async () => {
      await supertest(app).get('/waterfall?portfolio=TestPort').expect(200);

      expect(mockGetTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ portfolio: 'TestPort', fromDate: BASELINE.statement_date })
      );
      // dbAll must NOT have been called with Transactions SQL
      const txCalls = mockDbAll.mock.calls.filter(([, sql]: [any, string]) =>
        sql.includes('FROM Transactions')
      );
      expect(txCalls.length).toBe(0);
    });

    it('returns 200 with the same response shape as FLAG OFF', async () => {
      const res = await supertest(app).get('/waterfall?portfolio=TestPort').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('portfolioDeltas');
      expect(Array.isArray(res.body.portfolioDeltas)).toBe(true);
    });
  });

  describe('combined (isCombined=true) portfolio path', () => {
    it('FLAG ON — calls getHoldings() with no portfolio arg for combined view', async () => {
      mockIsEnabled.mockReturnValue(true);
      mockDbAll.mockImplementation((db: any, sql: string) => {
        if (sql.includes('ReconciliationAuditSnapshots')) return Promise.resolve([BASELINE]);
        if (sql.includes('BankAccountsAndFDs'))           return Promise.resolve([]);
        return Promise.resolve([]);
      });
      mockDbGet.mockImplementation((db: any, sql: string) => {
        if (sql.includes('COUNT'))       return Promise.resolve({ c: 1 });
        if (sql.includes('rate_to_inr')) return Promise.resolve({ rate_to_inr: 84 });
        return Promise.resolve(undefined);
      });
      mockDbRun.mockResolvedValue(undefined);
      mockGetHoldings.mockResolvedValue([HOLDING]);
      mockGetTransactions.mockResolvedValue([]);

      await supertest(app).get('/waterfall?portfolio=Combined').expect(200);
      // Combined path passes undefined to getHoldings
      expect(mockGetHoldings).toHaveBeenCalledWith(undefined);
    });
  });
});
