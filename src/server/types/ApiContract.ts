// ApiContract.ts — versioned API response schema (Gap 10)

export interface DataMeta {
  source: string;       // provider name or 'cache'
  ts: string;           // ISO timestamp when data was fetched/cached
  ttlS?: number;        // remaining TTL in seconds if cached
  provider?: string;    // PROVIDER enum value
  cached: boolean;
}

export interface ApiResponse<T> {
  ok: boolean;
  data: T | null;
  meta: DataMeta;
  error?: string;
}

export function ok<T>(data: T, meta: Partial<DataMeta> & { source: string }): ApiResponse<T> {
  return {
    ok: true,
    data,
    meta: {
      ts: new Date().toISOString(),
      cached: false,
      ...meta,
    },
  };
}

export function err(message: string, source: string): ApiResponse<null> {
  return {
    ok: false,
    data: null,
    error: message,
    meta: { source, ts: new Date().toISOString(), cached: false },
  };
}
