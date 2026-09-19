import { describe, it, expect } from 'vitest';
import { PITEvidenceValidator } from '../../../src/server/services/audit/PITEvidenceValidator.js';

describe('V672-R1 — Point-In-Time availableAt Lookahead Violation Assertions', () => {
  const validator = new PITEvidenceValidator();

  it('rejects facts where availableAt > decisionTimestamp with LOOKAHEAD', () => {
    const res = validator.validateFact({
      decisionId: 'DEC_TEST_LOOKAHEAD_1',
      securityId: 'RELIANCE',
      decisionTimestamp: '2024-04-15T09:15:00Z',
      factId: 'FACT_FUTURE_PRICE',
      factType: 'PRICE',
      factAvailableAt: '2024-04-15T15:30:00Z', // Released after decision
      sourceId: 'NSE_EOD'
    });

    expect(res.valid).toBe(false);
    expect(res.status).toBe('LOOKAHEAD');
  });

  it('rejects financial statements where periodEnd < decisionDate < availableAt', () => {
    const res = validator.validateFact({
      decisionId: 'DEC_TEST_LOOKAHEAD_2',
      securityId: 'INFY',
      decisionTimestamp: '2025-04-15T09:15:00Z',
      factId: 'FACT_FINANCIAL_Q4',
      factType: 'FINANCIAL_STATEMENT',
      factPeriodEnd: '2025-03-31T00:00:00Z',
      factAvailableAt: '2025-05-20T18:00:00Z', // Released in May, decision in April
      sourceId: 'BSE_FILINGS'
    });

    expect(res.valid).toBe(false);
    expect(res.status).toBe('LOOKAHEAD');
  });

  it('fails closed when availableAt is missing or blank', () => {
    const res = validator.validateFact({
      decisionId: 'DEC_TEST_MISSING',
      securityId: 'TCS',
      decisionTimestamp: '2024-04-15T09:15:00Z',
      factId: 'FACT_NO_TIMESTAMP',
      factType: 'PRICE',
      factAvailableAt: '',
      sourceId: 'NSE'
    });

    expect(res.valid).toBe(false);
    expect(res.status).toBe('DATA_INSUFFICIENT');
  });
});
