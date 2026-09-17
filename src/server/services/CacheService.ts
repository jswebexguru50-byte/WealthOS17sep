/**
 * CacheService.ts (P1-9)
 * Content-hash cache (`hash(symbol + period + source_url)` -> result), permanent TTL.
 * Implements Stage 1 -> Stage 2 catalyst reuse contract (§3.5).
 */

import { ExtractedInsight } from '../../../src/types.js';

export interface CacheStats {
  hits: number;
  misses: number;
  totalEntries: number;
}

export class CacheService {
  private static store: Map<string, any> = new Map();
  private static hits = 0;
  private static misses = 0;

  /**
   * Generates a deterministic key: hash(symbol + period + source_url)
   */
  public static generateKey(symbol: string, period: string, sourceUrl: string): string {
    const raw = `${symbol.trim().toUpperCase()}_${period.trim()}_${sourceUrl.trim()}`;
    // Simple 32-bit FNV-1a hash
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const hex = (hash >>> 0).toString(16).padStart(8, '0');
    return `cat_${symbol.toUpperCase()}_${hex}`;
  }

  public static get<T = any>(key: string): T | undefined {
    if (this.store.has(key)) {
      this.hits++;
      return this.store.get(key) as T;
    }
    this.misses++;
    return undefined;
  }

  public static set<T = any>(key: string, value: T): void {
    this.store.set(key, value);
  }

  public static has(key: string): boolean {
    return this.store.has(key);
  }

  public static delete(key: string): boolean {
    return this.store.delete(key);
  }

  public static clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  public static getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      totalEntries: this.store.size,
    };
  }

  /**
   * §3.5 Catalyst Reuse Contract:
   * Store and fetch catalysts for a symbol from Stage 1.
   */
  public static storeStage1Catalysts(symbol: string, catalysts: ExtractedInsight[]): void {
    const sym = symbol.toUpperCase();
    for (const cat of catalysts) {
      const key = this.generateKey(sym, cat.sourceRef.period, cat.sourceRef.sourceUrl);
      cat.cacheKey = key;
      cat.isCarriedForward = true;
      this.set(key, cat);
    }

    const indexKey = `catalyst_index_${sym}`;
    const existing = this.get<string[]>(indexKey) || [];
    const newKeys = catalysts.map((c) => c.cacheKey!);
    const merged = Array.from(new Set([...existing, ...newKeys]));
    this.set(indexKey, merged);
  }

  public static getStage1Catalysts(symbol: string): ExtractedInsight[] {
    const indexKey = `catalyst_index_${symbol.toUpperCase()}`;
    const keys = this.get<string[]>(indexKey) || [];
    const results: ExtractedInsight[] = [];

    for (const key of keys) {
      const item = this.get<ExtractedInsight>(key);
      if (item) {
        results.push({ ...item, isCarriedForward: true });
      }
    }
    return results;
  }
}
