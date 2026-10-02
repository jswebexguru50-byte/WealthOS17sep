/**
 * CanonicalFactSelector.ts
 *
 * Single authority for company_facts eligibility filtering.
 *
 * Eligibility rules (applied identically across all callers):
 * 1. verificationStatus must be an explicit approved value.
 *    Admitted:  'VERIFIED' | 'VERIFIED_PARTIAL' | 'PENDING_REVIEW' (read-only observation only)
 *    Excluded:  NULL, REJECTED, AMBIGUOUS, CONFLICTING, or any other value.
 * 2. scope must be in the caller-supplied allowlist (default: CONSOLIDATED, STANDALONE, UNKNOWN).
 * 3. periodType must be in the caller-supplied allowlist (default: ANNUAL, QUARTERLY, TTM).
 * 4. If a pointInTime date is supplied (or defaulted), only facts with availableAt <= pointInTime are admitted.
 *    Facts with NULL availableAt fail closed as MISSING_AVAILABLE_AT and are excluded from analytical use.
 *
 * No fact may be inferred, defaulted, or estimated when eligibility criteria are not met.
 * Callers receive null + a FactLookupResult.status indicating why.
 */

/** Fact status values admitted as analytically usable */
export const ADMITTED_STATUSES = new Set(['VERIFIED', 'VERIFIED_PARTIAL']);

/** Scope values supported for analytical use */
export const SUPPORTED_SCOPES = new Set(['CONSOLIDATED', 'STANDALONE', 'UNKNOWN']);

/** Period types supported for analytical use */
export const SUPPORTED_PERIOD_TYPES = new Set(['ANNUAL', 'QUARTERLY', 'TTM', 'LTM', 'POINT_IN_TIME']);

export type FactEligibilityStatus =
  | 'ELIGIBLE'
  | 'NULL_VERIFICATION_STATUS'
  | 'REJECTED'
  | 'AMBIGUOUS'
  | 'PENDING_REVIEW'
  | 'UNSUPPORTED_SCOPE'
  | 'UNSUPPORTED_PERIOD_TYPE'
  | 'MISSING_AVAILABLE_AT'
  | 'POST_POINT_IN_TIME'
  | 'DATA_INSUFFICIENT';

export interface CanonicalFactRow {
  factId: string;
  symbol: string;
  metric: string;
  value: number | string | null;
  unit?: string | null;
  periodType?: string | null;
  periodEnd?: string | null;
  periodStart?: string | null;
  scope?: string | null;
  provider?: string | null;
  sourceType?: string | null;
  verificationStatus?: string | null;
  sourceDocumentId?: string | null;
  fetchedAt?: string | null;
  availableAt?: string | null;
  reportedAt?: string | null;
  asOfDate?: string | null;
}

export interface FactLookupResult {
  row: CanonicalFactRow | null;
  eligibilityStatus: FactEligibilityStatus;
  /** Parsed numeric value — null if ineligible or non-numeric */
  numericValue: number | null;
  /** The persisted fetchedAt from the row — never the evaluation timestamp */
  persistedFetchedAt: string | null;
  /** The persisted availableAt from the row */
  persistedAvailableAt: string | null;
  /** The persisted periodEnd from the row */
  periodEnd: string | null;
  /** The persisted periodStart from the row */
  periodStart: string | null;
  /** The persisted periodType from the row */
  periodType: string | null;
  /** Provider from the row */
  provider: string | null;
  /** sourceDocumentId from the row */
  sourceDocumentId: string | null;
  /** Scope from the row */
  scope: string | null;
}

export interface FactSelectorOptions {
  /** Only admit facts available at or before this ISO-8601 timestamp (point-in-time gate). */
  pointInTime?: string | null;
  /** Override supported scope allowlist. */
  scopeAllowlist?: Set<string>;
  /** Override supported periodType allowlist. */
  periodTypeAllowlist?: Set<string>;
  /** If true, include PENDING_REVIEW as admitted (default: false — non-analytic diagnostic callers only). */
  includePendingReview?: boolean;
}

/**
 * Assess a single raw company_facts row for analytical eligibility.
 * Returns a FactLookupResult with all persisted provenance fields.
 * Never substitutes evaluation timestamp for persisted timestamps.
 */
