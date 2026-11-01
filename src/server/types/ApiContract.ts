import type { DataSource, NullReason } from './DataPoint.js';

// ─── Core fact shape ──────────────────────────────────────────────────────────

export interface FactValue<T = unknown> {
  value: T | null;
  source: DataSource;
  fetchedAt: string;
  ageHours: number;
  isEstimated: boolean;
  nullReason?: NullReason;
  stateHash?: string;
}

export interface SymbolFacts {
  symbol: string;
  isin?: string;
  name?: string;
  exchange?: string;
  sector?: string;
  lastPrice: FactValue<number>;
  marketCap: FactValue<number>;
  peRatio: FactValue<number>;
  eps: FactValue<number>;
  bookValue: FactValue<number>;
  dividendYield: FactValue<number>;
  revenue: FactValue<number>;
  netProfit: FactValue<number>;
  debtToEquity: FactValue<number>;
  roce: FactValue<number>;
  roe: FactValue<number>;
  resolvedAt: string;
}

// ─── API response envelope ────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Endpoint-specific request / response shapes ──────────────────────────────

export interface GetFactsParams {
  symbol: string;
  forceRefresh?: boolean;
}

export interface GetFactsResponse extends ApiSuccess<SymbolFacts> {}

export interface BatchFactsRequest {
  symbols: string[];
  forceRefresh?: boolean;
}

export interface BatchFactsResponse extends ApiSuccess<SymbolFacts[]> {
  meta: {
    total: number;
    resolved: number;
    failed: number;
  };
}

// ─── Platform endpoints ───────────────────────────────────────────────────────

export type ProviderStatus = 'healthy' | 'degraded' | 'down';

export interface ProviderHealth {
  provider: string;
  status: ProviderStatus;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  lastSuccessAt?: string;
  errorRate5m?: number;
}

export interface PlatformHealthResponse extends ApiSuccess<{
  status: 'healthy' | 'degraded' | 'down';
  providers: ProviderHealth[];
  cacheHitRate: number;
  monthlyCostInr: number;
  budgetRemainingInr: number;
  featureFlags: Record<string, boolean>;
  uptimeSeconds: number;
}> {}

export interface ProvenanceEntry {
  field: string;
  source: DataSource;
  fetchedAt: string;
  ageHours: number;
  isEstimated: boolean;
}

export interface ProvenanceResponse extends ApiSuccess<{
  symbol: string;
  resolvedAt: string;
  entries: ProvenanceEntry[];
}> {}

export interface RefreshRequest {
  symbols: string[];
  providers?: string[];
}

export interface RefreshResponse extends ApiSuccess<{
  queued: string[];
  skipped: string[];
  reason?: string;
}> {}
