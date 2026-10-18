import { validateBatchBody, batchFetch } from '../../src/server/routes/trendlyneMcp.js';

describe('trendlyneMcp route helpers', () => {
  it('validates input', () => {
    expect(typeof validateBatchBody({ symbols: [], fields: ['a'] })).toBe('string');
    expect(typeof validateBatchBody({ symbols: Array(51).fill('A'), fields: ['a'] })).toBe('string');
    expect(typeof validateBatchBody({ symbols: ['A;B'], fields: ['a'] })).toBe('string');
    expect(validateBatchBody({ symbols: ['tcs', 'TCS'], fields: ['pettm'] })).toEqual({ symbols: ['TCS'], fields: ['pettm'] });
  });
  it('isolates per-symbol errors', async () => {
    const client = {
      getMaxScrips: () => 2,
      getStockParameterValues: async (codes: string[]) => {
        if (codes.includes('BAD')) throw new Error('boom');
        return { data: Object.fromEntries(codes.map(c => [c, { pettm: 10 }])) };
      },
    };
    const r = await batchFetch(client, ['A', 'BAD', 'C'], ['pettm', 'roea']);
    expect(r.errors.BAD).toBe('boom');
    expect(r.data.A.pettm?.source).toBe('trendlyne_mcp');
    expect(r.data.C.roea).toBeNull();
  });
});