export function assessFactEligibility(
  row: CanonicalFactRow,
  opts?: FactSelectorOptions
): FactLookupResult {
  const scopeAllowlist = opts?.scopeAllowlist ?? SUPPORTED_SCOPES;
  const periodTypeAllowlist = opts?.periodTypeAllowlist ?? SUPPORTED_PERIOD_TYPES;
  const includePending = opts?.includePendingReview === true;

  const admitted = includePending
    ? new Set(['VERIFIED', 'VERIFIED_PARTIAL', 'PENDING_REVIEW'])
    : ADMITTED_STATUSES;

  const base: Omit<FactLookupResult, 'eligibilityStatus' | 'numericValue'> = {
    row,
    persistedFetchedAt: row.fetchedAt || null,
    persistedAvailableAt: row.availableAt || null,
    periodEnd: row.periodEnd || null,
    periodStart: row.periodStart || null,
    periodType: row.periodType || null,
    provider: row.provider || null,
    sourceDocumentId: row.sourceDocumentId || null,
    scope: row.scope || null,
  };

  // Rule 1: verificationStatus must be explicit and admitted
  const vs = row.verificationStatus;
  if (vs === null || vs === undefined || (typeof vs === 'string' && vs.trim() === '')) {
    return { ...base, eligibilityStatus: 'NULL_VERIFICATION_STATUS', numericValue: null };
  }
  if (vs === 'PENDING_REVIEW' && !includePending) {
    return { ...base, eligibilityStatus: 'PENDING_REVIEW', numericValue: null };
  }
  if (vs === 'REJECTED') {
    return { ...base, eligibilityStatus: 'REJECTED', numericValue: null };
  }
  if (vs === 'AMBIGUOUS' || vs === 'CONFLICTING') {
    return { ...base, eligibilityStatus: 'AMBIGUOUS', numericValue: null };
  }
  if (!admitted.has(vs)) {
    return { ...base, eligibilityStatus: 'REJECTED', numericValue: null };
  }

  // Rule 1b: Provenance completeness — facts without any persisted provenance timestamp cannot be VERIFIED
  const hasPersistedTimestamp = Boolean(row.availableAt || row.reportedAt || row.asOfDate || row.fetchedAt);
  if (!hasPersistedTimestamp && vs === 'VERIFIED') {
    return { ...base, eligibilityStatus: 'DATA_INSUFFICIENT', numericValue: null };
  }

  // Rule 2: scope must be supported
  if (row.scope && !scopeAllowlist.has(row.scope)) {
    return { ...base, eligibilityStatus: 'UNSUPPORTED_SCOPE', numericValue: null };
  }

  // Rule 3: periodType must be supported
  if (row.periodType && !periodTypeAllowlist.has(row.periodType)) {
    return { ...base, eligibilityStatus: 'UNSUPPORTED_PERIOD_TYPE', numericValue: null };
  }

  // Rule 4: point-in-time gate — availableAt must be <= pointInTime.
  // Facts with NULL availableAt fail closed as MISSING_AVAILABLE_AT and cannot pass point-in-time evaluation.
  if (opts?.pointInTime) {
    if (!row.availableAt) {
      return { ...base, eligibilityStatus: 'MISSING_AVAILABLE_AT', numericValue: null };
    }
    if (row.availableAt > opts.pointInTime) {
      return { ...base, eligibilityStatus: 'POST_POINT_IN_TIME', numericValue: null };
    }
  }

  // Eligible — parse numeric value
  const rawVal = row.value;
  let numericValue: number | null = null;
  if (typeof rawVal === 'number' && !isNaN(rawVal)) {
    numericValue = rawVal;
  } else if (typeof rawVal === 'string') {
    const parsed = parseFloat(rawVal);
    numericValue = isNaN(parsed) ? null : parsed;
  }

  return { ...base, eligibilityStatus: 'ELIGIBLE', numericValue };
}

/**
 * Helper to build a queryAll-compatible WHERE clause snippet for eligibility.
 * Produces the verificationStatus filter only — callers add metric/symbol clauses.
 *
 * Returns SQL fragment (no leading AND):
 *   verificationStatus IN ('VERIFIED', 'VERIFIED_PARTIAL') [default]
 *   verificationStatus IN ('VERIFIED', 'VERIFIED_PARTIAL', 'PENDING_REVIEW') [diagnostic only]
 */
export function eligibilityWhereClause(includePendingReview = false): string {
  const statuses = includePendingReview
    ? `'VERIFIED', 'VERIFIED_PARTIAL', 'PENDING_REVIEW'`
    : `'VERIFIED', 'VERIFIED_PARTIAL'`;
  return `verificationStatus IN (${statuses})`;
}

/**
 * Select the best eligible fact for a given symbol+metric from a pre-fetched
 * array of rows (most-recent periodEnd first).
 *
 * Returns DATA_INSUFFICIENT if no row passes eligibility.
 */
export function selectBestFact(
  rows: CanonicalFactRow[],
  opts?: FactSelectorOptions
): FactLookupResult {
  for (const row of rows) {
    const result = assessFactEligibility(row, opts);
    if (result.eligibilityStatus === 'ELIGIBLE') {
      return result;
    }
  }
  return {
    row: null,
    eligibilityStatus: 'DATA_INSUFFICIENT',
    numericValue: null,
    persistedFetchedAt: null,
    persistedAvailableAt: null,
    periodEnd: null,
    periodStart: null,
    periodType: null,
    provider: null,
    sourceDocumentId: null,
    scope: null,
  };
}
