/**
 * FactsRepository
 *
 * Typed read layer for the six most-queried DB tables.
 * Routes and services call this instead of raw dbAll/dbGet.
 *
 * Guarantees:
 *   - Every method is typed (no stray `any` on the return path).
 *   - Queries are parameterised — no string interpolation in SQL.
 *   - Short in-process cache for hot lookups (MasterTickers universe,
 *     active portfolios) with a 2-minute TTL so repeated route calls
 *     within a single request burst don't re-hit SQLite.
 *
 * Usage:
 *   import { FactsRepository } from './FactsRepository.js';
 *   const repo = FactsRepository.getInstance();
 *   const ticker = await repo.getTicker(symbol);
 *   const portfolios = await repo.listActivePortfolios();
 */

import { getDB, dbAll, dbGet } from '../database.js';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface Ticker {
  symbol: string;
  isin: string;
  name: string;
  exchange: string;
  segment: string;
  sector?: string;
  industry?: string;
  fmv_31_jan_2018?: number;
  upstox_key_nse?: string;
  upstox_key_bse?: string;
}

export interface Portfolio {
  id: number;
  name: string;
  benchmark_symbol?: string;
  type?: string;
  status: string;
  base_currency?: string;
  member_id?: number;
}

export interface Holding {
  portfolio: string;
  symbol: string;
  isin: string;
  quantity: number;
  avg_buy_price: number;
  ltp?: number;
  unrealized_pnl?: number;
  sector?: string;
}

export interface Transaction {
  id: number;
  date: string;
  portfolio: string;
  type: string;
  symbol: string;
  isin?: string;
  quantity: number;
  price: number;
  net_amount: number;
  gross_amount?: number;
  brokerage?: number;
  notes?: string;
}

export interface CustomStrategy {
  id: number;
  name: string;
  parameters_json: string;
  is_active: number;
  created_at?: string;
  updated_at?: string;
}

export interface CorporateAction {
  id: number;
  symbol: string;
  isin?: string;
  record_date: string;
  action_type: string;
  details?: string;
}

// ─── Simple in-process TTL cache ─────────────────────────────────────────────

