/**
 * Unit tests for ImportsRepository
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

import { ImportsRepository } from '../../src/server/services/ImportsRepository.js';

function resetSingleton() {
  // @ts-ignore
  ImportsRepository.instance = undefined;
}

function freshRepo(): ImportsRepository {
  resetSingleton();
  return ImportsRepository.getInstance();
}

describe('ImportsRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
  });

  afterEach(() => {
    resetSingleton();
  });

  describe('getInstance', () => {
    it('returns a singleton', () => {
      expect(ImportsRepository.getInstance()).toBe(ImportsRepository.getInstance());
    });
  });

  describe('getCamsConfigurations()', () => {
    it('returns all CAMS configurations ordered by PAN', async () => {
      const rows = [
        { pan: 'ABCDE1234F', email: 'a@b.com', portfolio_name: 'FundA' },
        { pan: 'XYZAB5678G', email: 'x@y.com', portfolio_name: 'FundB' },
      ];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().getCamsConfigurations({} as any);
      expect(result).toEqual(rows);
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('CamsConfigurations');
      expect(sql).toContain('ORDER BY pan ASC');
    });

    it('returns empty array when no configurations', async () => {
      mockDbAll.mockResolvedValue([]);
      expect(await freshRepo().getCamsConfigurations({} as any)).toEqual([]);
    });
  });

  describe('upsertCamsConfiguration()', () => {
    it('upserts with all provided fields and ACTIVE status', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().upsertCamsConfiguration({} as any, 'ABCDE1234F', 'user@mail.com', 'secret', 'FundAlpha');
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('INSERT INTO CamsConfigurations');
      expect(sql).toContain("'ACTIVE'");
      expect(sql).toContain('ON CONFLICT(pan)');
      expect(params).toEqual(['ABCDE1234F', 'user@mail.com', 'secret', 'FundAlpha']);
    });

    it('accepts null password (uses COALESCE to preserve existing)', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().upsertCamsConfiguration({} as any, 'ABCDE1234F', 'user@mail.com', null, 'FundAlpha');
      const [,, params] = mockDbRun.mock.calls[0];
      expect(params[2]).toBeNull();
    });
  });

  describe('deleteCamsConfiguration()', () => {
    it('deletes configuration by PAN', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().deleteCamsConfiguration({} as any, 'ABCDE1234F');
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('DELETE FROM CamsConfigurations');
      expect(sql).toContain('WHERE pan = ?');
      expect(params).toContain('ABCDE1234F');
    });

    it('resolves void on success', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await expect(freshRepo().deleteCamsConfiguration({} as any, 'X')).resolves.toBeUndefined();
    });
  });
});
