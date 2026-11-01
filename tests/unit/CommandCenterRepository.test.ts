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

import { CommandCenterRepository } from '../../src/server/services/CommandCenterRepository.js';

function resetSingleton() { (CommandCenterRepository as any).instance = undefined; }
function fresh() { resetSingleton(); return CommandCenterRepository.getInstance(); }
const db: any = {};

describe('CommandCenterRepository', () => {
  beforeEach(() => { vi.clearAllMocks(); resetSingleton(); });
  afterEach(() => { resetSingleton(); });

  describe('getInstance', () => {
    it('is a singleton', () => expect(fresh()).toBe(CommandCenterRepository.getInstance()));
  });

  describe('getLatestXirrPerPortfolio', () => {
    it('returns XIRR rows', async () => {
      mockDbAll.mockResolvedValue([{ portfolio: 'Alpha', xirr: 0.18 }]);
      const result = await fresh().getLatestXirrPerPortfolio(db);
      expect(result[0].xirr).toBe(0.18);
    });
    it('returns [] on error (catch)', async () => {
      mockDbAll.mockRejectedValue(new Error('table missing'));
      expect(await fresh().getLatestXirrPerPortfolio(db)).toEqual([]);
    });
  });

  describe('getPmsTransactions', () => {
    it('returns PMS/CC9/IIFL transactions', async () => {
      mockDbAll.mockResolvedValue([{ portfolio: 'cc9', type: 'BUY' }]);
      const result = await fresh().getPmsTransactions(db);
      expect(result[0].portfolio).toBe('cc9');
      expect(mockDbAll.mock.calls[0][1]).toContain('pms');
    });
    it('returns [] on error (catch)', async () => {
      mockDbAll.mockRejectedValue(new Error('table gone'));
      expect(await fresh().getPmsTransactions(db)).toEqual([]);
    });
  });

  describe('getRealizedGainsStats', () => {
    it('returns aggregate stats for portfolio', async () => {
      mockDbAll.mockResolvedValue([{ cost: 100000, sales: 150000, pnl: 50000, start_date: '2023-01-01', end_date: '2026-01-01' }]);
      const result = await fresh().getRealizedGainsStats(db, 'Alpha');
      expect(result[0].pnl).toBe(50000);
      expect(mockDbAll.mock.calls[0][2]).toEqual(['Alpha']);
    });
    it('returns [] on error (catch)', async () => {
      mockDbAll.mockRejectedValue(new Error('no RealizedGains'));
      expect(await fresh().getRealizedGainsStats(db, 'P')).toEqual([]);
    });
  });

  describe('getRecentDriftAlerts', () => {
    it('returns [] immediately when portfolioNames is empty', async () => {
      const result = await fresh().getRecentDriftAlerts(db, []);
      expect(mockDbAll).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
    it('queries with IN placeholders for given portfolios', async () => {
      mockDbAll.mockResolvedValue([{ portfolio: 'Alpha', drift_pct: 5 }]);
      await fresh().getRecentDriftAlerts(db, ['Alpha', 'Beta']);
      expect(mockDbAll.mock.calls[0][2]).toEqual(['Alpha', 'Beta']);
    });
  });

  describe('getValuationSnapshotMeta', () => {
    it('returns count and last_ts', async () => {
      mockDbGet.mockResolvedValue({ count: 100, last_ts: '2026-11-01' });
      const result: any = await fresh().getValuationSnapshotMeta(db);
      expect(result.count).toBe(100);
    });
    it('returns undefined when no snapshots', async () => {
      mockDbGet.mockResolvedValue(undefined);
      expect(await fresh().getValuationSnapshotMeta(db)).toBeUndefined();
    });
  });

  describe('dismissDriftAlertsForPortfolios', () => {
    it('builds IN clause for given portfolios', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().dismissDriftAlertsForPortfolios(db, ['Alpha', 'Beta']);
      expect(mockDbRun.mock.calls[0][2]).toEqual(['Alpha', 'Beta']);
      expect(mockDbRun.mock.calls[0][1]).toContain('IN');
    });
  });

  describe('dismissAllDriftAlerts', () => {
    it('updates all rows without WHERE', async () => {
      mockDbRun.mockResolvedValue({});
      await fresh().dismissAllDriftAlerts(db);
      const sql = mockDbRun.mock.calls[0][1];
      expect(sql).toContain('drift_alert = NULL');
      expect(sql).not.toContain('WHERE');
    });
  });
});
