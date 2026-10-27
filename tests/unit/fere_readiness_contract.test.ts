import { describe, expect, it } from 'vitest';
import { buildReadiness } from '../../scripts/fundamental/fere_symbol_readiness';

describe('FERE 360 readiness contract', () => {
  it('rejects an empty symbol instead of inventing an identity', () => {
    expect(() => buildReadiness('')).toThrow('SYMBOL_REQUIRED');
  });

  it('returns independent gates for every 360 consumer', () => {
    const result = buildReadiness('__UNKNOWN_TEST_SYMBOL__');
    expect(result.status).toBe('MISSING');
    expect(Object.keys(result.requirements).sort()).toEqual([
      '29Q', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'ITAS', 'technical',
    ]);
    for (const gate of Object.values(result.requirements)) {
      expect(typeof gate.ready).toBe('boolean');
      expect(Array.isArray(gate.missing)).toBe(true);
    }
  });

  it('does not infer one gate from another', () => {
    const result = buildReadiness('__UNKNOWN_TEST_SYMBOL__');
    expect(result.requirements.F1).not.toBe(result.requirements.F2);
    expect(result.requirements.F1.missing).toContain('revenue');
    expect(result.requirements.F2.missing).toContain('operating_profit');
    expect(result.requirements.technical.missing).toContain('OHLCV');
  });
});
