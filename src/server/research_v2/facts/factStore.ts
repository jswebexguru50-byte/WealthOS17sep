import type { Fact } from '../domain/types.js';
import { readFacts } from './readPolicy.js';

export interface FactConflict { metric: string; periodEnd: string; scope: string; facts: string[]; }

/** Immutable in-memory store used by the pure pipeline and fixture tests. */
export class CanonicalFactStore {
  private readonly facts: Fact[] = [];
  private readonly conflicts: FactConflict[] = [];

  add(fact: Fact): Fact {
    const prior = this.facts.filter(item => item.isin === fact.isin && item.scope === fact.scope && item.metric === fact.metric && item.periodType === fact.periodType && item.periodStart === fact.periodStart && item.periodEnd === fact.periodEnd);
    const vintage = prior.length ? Math.max(...prior.map(item => item.vintage)) + 1 : (fact.vintage || 1);
    const supersedes = prior.sort((a, b) => b.vintage - a.vintage)[0];
    const next = { ...fact, vintage, supersedesId: supersedes?.factId || fact.supersedesId };
    if (supersedes && supersedes.valueCr !== next.valueCr) this.conflicts.push({ metric: next.metric, periodEnd: next.periodEnd, scope: next.scope, facts: [supersedes.factId, next.factId] });
    this.facts.push(next);
    return next;
  }

  read(isin: string, asOf: string): Fact[] {
    const eligible = readFacts(this.facts.filter(f => f.isin === isin), asOf);
    const latest = new Map<string, Fact>();
    for (const fact of eligible) { const key = `${fact.scope}|${fact.metric}|${fact.periodType}|${fact.periodStart}|${fact.periodEnd}`; const prior = latest.get(key); if (!prior || fact.vintage > prior.vintage) latest.set(key, fact); }
    return [...latest.values()].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  }

  allConflicts(): FactConflict[] { return this.conflicts.map(c => ({ ...c, facts: [...c.facts] })); }
}
