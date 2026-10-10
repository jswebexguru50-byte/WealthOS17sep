import { hashCanonicalUrl } from './urlTools.js';

/** Per-scrip effort caps for independent research. */
export interface ResearchCaps {
  maxSearches: number;
  maxFetches: number;
}

export const DEFAULT_RESEARCH_CAPS: Readonly<ResearchCaps> = Object.freeze({ maxSearches: 12, maxFetches: 15 });

export type CapErrorCode = 'SEARCH_CAP_EXCEEDED' | 'FETCH_CAP_EXCEEDED';

/** Thrown when a search or fetch would exceed the per-scrip cap; the counter is not incremented. */
export class ResearchCapError extends Error {
  constructor(public readonly code: CapErrorCode, public readonly symbol: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'ResearchCapError';
  }
}

export interface BudgetSnapshot {
  symbol: string;
  searches: number;
  fetches: number;
  searchesRemaining: number;
  fetchesRemaining: number;
}

function assertCap(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

/** Counter object enforcing the search and fetch caps of one scrip. */
export class ResearchBudget {
  private searches = 0;
  private fetches = 0;

  constructor(readonly symbol: string, readonly caps: ResearchCaps = DEFAULT_RESEARCH_CAPS) {
    assertCap('maxSearches', caps.maxSearches);
    assertCap('maxFetches', caps.maxFetches);
  }

  /** Records `count` searches. @throws ResearchCapError when the cap would be exceeded. */
  chargeSearch(count = 1): void {
    if (this.searches + count > this.caps.maxSearches) {
      throw new ResearchCapError(
        'SEARCH_CAP_EXCEEDED',
        this.symbol,
        `${this.symbol}: ${this.searches}+${count} exceeds ${this.caps.maxSearches} searches`,
      );
    }
    this.searches += count;
  }

  /** Records `count` fetches. @throws ResearchCapError when the cap would be exceeded. */
  chargeFetch(count = 1): void {
    if (this.fetches + count > this.caps.maxFetches) {
      throw new ResearchCapError(
        'FETCH_CAP_EXCEEDED',
        this.symbol,
        `${this.symbol}: ${this.fetches}+${count} exceeds ${this.caps.maxFetches} fetches`,
      );
    }
    this.fetches += count;
  }

  /** The cap that charging these amounts would break, or null when both fit. Nothing is recorded. */
  wouldExceed(searches: number, fetches: number): CapErrorCode | null {
    if (this.searches + searches > this.caps.maxSearches) return 'SEARCH_CAP_EXCEEDED';
    if (this.fetches + fetches > this.caps.maxFetches) return 'FETCH_CAP_EXCEEDED';
    return null;
  }

  snapshot(): BudgetSnapshot {
    return {
      symbol: this.symbol,
      searches: this.searches,
      fetches: this.fetches,
      searchesRemaining: this.caps.maxSearches - this.searches,
      fetchesRemaining: this.caps.maxFetches - this.fetches,
    };
  }
}

/** One budget per scrip, created on first use with the shared caps. */
export class ResearchBudgets {
  private readonly bySymbol = new Map<string, ResearchBudget>();

  constructor(private readonly caps: ResearchCaps = DEFAULT_RESEARCH_CAPS) {}

  forSymbol(symbol: string): ResearchBudget {
    const key = symbol.trim().toUpperCase();
    let budget = this.bySymbol.get(key);
    if (budget === undefined) {
      budget = new ResearchBudget(key, this.caps);
      this.bySymbol.set(key, budget);
    }
    return budget;
  }
}

/** Cache of fetched content keyed by the hash of the canonical URL (a cache hit costs no fetch). */
export class UrlCache<T> {
  private readonly entries = new Map<string, T>();

  get(canonicalUrl: string): T | undefined {
    return this.entries.get(hashCanonicalUrl(canonicalUrl));
  }

  set(canonicalUrl: string, value: T): void {
    this.entries.set(hashCanonicalUrl(canonicalUrl), value);
  }

  has(canonicalUrl: string): boolean {
    return this.entries.has(hashCanonicalUrl(canonicalUrl));
  }

  get size(): number {
    return this.entries.size;
  }
}