class MiniCache<T> {
  private store = new Map<string, { data: T; ts: number }>();
  constructor(private ttlMs: number) {}
  get(key: string): T | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() - e.ts > this.ttlMs) { this.store.delete(key); return null; }
    return e.data;
  }
  set(key: string, data: T): void { this.store.set(key, { data, ts: Date.now() }); }
  invalidate(key?: string): void { key ? this.store.delete(key) : this.store.clear(); }
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class FactsRepository {
  private static instance: FactsRepository;

  // 2-min cache for hot read paths
  private tickerCache     = new MiniCache<Ticker | null>(2 * 60_000);
  private universeCache   = new MiniCache<Ticker[]>(2 * 60_000);
  private portfolioCache  = new MiniCache<Portfolio[]>(2 * 60_000);

  static getInstance(): FactsRepository {
    if (!FactsRepository.instance) FactsRepository.instance = new FactsRepository();
    return FactsRepository.instance;
  }

  // ── MasterTickers ───────────────────────────────────────────────────────────

  async getTicker(symbolOrIsin: string): Promise<Ticker | null> {
    const key = symbolOrIsin.toUpperCase();
    const cached = this.tickerCache.get(key);
    if (cached !== null) return cached;
    const row = await dbGet<Ticker>(
      getDB(),
      `SELECT symbol, isin, name, exchange, segment, sector, industry,
              fmv_31_jan_2018, upstox_key_nse, upstox_key_bse
       FROM MasterTickers WHERE symbol = ? OR isin = ? LIMIT 1`,
      [key, key]
    );
    this.tickerCache.set(key, row ?? null);
    return row ?? null;
  }

  async getNseEquityUniverse(): Promise<Ticker[]> {
    const cached = this.universeCache.get('nse-eq');
    if (cached) return cached;
    const rows = await dbAll<Ticker>(
      getDB(),
      `SELECT symbol, isin, name, exchange, segment, sector, industry, fmv_31_jan_2018
       FROM MasterTickers WHERE exchange = 'NSE' AND segment = 'EQ' AND symbol IS NOT NULL
       ORDER BY symbol`
    );
    this.universeCache.set('nse-eq', rows);
    return rows;
  }

  /** Invalidate the cached NSE universe without pretending there is a ticker key. */
  invalidateUniverse(): void { this.universeCache.invalidate(); }

  async searchTickers(query: string, limit = 20): Promise<Ticker[]> {
    const q = `%${query.toUpperCase()}%`;
    return dbAll<Ticker>(
      getDB(),
      `SELECT symbol, isin, name, exchange, segment FROM MasterTickers
       WHERE symbol LIKE ? OR name LIKE ? OR isin LIKE ?
       ORDER BY symbol LIMIT ?`,
      [q, q, q, limit]
    );
  }

  invalidateTicker(symbol: string): void { this.tickerCache.invalidate(symbol.toUpperCase()); }

  // ── Portfolios ──────────────────────────────────────────────────────────────

  async listActivePortfolios(memberId?: number): Promise<Portfolio[]> {
    const key = memberId != null ? `member-${memberId}` : 'all';
    const cached = this.portfolioCache.get(key);
    if (cached) return cached;
    const rows = memberId != null
      ? await dbAll<Portfolio>(
          getDB(),
          `SELECT * FROM Portfolios
           WHERE (member_id = ? OR name IN (
             SELECT portfolio_name FROM MemberPortfolioPermissions WHERE member_id = ?
           )) AND status = 'ACTIVE' ORDER BY name ASC`,
          [memberId, memberId]
        )
      : await dbAll<Portfolio>(
          getDB(),
          `SELECT * FROM Portfolios WHERE status = 'ACTIVE' ORDER BY name ASC`
        );
    this.portfolioCache.set(key, rows);
    return rows;
  }

  async getPortfolio(name: string): Promise<Portfolio | null> {
    return dbGet<Portfolio>(getDB(), `SELECT * FROM Portfolios WHERE name = ? LIMIT 1`, [name]);
  }

  invalidatePortfolios(): void { this.portfolioCache.invalidate(); }

  // ── Holdings ────────────────────────────────────────────────────────────────

  async getHoldings(portfolio?: string | string[]): Promise<Holding[]> {
    if (!portfolio || (Array.isArray(portfolio) && portfolio.length === 0)) {
      return dbAll<Holding>(getDB(), `SELECT * FROM Holdings ORDER BY portfolio, symbol`);
    }
    const ports = Array.isArray(portfolio) ? portfolio : [portfolio];
    const ph = ports.map(() => '?').join(',');
    return dbAll<Holding>(
      getDB(),
      `SELECT * FROM Holdings WHERE portfolio IN (${ph}) ORDER BY symbol`,
      ports
    );
  }

  async getHolding(portfolio: string, symbol: string): Promise<Holding | null> {
    return dbGet<Holding>(
      getDB(),
      `SELECT * FROM Holdings WHERE portfolio = ? AND (symbol = ? OR isin = ?) LIMIT 1`,
      [portfolio, symbol, symbol]
    );
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  async getTransactions(opts: {
    portfolio?: string | string[];
    symbol?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<Transaction[]> {
    const wheres: string[] = [];
    const params: any[] = [];

    if (opts.portfolio) {
      const ports = Array.isArray(opts.portfolio) ? opts.portfolio : [opts.portfolio];
      wheres.push(`portfolio IN (${ports.map(() => '?').join(',')})`);
      params.push(...ports);
    }
    if (opts.symbol)   { wheres.push('(symbol = ? OR isin = ?)'); params.push(opts.symbol, opts.symbol); }
    if (opts.fromDate) { wheres.push('date >= ?'); params.push(opts.fromDate); }
    if (opts.toDate)   { wheres.push('date <= ?'); params.push(opts.toDate); }

    const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
    const limit  = opts.limit  ?? 500;
    const offset = opts.offset ?? 0;
    params.push(limit, offset);

    return dbAll<Transaction>(
      getDB(),
      `SELECT * FROM Transactions ${where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
      params
    );
  }

  // ── CustomStrategies ────────────────────────────────────────────────────────

  async listStrategies(activeOnly = false): Promise<CustomStrategy[]> {
    return dbAll<CustomStrategy>(
      getDB(),
      activeOnly
        ? `SELECT * FROM CustomStrategies WHERE is_active = 1 ORDER BY name`
        : `SELECT * FROM CustomStrategies ORDER BY is_active DESC, name`
    );
  }

  async getStrategy(id: number): Promise<CustomStrategy | null> {
    return dbGet<CustomStrategy>(getDB(), `SELECT * FROM CustomStrategies WHERE id = ? LIMIT 1`, [id]);
  }

  // ── CorporateActions ────────────────────────────────────────────────────────

  async getCorporateActions(symbol: string, fromDate?: string): Promise<CorporateAction[]> {
    return fromDate
      ? dbAll<CorporateAction>(
          getDB(),
          `SELECT * FROM CorporateActions WHERE (symbol = ? OR isin = ?) AND record_date >= ? ORDER BY record_date DESC`,
          [symbol, symbol, fromDate]
        )
      : dbAll<CorporateAction>(
          getDB(),
          `SELECT * FROM CorporateActions WHERE (symbol = ? OR isin = ?) ORDER BY record_date DESC`,
          [symbol, symbol]
        );
  }
}
