import { ResearchBudget, UrlCache } from './budget.js';
import type { DocumentKind, ResearchTier } from './researchItems.js';
import type { ResearchItemStore, SubmitResult } from './store.js';
import { canonicalizeUrl } from './urlTools.js';

/** One hit returned by a search; a lead to fetch, never evidence by itself. */
export interface ResearchSearchHit {
  url: string;
  title?: string;
  publisher?: string;
  publishedAt?: string | null;
  snippet?: string;
}

/** A fetched document reduced to the text relevant for an excerpt. */
export interface FetchedPage {
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  retrievedAt: string;
  /** Exact text excerpt to store; must not be paraphrased. */
  text: string;
  documentKind?: DocumentKind;
  tier?: ResearchTier;
}

/** Pluggable access to the web. The program ships no crawler; implementations are supplied by the caller. */
export interface ResearchFetcher {
  readonly name: string;
  search(query: string): Promise<ResearchSearchHit[]>;
  fetch(url: string): Promise<FetchedPage>;
}

export interface FetchRequest {
  url: string;
  subQuestionIds: string[];
  /** Primary item (id or URL) that confirms this page, when known. */
  tracedTo?: string;
}

export interface ResearchSessionDeps {
  symbol: string;
  fetcher: ResearchFetcher;
  store: ResearchItemStore;
  budget: ResearchBudget;
  cache?: UrlCache<FetchedPage>;
}

/**
 * One scrip's research session: every search and every network fetch is charged to the budget, a URL already stored
 * or cached costs nothing, and every fetched page goes through the item protocol before it is kept.
 */
export class ResearchSession {
  private readonly cache: UrlCache<FetchedPage>;

  constructor(private readonly deps: ResearchSessionDeps) {
    this.cache = deps.cache ?? new UrlCache<FetchedPage>();
  }

  /** @throws ResearchCapError when the search cap is reached. */
  async search(query: string): Promise<ResearchSearchHit[]> {
    this.deps.budget.chargeSearch();
    return this.deps.fetcher.search(query);
  }

  /**
   * Fetches a page (unless stored or cached) and submits it as an item.
   * @throws ResearchCapError when the fetch cap is reached; the page is then not fetched.
   */
  async fetchAndStore(request: FetchRequest): Promise<SubmitResult> {
    const { symbol, store, budget, fetcher } = this.deps;
    const canonical = canonicalizeUrl(request.url);
    if (canonical === null) {
      return { outcome: 'INVALID', errors: ['url must be an http(s) URL'], reason: 'invalid url', notes: [] };
    }
    const stored = store.getByUrl(symbol, canonical);
    if (stored !== undefined) {
      return {
        outcome: 'DUPLICATE_URL',
        item: stored,
        duplicateOf: stored.itemId,
        notes: ['store hit'],
        reason: 'already stored',
      };
    }
    let page = this.cache.get(canonical);
    if (page === undefined) {
      budget.chargeFetch();
      page = await fetcher.fetch(canonical);
      this.cache.set(canonical, page);
    }
    return store.submit({
      symbol,
      tier: page.tier ?? 'SECONDARY',
      url: page.url || canonical,
      title: page.title,
      publisher: page.publisher,
      publishedAt: page.publishedAt,
      retrievedAt: page.retrievedAt,
      excerpt: page.text,
      subQuestionIds: request.subQuestionIds,
      ...(page.documentKind === undefined ? {} : { documentKind: page.documentKind }),
      ...(request.tracedTo === undefined ? {} : { tracedTo: request.tracedTo }),
    });
  }
}
