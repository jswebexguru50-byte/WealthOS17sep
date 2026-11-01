/**
 * UnifiedDataResolver
 *
 * Read-only facade for all canonical data consumers:
 * F1-F7 filters, Seven-strategy scans, 29Q dossiers, ITAS, and reports.
 *
 * Rules:
 *   - NEVER fetches from a provider or calls dbRun/dbAll directly.
 *   - NEVER throws to caller — returns null / [] on any miss or error.
 *   - Delegates to FactsRepository (DB reads) and BatchFundamentalProvider
 *     (fundamental data with single-flight dedup + circuit breaker).
 *   - Every call emits an obs counter for observability.
 *
 * Usage:
 *   import { UnifiedDataResolver } from './UnifiedDataResolver.js';
 *   const resolver = UnifiedDataResolver.getInstance();
 *   const snap = await resolver.getFundamentals('INFY');
 */

import type { FundamentalSnapshot } from './FundamentalDataService.js';
import {
  FactsRepository,
  type Ticker,
  type Holding,
  type CustomStrategy,
  type CorporateAction,
} from './FactsRepository.js';
import { BatchFundamentalProvider } from './BatchFundamentalProvider.js';
import { obs } from './ObservabilityHub.js';

export class UnifiedDataResolver {
  private static instance: UnifiedDataResolver;
  private repo = FactsRepository.getInstance();
  private fundamentals = BatchFundamentalProvider.getInstance();

  static getInstance(): UnifiedDataResolver {
    if (!UnifiedDataResolver.instance) {
      UnifiedDataResolver.instance = new UnifiedDataResolver();
    }
    return UnifiedDataResolver.instance;
  }

  /** Fundamental snapshot for one symbol via BatchFundamentalProvider. */
  async getFundamentals(symbol: string): Promise<FundamentalSnapshot | null> {
    try {
      const result = await this.fundamentals.get(symbol);
      obs.increment(result ? 'resolver.hit' : 'resolver.miss', { method: 'getFundamentals' });
      return result;
    } catch {
      obs.increment('resolver.miss', { method: 'getFundamentals' });
      return null;
    }
  }

  /** Ticker metadata by symbol or ISIN. */
  async getTicker(symbolOrIsin: string): Promise<Ticker | null> {
    try {
      const result = await this.repo.getTicker(symbolOrIsin);
      obs.increment(result ? 'resolver.hit' : 'resolver.miss', { method: 'getTicker' });
      return result;
    } catch {
      obs.increment('resolver.miss', { method: 'getTicker' });
      return null;
    }
  }

  /** Current holdings, optionally filtered by portfolio name(s). */
  async getHoldings(portfolio?: string | string[]): Promise<Holding[]> {
    try {
      const result = await this.repo.getHoldings(portfolio);
      obs.increment(result.length ? 'resolver.hit' : 'resolver.miss', { method: 'getHoldings' });
      return result;
    } catch {
      obs.increment('resolver.miss', { method: 'getHoldings' });
      return [];
    }
  }

  /** Active strategies only (is_active = 1). */
  async getActiveStrategies(): Promise<CustomStrategy[]> {
    try {
      const result = await this.repo.listStrategies(true);
      obs.increment(result.length ? 'resolver.hit' : 'resolver.miss', { method: 'getActiveStrategies' });
      return result;
    } catch {
      obs.increment('resolver.miss', { method: 'getActiveStrategies' });
      return [];
    }
  }

  /** Full NSE EQ universe — symbols + metadata. */
  async getEquityUniverse(): Promise<Ticker[]> {
    try {
      const result = await this.repo.getNseEquityUniverse();
      obs.increment(result.length ? 'resolver.hit' : 'resolver.miss', { method: 'getEquityUniverse' });
      return result;
    } catch {
      obs.increment('resolver.miss', { method: 'getEquityUniverse' });
      return [];
    }
  }

  /** Corporate actions for a symbol, optionally since a date (YYYY-MM-DD). */
  async getCorporateActions(symbol: string, fromDate?: string): Promise<CorporateAction[]> {
    try {
      const result = await this.repo.getCorporateActions(symbol, fromDate);
      obs.increment(result.length ? 'resolver.hit' : 'resolver.miss', { method: 'getCorporateActions' });
      return result;
    } catch {
      obs.increment('resolver.miss', { method: 'getCorporateActions' });
      return [];
    }
  }
}
