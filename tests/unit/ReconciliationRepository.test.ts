import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockDbAll, mockDbGet, mockDbRun } = vi.hoisted(() => ({
  mockDbAll: vi.fn(),
  mockDbGet: vi.fn(),
  mockDbRun: vi.fn(),
}));

vi.mock('../../src/server/database.js', () => ({
  getDB: () => ({}),
  dbAll: mockDbAll,
  dbGet: mockDbGet,
  dbRun: mockDbRun,
}));

import { ReconciliationRepository } from '../../src/server/services/ReconciliationRepository.js';

function resetSingleton() { (ReconciliationRepository as any).instance = undefined; }
function fresh() { resetSingleton(); return ReconciliationRepository.getInstance(); }
const db: any = {};

describe('ReconciliationRepository', () => {
  beforeEach(() => { vi.clearAllMocks(); resetSingleton(); });
  afterEach(() => { resetSingleton(); });

  describe('getInstance', () => {
    it('is a singleton', () => expect(fresh()).toBe(ReconciliationRepository.getInstance()));
  });

  describe('ensureAuditTable', () => {
    it('runs CREATE TABLE IF NOT EXISTS', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().ensureAuditTable(db);
      expect(mockDbRun.mock.calls[0][1]).toContain('CREATE TABLE IF NOT EXISTS');
    });
  });

  describe('getSnapshotCount', () => {
    it('returns count row', async () => {
      mockDbGet.mockResolvedValue({ c: 3 });
      const result = await fresh().getSnapshotCount(db);
      expect(result?.c).toBe(3);
    });
    it('returns undefined when table is empty', async () => {
      mockDbGet.mockResolvedValue(undefined);
      expect(await fresh().getSnapshotCount(db)).toBeUndefined();
    });
  });

  describe('insertSnapshot', () => {
    it('calls dbRun with 9 params', async () => {
      mockDbRun.mockResolvedValue({});
      const b = {
        statement_date: '2026-01-01', portfolio: 'cc9', statement_filename: 'f.csv',
        baseline_holdings_count: 10, baseline_cost: 1e6, baseline_valuation: 2e6,
        baseline_cash: 0, currency: 'INR', notes: 'test'
      };
      await fresh().insertSnapshot(db, b);
      const params = mockDbRun.mock.calls[0][2];
      expect(params).toHaveLength(9);
      expect(params[1]).toBe('cc9');
    });
  });

  describe('getUsdRate', () => {
    it('returns the rate row', async () => {
      mockDbGet.mockResolvedValue({ rate_to_inr: 84.5 });
      const result: any = await fresh().getUsdRate(db);
      expect(result.rate_to_inr).toBe(84.5);
    });
    it('returns undefined when no rate configured', async () => {
      mockDbGet.mockResolvedValue(undefined);
      expect(await fresh().getUsdRate(db)).toBeUndefined();
    });
  });

  describe('getAllBaselines', () => {
    it('returns all snapshot rows', async () => {
      mockDbAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const result = await fresh().getAllBaselines(db);
      expect(result).toHaveLength(2);
    });
    it('returns [] when no snapshots', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await fresh().getAllBaselines(db)).toEqual([]);
    });
  });

  describe('getBaselineForPortfolio', () => {
    it('passes portfolio as LOWER param', async () => {
      mockDbAll.mockResolvedValue([{ portfolio: 'cc9' }]);
      await fresh().getBaselineForPortfolio(db, 'cc9');
      expect(mockDbAll.mock.calls[0][2]).toEqual(['cc9']);
    });
    it('returns [] when portfolio not found', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await fresh().getBaselineForPortfolio(db, 'nobody')).toEqual([]);
    });
  });

  describe('getAllHoldings / getHoldingsForPortfolio', () => {
    it('getAllHoldings does not pass params', async () => {
      mockDbAll.mockResolvedValue([{ symbol: 'INFY' }]);
      await fresh().getAllHoldings(db);
      expect(mockDbAll.mock.calls[0][2]).toBeUndefined();
    });
    it('getHoldingsForPortfolio passes portfolio', async () => {
      mockDbAll.mockResolvedValue([]);
      await fresh().getHoldingsForPortfolio(db, 'Alpha');
      expect(mockDbAll.mock.calls[0][2]).toEqual(['Alpha']);
    });
  });

  describe('getTransactionsAfterDate', () => {
    it('returns transactions after date', async () => {
      mockDbAll.mockResolvedValue([{ type: 'BUY' }]);
      const result = await fresh().getTransactionsAfterDate(db, 'cc9', '2026-01-01');
      expect(result).toHaveLength(1);
      expect(mockDbAll.mock.calls[0][2]).toEqual(['cc9', '2026-01-01']);
    });
    it('returns [] on DB error (catch)', async () => {
      mockDbAll.mockRejectedValue(new Error('table gone'));
      const result = await fresh().getTransactionsAfterDate(db, 'p', '2026-01-01');
      expect(result).toEqual([]);
    });
  });

  describe('getBankFDs', () => {
    it('returns bank FD rows', async () => {
      mockDbAll.mockResolvedValue([{ id: 1, balance_amount: 50000 }]);
      const result = await fresh().getBankFDs(db);
      expect(result[0].balance_amount).toBe(50000);
    });
    it('returns [] on error (catch)', async () => {
      mockDbAll.mockRejectedValue(new Error('no table'));
      expect(await fresh().getBankFDs(db)).toEqual([]);
    });
  });

  describe('getDataQualitySummary', () => {
    it('returns summary row', async () => {
      mockDbAll.mockResolvedValue([{ total_audited: 5 }]);
      const result = await fresh().getDataQualitySummary(db);
      expect(result[0].total_audited).toBe(5);
    });
  });

  describe('getDataQualityQuarters', () => {
    it('returns quarters', async () => {
      mockDbAll.mockResolvedValue([{ as_of_quarter: 'Q3 FY26', count: 3 }]);
      const result = await fresh().getDataQualityQuarters(db);
      expect(result).toHaveLength(1);
    });
  });

  describe('getDataQualityLedger', () => {
    it('adds status filter when provided', async () => {
      mockDbAll.mockResolvedValue([]);
      await fresh().getDataQualityLedger(db, 'PASSED', 50);
      const sql = mockDbAll.mock.calls[0][1];
      expect(sql).toContain('integrity_status');
    });
    it('no status filter when undefined', async () => {
      mockDbAll.mockResolvedValue([]);
      await fresh().getDataQualityLedger(db, undefined, 200);
      const sql = mockDbAll.mock.calls[0][1];
      expect(sql).not.toContain('integrity_status');
    });
  });

  describe('getStockAuditCard', () => {
    it('returns audit row for symbol', async () => {
      mockDbGet.mockResolvedValue({ symbol: 'INFY', integrity_status: 'PASSED' });
      const result: any = await fresh().getStockAuditCard(db, 'INFY');
      expect(result.symbol).toBe('INFY');
    });
    it('returns undefined for unknown symbol', async () => {
      mockDbGet.mockResolvedValue(undefined);
      expect(await fresh().getStockAuditCard(db, 'NONE')).toBeUndefined();
    });
  });

  describe('getDriftRowsForSymbol', () => {
    it('passes symbol param', async () => {
      mockDbAll.mockResolvedValue([]);
      await fresh().getDriftRowsForSymbol(db, 'TCS');
      expect(mockDbAll.mock.calls[0][2]).toContain('TCS');
    });
  });

  describe('getHistoricalFinancials', () => {
    it('returns financials sorted by type', async () => {
      mockDbAll.mockResolvedValue([{ statement_type: 'ANNUAL_PL' }]);
      const result = await fresh().getHistoricalFinancials(db, 'TCS');
      expect(result).toHaveLength(1);
    });
    it('returns [] when no data', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await fresh().getHistoricalFinancials(db, 'NONE')).toEqual([]);
    });
  });

  describe('getHistoricalShareholding', () => {
    it('passes symbol param', async () => {
      mockDbAll.mockResolvedValue([{ quarter_label: 'Q3FY26' }]);
      await fresh().getHistoricalShareholding(db, 'WIPRO');
      expect(mockDbAll.mock.calls[0][2]).toContain('WIPRO');
    });
    it('returns [] when no data', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await fresh().getHistoricalShareholding(db, 'NONE')).toEqual([]);
    });
  });
});
