/** A source saying something is not proof that the asserted outcome happened. */
export type IntelligenceClass = 'FACT' | 'CLAIM' | 'SIGNAL';

export interface IntelligenceCandidate {
  sourceAuthority: 'NSE' | 'BSE' | 'MCA' | 'SEBI' | 'CREDIT_RATING_AGENCY' | 'COMPANY_IR' | 'NEWS' | 'SOCIAL' | 'VIDEO' | 'OTHER';
  sourceAuthenticated: boolean;
  assertionKind: 'REPORTED_RESULT' | 'OBSERVED_EVENT' | 'MANAGEMENT_TARGET' | 'ALLEGATION' | 'PUBLIC_DISCUSSION';
  speakerIdentified?: boolean;
}

export function classifyIntelligence(candidate: IntelligenceCandidate): IntelligenceClass {
  if (!candidate.sourceAuthenticated) return 'SIGNAL';
  if (candidate.assertionKind === 'MANAGEMENT_TARGET') {
    return candidate.speakerIdentified ? 'CLAIM' : 'SIGNAL';
  }
  if (candidate.assertionKind === 'ALLEGATION' || candidate.assertionKind === 'PUBLIC_DISCUSSION') {
    return 'SIGNAL';
  }
  if ((candidate.assertionKind === 'REPORTED_RESULT' || candidate.assertionKind === 'OBSERVED_EVENT') &&
      ['NSE', 'BSE', 'MCA', 'SEBI', 'CREDIT_RATING_AGENCY'].includes(candidate.sourceAuthority)) {
    return 'FACT';
  }
  return 'SIGNAL';
}

export function mayPopulateFinancialFact(candidate: IntelligenceCandidate): boolean {
  return classifyIntelligence(candidate) === 'FACT' && candidate.assertionKind === 'REPORTED_RESULT';
}
