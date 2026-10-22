export enum DataSource {
  UPSTOX_API_V2 = 'UPSTOX_API_V2',
  YAHOO_FINANCE = 'YAHOO_FINANCE',
  NSE_BHAVCOPY = 'NSE_BHAVCOPY',
  SCREENER_IN = 'SCREENER_IN',
  COMPUTED_FROM_OHLCV = 'COMPUTED_FROM_OHLCV',
  FORMULA_ESTIMATE = 'FORMULA_ESTIMATE',
  POINT_IN_TIME_SNAPSHOT = 'POINT_IN_TIME_SNAPSHOT',
}

export type DataSourceUnion =
  | 'UPSTOX_API_V2'
  | 'YAHOO_FINANCE'
  | 'NSE_BHAVCOPY'
  | 'SCREENER_IN'
  | 'COMPUTED_FROM_OHLCV'
  | 'FORMULA_ESTIMATE'
  | 'POINT_IN_TIME_SNAPSHOT';

export enum NullReason {
  COLD_START_INSUFFICIENT_SAMPLE = 'COLD_START_INSUFFICIENT_SAMPLE',
  NO_RESOLVED_TRADES = 'NO_RESOLVED_TRADES',
  EXCHANGE_FEED_UNAVAILABLE = 'EXCHANGE_FEED_UNAVAILABLE',
  DELISTED_OR_SUSPENDED = 'DELISTED_OR_SUSPENDED',
  DATA_QUALITY_QUARANTINED = 'DATA_QUALITY_QUARANTINED',
}

export type NullReasonUnion =
  | 'COLD_START_INSUFFICIENT_SAMPLE'
  | 'NO_RESOLVED_TRADES'
  | 'EXCHANGE_FEED_UNAVAILABLE'
  | 'DELISTED_OR_SUSPENDED'
  | 'DATA_QUALITY_QUARANTINED';

export interface ConfidenceBand {
  lower: number;
  upper: number;
  /**
   * Confidence level expressed as a decimal fraction in [0, 1].
   * e.g. 0.95 represents a 95 % confidence interval.
   */
  level: number;
}

export interface DataPoint<T> {
  /** The resolved value, or null when the value cannot be determined. */
  value: T | null;

  /** Authoritative origin of the data. */
  source: DataSource;

  /**
   * ISO-8601 UTC timestamp at which the value was fetched or computed.
   * e.g. "2024-06-15T09:30:00.000Z"
   */
  fetchedAt: string;

  /**
   * Elapsed wall-clock hours between fetchedAt and the moment this
   * DataPoint was constructed.  Computed at creation time and treated
   * as immutable thereafter.
   */
  ageHours: number;

  /**
   * True when the value was derived via a model, formula, or interpolation
   * rather than observed directly from a primary feed.
   */
  isEstimated: boolean;

  /**
   * Populated only when value === null; describes why no value is available.
   */
  nullReason?: NullReason;

  /**
   * Optional asymmetric confidence interval around the value.
   * Meaningful only when isEstimated === true.
   */
  confidenceBand?: ConfidenceBand;

