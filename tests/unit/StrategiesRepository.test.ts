/**
 * Unit tests for StrategiesRepository
 */
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

import { StrategiesRepository } from '../../src/server/services/StrategiesRepository.js';

function resetSingleton() {
  // @ts-ignore
  StrategiesRepository.instance = undefined;
}

function freshRepo(): StrategiesRepository {
  resetSingleton();
  return StrategiesRepository.getInstance();
}

describe('StrategiesRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
  });

  afterEach(() => {
    resetSingleton();
  });

  describe('getInstance', () => {
    it('returns a singleton', () => {
      const a = StrategiesRepository.getInstance();
      const b = StrategiesRepository.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('listAll()', () => {
    it('returns all strategies from DB ordered by preset then order', async () => {
      const rows = [
        { id: '1', name: 'S1', is_preset: 1, preset_order: 1 },
        { id: '2', name: 'S2', is_preset: 0, preset_order: null },
      ];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().listAll({} as any);
      expect(result).toEqual(rows);
      expect(mockDbAll).toHaveBeenCalledOnce();
      const [, sql] = mockDbAll.mock.calls[0];
      expect(sql).toContain('ORDER BY is_preset DESC');
    });

    it('returns empty array when no strategies exist', async () => {
      mockDbAll.mockResolvedValue([]);
      const result = await freshRepo().listAll({} as any);
      expect(result).toHaveLength(0);
    });
  });

  describe('findById()', () => {
    it('returns strategy when found', async () => {
      const row = { id: 'abc', name: 'Momentum' };
      mockDbGet.mockResolvedValue(row);
      const result = await freshRepo().findById({} as any, 'abc');
      expect(result).toEqual(row);
      expect(mockDbGet).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('WHERE id = ?'), ['abc']);
    });

    it('returns undefined when not found', async () => {
      mockDbGet.mockResolvedValue(undefined);
      const result = await freshRepo().findById({} as any, 'no-such-id');
      expect(result).toBeUndefined();
    });
  });

  describe('findByNameExcluding()', () => {
    it('passes name and excludeId to query', async () => {
      mockDbGet.mockResolvedValue({ id: 'other' });
      await freshRepo().findByNameExcluding({} as any, 'Momentum', 'current-id');
      expect(mockDbGet).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('name = ? AND id != ?'),
        ['Momentum', 'current-id']
      );
    });

    it('returns undefined when no conflicting name found', async () => {
      mockDbGet.mockResolvedValue(undefined);
      const result = await freshRepo().findByNameExcluding({} as any, 'UniqueNameXYZ', 'id1');
      expect(result).toBeUndefined();
    });
  });

  describe('findByName()', () => {
    it('returns row when name exists', async () => {
      mockDbGet.mockResolvedValue({ id: 'abc' });
      const result = await freshRepo().findByName({} as any, 'VPA');
      expect(result).toEqual({ id: 'abc' });
      expect(mockDbGet).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('WHERE name = ?'), ['VPA']);
    });

    it('returns undefined when name not found', async () => {
      mockDbGet.mockResolvedValue(undefined);
      expect(await freshRepo().findByName({} as any, 'NOSUCH')).toBeUndefined();
    });
  });

  describe('update()', () => {
    it('calls dbRun with correct positional params', async () => {
      mockDbRun.mockResolvedValue(undefined);
      const repo = freshRepo();
      await repo.update({} as any, 'id1', 'New Name', 'Desc', 'MOMENTUM', '{}', '2024-01-01');
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('UPDATE CustomStrategies');
      expect(params).toContain('id1');
      expect(params).toContain('New Name');
      expect(params).toContain('2024-01-01');
    });
  });

  describe('insert()', () => {
    it('calls dbRun with all required fields and defaults', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().insert({} as any, 'newid', 'SMC', 'Smart Money', 'SMART_MONEY', '{"k":1}', 'template1', '2024-06-01');
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('INSERT INTO CustomStrategies');
      expect(params).toEqual(['newid', 'SMC', 'Smart Money', 'SMART_MONEY', '{"k":1}', 'template1', '2024-06-01', '2024-06-01']);
    });
  });

  describe('insertClone()', () => {
    it('calls dbRun with all clone fields including color_accent', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().insertClone({} as any, 'clone1', 'SMC Copy', 'SMC2', 'Clone', 'SMART_MONEY', '{}', 'base1', '#FF0000', '2024-06-01');
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('short_name');
      expect(sql).toContain('color_accent');
      expect(params).toContain('#FF0000');
    });
  });

  describe('deleteRunResults()', () => {
    it('deletes from strategy_run_results for given id', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().deleteRunResults({} as any, 'strat42');
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('strategy_run_results');
      expect(params).toContain('strat42');
    });
  });

  describe('delete()', () => {
    it('deletes from CustomStrategies for given id', async () => {
      mockDbRun.mockResolvedValue(undefined);
      await freshRepo().delete({} as any, 'strat99');
      const [, sql, params] = mockDbRun.mock.calls[0];
      expect(sql).toContain('DELETE FROM CustomStrategies');
      expect(params).toContain('strat99');
    });
  });

  describe('findByIds()', () => {
    it('builds IN placeholders and filters by is_active', async () => {
      const rows = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
      mockDbAll.mockResolvedValue(rows);
      const result = await freshRepo().findByIds({} as any, ['a', 'b']);
      const [, sql, params] = mockDbAll.mock.calls[0];
      expect(sql).toContain('IN (?,?)');
      expect(sql).toContain('is_active = 1');
      expect(params).toEqual(['a', 'b']);
      expect(result).toHaveLength(2);
    });

    it('returns empty array for empty ids list (no IN clause)', async () => {
      mockDbAll.mockResolvedValue([]);
      const result = await freshRepo().findByIds({} as any, []);
      expect(result).toEqual([]);
    });
  });
});
