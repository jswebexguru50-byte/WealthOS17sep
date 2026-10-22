import { describe, it, expect } from 'vitest';
import { PITEvidenceValidator } from '../../../src/server/services/audit/PITEvidenceValidator.js';

describe('V672 Track C — Point-In-Time availableAt Invariant Tests', () => {
  const validator = new PITEvidenceValidator();

  it('rejects facts where availableAt > decisionTimestamp as LOOKAHEAD', () => {
    const res = validator.validateFact({
      decisionId: 'DEC_TEST_01',
      securityId: 'INFY',
      decisionTimestamp: '2022-04-15T09:15:00Z',
      factId: 'F_01',
      factType: 'PRICE',
      factAvailableAt: '2022-04-16T09:15:00Z', // In future
      sourceId: 'NSE_OHLCV'
    });
    expect(res.valid).toBe(false);
    expect(res.status).toBe('LOOKAHEAD');
  });

  it('rejects financial facts where periodEnd < decisionTimestamp < availableAt as LOOKAHEAD', () => {
    const res = validator.validateFact({
      decisionId: 'DEC_TEST_02',
      securityId: 'TCS',
      decisionTimestamp: '2022-04-20T09:15:00Z',
      factId: 'F_02',
      factType: 'FINANCIAL_STATEMENT',
      factPeriodEnd: '2022-03-31T00:00:00Z',
      factAvailableAt: '2022-05-15T18:00:00Z', // Published in May
      sourceId: 'NSE_FILINGS'
    });
    expect(res.valid).toBe(false);
    expect(res.status).toBe('LOOKAHEAD');
  });

  it('rejects missing publication timestamps as DATA_INSUFFICIENT (zero fail-open)', () => {
    const res = validator.validateFact({
      decisionId: 'DEC_TEST_03',
      securityId: 'RELIANCE',
      decisionTimestamp: '2022-04-15T09:15:00Z',
      factId: 'F_03',
      factType: 'PRICE',
      sourceId: 'NSE_OHLCV'
      // missing factAvailableAt
    });
    expect(res.valid).toBe(false);
    expect(res.status).toBe('DATA_INSUFFICIENT');
  });
});
