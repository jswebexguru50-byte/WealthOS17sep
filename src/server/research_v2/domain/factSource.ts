import type { Fact, PeriodType, Scope } from './types.js';

/** Query for point-in-time facts. Every field except `asOf` narrows the result. */
export interface FactQuery {
  isin?: string;
  symbol?: string;
  scope?: Scope;
  /** One canonical metric name or several. */
  metric?: string | string[];
  periodTypes?: PeriodType[];
  /** ISO UTC instant. Only facts with availableAt <= asOf may be returned (datetime comparison). */
  asOf: string;
}

/**
 * Read port every calculator, scorecard and bundle builder codes against.
 * Implementations are point-in-time and ALREADY policy-filtered: not quarantined, tier not SIMULATED,
 * no NaN, no LATEST* period strings, latest vintage available at `asOf`, sorted by real period end.
 * Callers never re-apply the policy and never receive a fact the policy excludes.
 */
export interface FactSource {
  facts(query: FactQuery): Fact[];
}
