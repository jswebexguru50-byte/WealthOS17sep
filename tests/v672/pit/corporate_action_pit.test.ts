import { describe, it, expect } from 'vitest';
import { PITEvidenceValidator } from '../../../src/server/services/audit/PITEvidenceValidator.js';

describe('V672 Track C — Corporate Action PIT Invariant Tests', () => {
  const validator = new PITEvidenceValidator();

  it('rejects post-dated corporate actions before official ex-date announcement', () => {
    const res = validator.validateFact({
      decisionId: 'DEC_BONUS_01',
      securityId: 'WIPRO',
      decisionTimestamp: '2022-01-10T15:30:00Z',
      factId: 'BONUS_EX_DATE',
      factType: 'CORPORATE_ACTION',
      factAvailableAt: '2022-01-20T09:15:00Z',
      sourceId: 'NSE_CORPORATE_FEED'
    });
    expect(res.valid).toBe(false);
    expect(res.status).toBe('LOOKAHEAD');
  });
});
