/**
 * Unit tests for SystemRepository
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockDbAll, mockDbRun } = vi.hoisted(() => ({
  mockDbAll: vi.fn(),
  mockDbRun: vi.fn(),
}));

vi.mock('../../src/server/database.js', () => ({
  getDB: () => ({}),
  dbAll: mockDbAll,
  dbGet: vi.fn(),
  dbRun: mockDbRun,
}));

import { SystemRepository } from '../../src/server/services/SystemRepository.js';

function resetSingleton() {
  // @ts-ignore
  SystemRepository.instance = undefined;
}

function freshRepo(): SystemRepository {
  resetSingleton();
  return SystemRepository.getInstance();
}

describe('SystemRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
  });

  afterEach(() => {
    resetSingleton();
  });

  describe('getInstance', () => {
    it('returns a singleton', () => {
      expect(SystemRepository.getInstance()).toBe(SystemRepository.getInstance());
    });
  });

  describe('getChangeLogs()', () => {
    it('returns change logs ordered by timestamp DESC limited to 100', async () => {
      const rows = [{ id: 1, version_tag: 'v1.2.3', summary: 'Fixed bug' }];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().getChangeLogs({} as any);
      expect(result).toEqual(rows);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('AppChangeLogs');
      expect(sql).toContain('ORDER BY timestamp DESC');
      expect(sql).toContain('LIMIT 100');
    });

    it('returns empty array when no logs', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getChangeLogs({} as any)).toEqual([]);
    });
  });

  describe('insertChangeLog()', () => {
    it('inserts with version_tag, summary, and file_count', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().insertChangeLog({} as any, 'v2.0.0', 'Major refactor', 42);
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('INSERT INTO AppChangeLogs');
      expect(params).toEqual(['v2.0.0', 'Major refactor', 42]);
    });

    it('resolves void on success', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await expect(freshRepo().insertChangeLog({} as any, 'v1.0.0', 'Init', 1)).resolves.toBeUndefined();
    });
  });

  describe('getSystemLogs()', () => {
    it('passes limit to LIMIT clause', async () => {
      const rows = [{ id: 1, message: 'Server started' }];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().getSystemLogs({} as any, 50);
      expect(result).toEqual(rows);
      const [, sql, params] = mockDbAll.mock.calls[0];
      expect(sql).toContain('SystemLogs');
      expect(sql).toContain('ORDER BY timestamp DESC');
      expect(params).toContain(50);
    });

    it('returns empty array when no system logs', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getSystemLogs({} as any, 10)).toEqual([]);
    });
  });

  describe('getActionHistory()', () => {
    it('returns action history ordered DESC limited to 200', async () => {
      const rows = [{ id: 1, action: 'REBALANCE' }, { id: 2, action: 'SIGNAL' }];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().getActionHistory({} as any);
      expect(result).toEqual(rows);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('ActionHistory');
      expect(sql).toContain('ORDER BY timestamp DESC');
      expect(sql).toContain('LIMIT 200');
    });
  });
});