  /**
   * Deterministic hash of the inputs that produced this DataPoint.
   * Enables cheap equality checks and cache invalidation without
   * re-fetching the underlying data.
   */
  stateHash?: string;
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

/**
 * Compute elapsed hours between an ISO-8601 fetchedAt string and now.
 * Returns 0 if the timestamp is in the future (clock skew guard).
 */
function computeAgeHours(fetchedAt: string): number {
  const fetchedMs = new Date(fetchedAt).getTime();
  const nowMs = Date.now();
  const diffMs = nowMs - fetchedMs;
  return diffMs > 0 ? diffMs / (1000 * 60 * 60) : 0;
}

/**
 * Produce a lightweight deterministic hash of an arbitrary value using
 * a djb2-style algorithm over the JSON representation.
 * Not cryptographically secure; intended only for cache-key purposes.
 */
function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    // Keep within 32-bit signed integer range
    // eslint-disable-next-line no-bitwise
    hash = hash >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function buildStateHash<T>(
  value: T | null,
  source: DataSource,
  fetchedAt: string,
  isEstimated: boolean,
  nullReason?: NullReason,
): string {
  const payload = JSON.stringify({ value, source, fetchedAt, isEstimated, nullReason });
  return djb2Hash(payload);
}

// ---------------------------------------------------------------------------
// Public factory helpers
// ---------------------------------------------------------------------------

export interface CreateDataPointOptions<T> {
  value: T;
  source: DataSource;
  fetchedAt?: string;
  confidenceBand?: ConfidenceBand;
  stateHash?: string;
}

/**
 * createDataPoint — factory for a fully-resolved, non-estimated DataPoint.
 *
 * @param options.value        The observed value (must be non-null).
 * @param options.source       Authoritative data source.
 * @param options.fetchedAt    ISO-8601 UTC string; defaults to now.
 * @param options.confidenceBand  Optional confidence interval.
 * @param options.stateHash    Override auto-generated hash when needed.
 */
export function createDataPoint<T>(options: CreateDataPointOptions<T>): DataPoint<T> {
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const ageHours = computeAgeHours(fetchedAt);
  const stateHash =
    options.stateHash ??
    buildStateHash(options.value, options.source, fetchedAt, false, undefined);

  return {
    value: options.value,
    source: options.source,
    fetchedAt,
    ageHours,
    isEstimated: false,
    confidenceBand: options.confidenceBand,
    stateHash,
  };
}

export interface CreateEstimatedDataPointOptions<T> {
  value: T;
  source: DataSource;
  fetchedAt?: string;
  confidenceBand: ConfidenceBand;
  stateHash?: string;
}

/**
 * createEstimatedDataPoint — factory for a model-derived or formula-estimated
 * DataPoint.  A confidenceBand is mandatory to make the estimation uncertainty
 * explicit at the type level.
 *
 * @param options.value          The estimated value (must be non-null).
 * @param options.source         Should typically be FORMULA_ESTIMATE or
 *                               COMPUTED_FROM_OHLCV.
 * @param options.fetchedAt      ISO-8601 UTC string; defaults to now.
 * @param options.confidenceBand Required asymmetric confidence interval.
 * @param options.stateHash      Override auto-generated hash when needed.
 */
export function createEstimatedDataPoint<T>(
  options: CreateEstimatedDataPointOptions<T>,
): DataPoint<T> {
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const ageHours = computeAgeHours(fetchedAt);
  const stateHash =
    options.stateHash ??
    buildStateHash(options.value, options.source, fetchedAt, true, undefined);

  return {
    value: options.value,
    source: options.source,
    fetchedAt,
    ageHours,
    isEstimated: true,
    confidenceBand: options.confidenceBand,
    stateHash,
  };
}

export interface CreateNullDataPointOptions {
  source: DataSource;
  nullReason: NullReason;
  fetchedAt?: string;
  stateHash?: string;
}

/**
 * createNullDataPoint — factory for a DataPoint whose value is explicitly
 * absent.  The nullReason is mandatory so that every null is self-documenting
 * and traceable to a specific operational condition.
 *
 * @param options.source      Data source that attempted the fetch.
 * @param options.nullReason  Machine-readable explanation for the absence.
 * @param options.fetchedAt   ISO-8601 UTC string; defaults to now.
 * @param options.stateHash   Override auto-generated hash when needed.
 */
export function createNullDataPoint<T>(options: CreateNullDataPointOptions): DataPoint<T> {
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const ageHours = computeAgeHours(fetchedAt);
  const stateHash =
    options.stateHash ??
    buildStateHash<T>(null, options.source, fetchedAt, false, options.nullReason);

  return {
    value: null,
    source: options.source,
    fetchedAt,
    ageHours,
    isEstimated: false,
    nullReason: options.nullReason,
    stateHash,
  };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Narrows a DataPoint<T> to one whose value is guaranteed non-null.
 */
export function isResolvedDataPoint<T>(
  dp: DataPoint<T>,
): dp is DataPoint<T> & { value: T } {
  return dp.value !== null;
}

/**
 * Narrows a DataPoint<T> to one whose value is null.
 */
export function isNullDataPoint<T>(
  dp: DataPoint<T>,
): dp is DataPoint<T> & { value: null; nullReason: NullReason } {
  return dp.value === null;
}

/**
 * Returns true when the DataPoint is stale relative to a caller-supplied
 * maximum age threshold expressed in hours.
 */
export function isStaleDataPoint<T>(dp: DataPoint<T>, maxAgeHours: number): boolean {
  return dp.ageHours > maxAgeHours;
}