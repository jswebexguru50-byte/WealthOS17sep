import { CircuitBreaker } from './CircuitBreaker.js';
import { withRetry } from './RetryHandler.js';
import { MultiLayerCache } from './MultiLayerCache.js';
import { obs } from './ObservabilityHub.js';

export interface FetchProvider<T> { name: string; fetch(symbol: string, dataClass: string): Promise<T | null>; }
export interface MultiLayerFetchResult<T> { data: T; source: string; fetchedAt: string; fallbackCount: number; }

/** Central provider waterfall with single-flight and cache reuse. */
export class MultiLayerFetcher<T = unknown> {
  private readonly inflight = new Map<string, Promise<MultiLayerFetchResult<T>>>();
  constructor(private readonly providers: FetchProvider<T>[], private readonly cache = MultiLayerCache.getInstance()) {}
  async fetch(symbol: string, dataClass: string): Promise<MultiLayerFetchResult<T>> {
    const normalized = symbol.trim().toUpperCase();
    const key = `${dataClass}:${normalized}`;
    const cached = this.cache.get<MultiLayerFetchResult<T>>(dataClass, normalized);
    if (cached) return cached;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const operation = this.resolve(normalized, dataClass).finally(() => this.inflight.delete(key));
    this.inflight.set(key, operation);
    return operation;
  }
  private async resolve(symbol: string, dataClass: string): Promise<MultiLayerFetchResult<T>> {
    const failures: string[] = [];
    for (const provider of this.providers) {
      try {
        const breaker = CircuitBreaker.for(`fetcher:${provider.name}`);
        const data = await breaker.execute(() => withRetry(() => provider.fetch(symbol, dataClass), { maxAttempts: 2, baseDelayMs: 25, maxDelayMs: 250 }, `${provider.name}:${dataClass}`));
        if (data === null || data === undefined) throw new Error('empty provider response');
        const result = { data, source: provider.name, fetchedAt: new Date().toISOString(), fallbackCount: failures.length };
        this.cache.set(dataClass, symbol, result, provider.name);
        obs.increment('fetcher.success', { provider: provider.name, dataClass });
        return result;
      } catch (error: any) {
        failures.push(`${provider.name}:${error?.message ?? 'failed'}`);
        obs.increment('fetcher.fallback', { provider: provider.name, dataClass });
      }
    }
    throw new Error(`ALL_PROVIDERS_FAILED:${symbol}:${dataClass}:${failures.join('|')}`);
  }
}
