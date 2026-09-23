import { describe, expect, it } from 'vitest';
import { classifyIntelligence, mayPopulateFinancialFact } from '../../src/server/intelligence/services/IntelligenceClassification';

describe('FERE fact / claim / signal boundary', () => {
  it('keeps an authenticated management revenue target as a claim, not a financial fact', () => {
    const target = {
      sourceAuthority: 'NSE' as const, sourceAuthenticated: true,
      assertionKind: 'MANAGEMENT_TARGET' as const, speakerIdentified: true,
    };
    expect(classifyIntelligence(target)).toBe('CLAIM');
    expect(mayPopulateFinancialFact(target)).toBe(false);
  });

  it('keeps an unverified social-media statement as a signal', () => {
    const rumour = {
      sourceAuthority: 'SOCIAL' as const, sourceAuthenticated: false,
      assertionKind: 'ALLEGATION' as const,
    };
    expect(classifyIntelligence(rumour)).toBe('SIGNAL');
    expect(mayPopulateFinancialFact(rumour)).toBe(false);
  });

  it('only promotes an authenticated official reported result to a financial fact', () => {
    const filing = {
      sourceAuthority: 'NSE' as const, sourceAuthenticated: true,
      assertionKind: 'REPORTED_RESULT' as const,
    };
    expect(classifyIntelligence(filing)).toBe('FACT');
    expect(mayPopulateFinancialFact(filing)).toBe(true);
    expect(mayPopulateFinancialFact({ ...filing, sourceAuthenticated: false })).toBe(false);
  });
});
