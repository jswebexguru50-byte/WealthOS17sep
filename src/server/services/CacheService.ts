/**
 * CacheService.ts (P1-9)
 * Content-hash cache (`hash(symbol + period + source_url)` -> result), permanent TTL.
 * Implements Stage 1 -> Stage 2 catalyst reuse contract (§3.5).
 * Extended with instance methods for evidence caching (P2-29Q).
 */

import { ExtractedInsight } from '../../../src/types.js';

export interface CacheStats {
  hits: number;
  misses: number;
  totalEntries: number;
}

export interface CachedEvidence {
  urls: string[];
  timestamp: string;
  expiry_time?: string;
  is_stale?: boolean;
  confidence?: number;
}

export class CacheService {
  private static store: Map<string, any> = new Map();
  private static hits = 0;
  private static misses = 0;

  // Instance store for evidence caching
  private instanceStore: Map<string, { data: any; expiry: number }> = new Map();
  private static instance: CacheService;

  /**
   * Get singleton instance (for evidence caching)
   */
  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

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

  /**
   * Instance methods for evidence caching (P2-29Q)
   */
  public set(key: string, data: any, ttlSeconds: number): void {
    const expiry = Date.now() + ttlSeconds * 1000;
    this.instanceStore.set(key, { data, expiry });
  }

  public get(key: string): CachedEvidence | null {
    const entry = this.instanceStore.get(key);
    if (!entry) return null;

    if (entry.expiry < Date.now()) {
      this.instanceStore.delete(key);
      return null;
    }

    return entry.data as CachedEvidence;
  }

  public has(key: string): boolean {
    const entry = this.instanceStore.get(key);
    if (!entry) return false;
    if (entry.expiry < Date.now()) {
      this.instanceStore.delete(key);
      return false;
    }
    return true;
  }

  public delete(key: string): boolean {
    return this.instanceStore.delete(key);
  }

  public clear(): void {
    this.instanceStore.clear();
  }

  public getAll(): Map<string, CachedEvidence> {
    const result = new Map<string, CachedEvidence>();
    for (const [key, entry] of this.instanceStore.entries()) {
      if (entry.expiry > Date.now()) {
        result.set(key, entry.data as CachedEvidence);
      }
    }
    return result;
  }
}
