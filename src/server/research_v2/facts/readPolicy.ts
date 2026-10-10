import type { Fact } from '../domain/types.js';
export function eligibleFact(fact: Fact, asOf: string): boolean {
  return !fact.quarantined && fact.valueCr !== null && Number.isFinite(fact.valueCr) && fact.sourceTier !== 'SIMULATED' && !/^LATEST/i.test(fact.periodType) && fact.availableAt <= asOf && !fact.qualityFlags.includes('PERIOD_RECON_FAIL');
}
export function readFacts(facts: Fact[], asOf: string): Fact[] { return facts.filter(f => eligibleFact(f, asOf)).sort((a,b) => a.periodEnd.localeCompare(b.periodEnd)); }
