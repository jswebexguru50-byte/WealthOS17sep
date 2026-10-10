import type { Fact } from '../domain/types.js';
import type { FactQuery, FactSource } from '../domain/factSource.js';
import {
  applyReadPolicy, factsOrThrowOnMixedScope,
  type PolicyResult, type ReadPolicyOptions,
} from './readPolicy.js';

/** A FactSource that also explains what the read policy rejected. */
export interface ExplainableFactSource extends FactSource {
  explain(query: FactQuery): PolicyResult;
}

/**
 * FactSource over an in-memory list of fact vintages (tests, fixtures, bundles). The list may hold
 * every vintage and even invalid rows; the read policy is applied on every read.
 * @throws MixedScopeError from facts() when no scope is given and an isin has both scopes.
 */
export function createInMemoryFactSource(
  allFacts: readonly Fact[], options: ReadPolicyOptions = {},
): ExplainableFactSource {
  const snapshot = allFacts.map((fact) => ({ ...fact, qualityFlags: [...fact.qualityFlags] }));
  return {
    facts(query: FactQuery): Fact[] {
      return factsOrThrowOnMixedScope(applyReadPolicy(snapshot, query, options), snapshot);
    },
    explain(query: FactQuery): PolicyResult {
      return applyReadPolicy(snapshot, query, options);
    },
  };
}
