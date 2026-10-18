/**
 * TrendlyneUniverseScheduler.ts — Proactive Universe Enrichment & Slot Filler
 *
 * Problem solved: when a caller requests N < 10 stocks, the MCP call wastes
 * (10-N)×50 cells. This service fills those spare scrip slots with universe
 * stocks that are due for a refresh, turning every call into a full 500-cell
 * envelope.
 *
 * Rules:
 *  - No stock is re-fetched within TTL_DAYS (default 15 days) unless
 *    priority_override = 1.
 *  - Fill priority: P0 (override) → Tier-1 (Nifty 50) → Tier-2 (Nifty 500)
 *    → Tier-3 (rest of MasterTickers), then by staleness descending.
 *  - Universe seeding runs once at startup if table is empty.
 *  - Nifty 500 membership is derived from MasterTickers + a hardcoded
 *    NSE index list embedded here; override via API if needed.
 */

import { getDB, dbRun, dbAll, dbGet } from '../../../database.js';

export interface UniverseStock {
  symbol: string;
  securityId: string;
  universeTier: 1 | 2 | 3;
  lastFetchedAt: number | null;   // unix seconds
  nextDueAt: number | null;       // unix seconds
  staleDays: number;              // days since last fetch (9999 = never fetched)
  priorityOverride: boolean;
}

export class TrendlyneUniverseScheduler {
  private static instance: TrendlyneUniverseScheduler;

  // Default 15-day TTL; override via TRENDLYNE_FETCH_TTL_DAYS env var
  public readonly ttlDays: number = Number(process.env.TRENDLYNE_FETCH_TTL_DAYS) || 15;

  private constructor() {}

  public static getInstance(): TrendlyneUniverseScheduler {
    if (!TrendlyneUniverseScheduler.instance) {
      TrendlyneUniverseScheduler.instance = new TrendlyneUniverseScheduler();
    }
    return TrendlyneUniverseScheduler.instance;
  }

  // ── Schema ────────────────────────────────────────────────────────────

  public async ensureTable(): Promise<void> {
    const db = getDB();
    if (!db) return;
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS trendlyne_universe_schedule (
        symbol              TEXT    PRIMARY KEY,
        security_id         TEXT    NOT NULL,
        universe_tier       INTEGER NOT NULL DEFAULT 3,
        last_fetched_at     INTEGER,           -- unix seconds
        next_due_at         INTEGER,           -- unix seconds
        fetch_count         INTEGER NOT NULL DEFAULT 0,
        priority_override   INTEGER NOT NULL DEFAULT 0,  -- 1 = force next call
        created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )
    `);
    await dbRun(db, `
      CREATE INDEX IF NOT EXISTS idx_tus_due
        ON trendlyne_universe_schedule (next_due_at, universe_tier, priority_override)
    `);
  }

  // ── Seed ─────────────────────────────────────────────────────────────

  /**
   * Populates trendlyne_universe_schedule from MasterTickers.
   * Safe to call repeatedly — uses INSERT OR IGNORE.
   * Call once at daemon start; takes ~1-2s for 5000 symbols.
   */
  public async seedFromMasterTickers(): Promise<{ inserted: number; skipped: number }> {
    const db = getDB();
    if (!db) return { inserted: 0, skipped: 0 };

    await this.ensureTable();

    const rows = await dbAll<{ symbol: string; isin: string }>(
      db,
      `SELECT symbol, COALESCE(isin, symbol) as isin FROM MasterTickers
       WHERE exchange IN ('NSE','BSE') AND symbol IS NOT NULL AND symbol != ''`
    );

    const nifty50Set = new Set(NIFTY_50_SYMBOLS);
    const nifty500Set = new Set(NIFTY_500_SYMBOLS);

    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
      const tier = nifty50Set.has(row.symbol) ? 1
                 : nifty500Set.has(row.symbol) ? 2
                 : 3;
      const result = await dbRun(
        db,
        `INSERT OR IGNORE INTO trendlyne_universe_schedule
           (symbol, security_id, universe_tier)
         VALUES (?, ?, ?)`,
        [row.symbol, row.isin, tier]
      );
      if ((result as any)?.changes > 0) inserted++;
      else skipped++;
    }

    return { inserted, skipped };
  }

  // ── Core filler ───────────────────────────────────────────────────────

  /**
   * Returns up to `slots` stocks that are due for a refresh and are NOT
   * already in `excludeSymbols`. Called by TrendlyneEnrichmentDaemon
   * before every MCP dispatch to pad the batch to 10 scrips.
   *
   * Sort order:
   *   1. priority_override DESC  (manual overrides first)
   *   2. universe_tier ASC       (Nifty 50 before Nifty 500 before rest)
   *   3. staleDays DESC          (longest since last fetch comes first)
   */
  public async getFillerStocks(
    slots: number,
    excludeSymbols: string[] = []
  ): Promise<UniverseStock[]> {
    if (slots <= 0) return [];

    const db = getDB();
    if (!db) return [];

    const nowSec = Math.floor(Date.now() / 1000);
    const exclude = excludeSymbols.length > 0
      ? `AND symbol NOT IN (${excludeSymbols.map(() => '?').join(',')})`
      : '';

    const rows = await dbAll<any>(
      db,
      `SELECT symbol, security_id, universe_tier, last_fetched_at, next_due_at,
              priority_override,
              CASE WHEN last_fetched_at IS NULL THEN 9999
                   ELSE (${nowSec} - last_fetched_at) / 86400.0
              END AS stale_days
       FROM trendlyne_universe_schedule
       WHERE (next_due_at IS NULL OR next_due_at <= ${nowSec} OR priority_override = 1)
         ${exclude}
       ORDER BY priority_override DESC, universe_tier ASC, stale_days DESC
       LIMIT ?`,
      [...excludeSymbols, slots]
    );

    return rows.map((r: any) => ({
      symbol: r.symbol,
      securityId: r.security_id,
      universeTier: r.universe_tier as 1 | 2 | 3,
      lastFetchedAt: r.last_fetched_at,
      nextDueAt: r.next_due_at,
      staleDays: r.stale_days,
      priorityOverride: r.priority_override === 1,
    }));
  }

  // ── Post-fetch ────────────────────────────────────────────────────────

  /**
   * Called after a successful MCP batch call to stamp the TTL.
   * Clears any priority_override flags on the fetched symbols.
   */
  public async markFetched(symbols: string[]): Promise<void> {
    if (symbols.length === 0) return;
    const db = getDB();
    if (!db) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const ttlSec = this.ttlDays * 86400;
    const nextDueSec = nowSec + ttlSec;

    for (const sym of symbols) {
      await dbRun(
        db,
        `INSERT INTO trendlyne_universe_schedule
           (symbol, security_id, universe_tier, last_fetched_at, next_due_at, fetch_count, priority_override)
         VALUES (?, ?, 3, ?, ?, 1, 0)
         ON CONFLICT(symbol) DO UPDATE SET
           last_fetched_at  = excluded.last_fetched_at,
           next_due_at      = excluded.next_due_at,
           fetch_count      = fetch_count + 1,
           priority_override = 0,
           updated_at       = strftime('%s','now')`,
        [sym, sym, nowSec, nextDueSec]
      );
    }
  }

  // ── Override API ──────────────────────────────────────────────────────

  /**
   * Forces a specific stock to the front of the filler queue,
   * bypassing the 15-day TTL. Used by the UI "refresh now" button.
   */
  public async setOverride(symbol: string, on: boolean): Promise<void> {
    const db = getDB();
    if (!db) return;
    await dbRun(
      db,
      `INSERT INTO trendlyne_universe_schedule (symbol, security_id, priority_override)
       VALUES (?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET priority_override = ?, updated_at = strftime('%s','now')`,
      [symbol, symbol, on ? 1 : 0, on ? 1 : 0]
    );
  }

  /**
   * Updates the universe tier for a symbol (e.g. when it enters/exits Nifty 50).
   */
  public async setTier(symbol: string, tier: 1 | 2 | 3): Promise<void> {
    const db = getDB();
    if (!db) return;
    await dbRun(
      db,
      `INSERT INTO trendlyne_universe_schedule (symbol, security_id, universe_tier)
       VALUES (?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET universe_tier = ?, updated_at = strftime('%s','now')`,
      [symbol, symbol, tier, tier]
    );
  }

  // ── Status ────────────────────────────────────────────────────────────

  public async getStats(): Promise<{
    total: number;
    neverFetched: number;
    overdue: number;
    fresh: number;
    overrideCount: number;
    byTier: Record<number, number>;
  }> {
    const db = getDB();
    if (!db) return { total: 0, neverFetched: 0, overdue: 0, fresh: 0, overrideCount: 0, byTier: {} };

    const nowSec = Math.floor(Date.now() / 1000);
    const row = await dbGet<any>(db, `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN last_fetched_at IS NULL THEN 1 ELSE 0 END) as never_fetched,
        SUM(CASE WHEN next_due_at IS NOT NULL AND next_due_at <= ${nowSec} AND last_fetched_at IS NOT NULL THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN next_due_at > ${nowSec} THEN 1 ELSE 0 END) as fresh,
        SUM(priority_override) as override_count
      FROM trendlyne_universe_schedule
    `);

    const tierRows = await dbAll<any>(db, `
      SELECT universe_tier, COUNT(*) as cnt
      FROM trendlyne_universe_schedule GROUP BY universe_tier
    `);

    const byTier: Record<number, number> = {};
    for (const r of tierRows) byTier[r.universe_tier] = r.cnt;

    return {
      total: row?.total || 0,
      neverFetched: row?.never_fetched || 0,
      overdue: row?.overdue || 0,
      fresh: row?.fresh || 0,
      overrideCount: row?.override_count || 0,
      byTier,
    };
  }
}

// ── Nifty 50 symbols (as of Oct 2026) ─────────────────────────────────
const NIFTY_50_SYMBOLS: string[] = [
  'ADANIENT','ADANIPORTS','APOLLOHOSP','ASIANPAINT','AXISBANK',
  'BAJAJ-AUTO','BAJAJFINSV','BAJFINANCE','BHARTIARTL','BPCL',
  'BRITANNIA','CIPLA','COALINDIA','DIVISLAB','DRREDDY',
  'EICHERMOT','GRASIM','HCLTECH','HDFC','HDFCBANK',
  'HDFCLIFE','HEROMOTOCO','HINDALCO','HINDUNILVR','ICICIBANK',
  'INDUSINDBK','INFY','ITC','JSWSTEEL','KOTAKBANK',
  'LT','M&M','MARUTI','NESTLEIND','NTPC',
  'ONGC','POWERGRID','RELIANCE','SBILIFE','SBIN',
  'SUNPHARMA','TATACONSUM','TATAMOTORS','TATASTEEL','TCS',
  'TECHM','TITAN','TRENT','ULTRACEMCO','WIPRO',
];

// ── Nifty 500 additional symbols (Tier 2, non-Nifty-50) ───────────────
// Partial list — seed the full 500 via the DB API or screener export.
// These cover the next ~100 high-conviction names by market cap.
const NIFTY_500_SYMBOLS: string[] = [
  ...NIFTY_50_SYMBOLS,
  'ABB','ACC','ADANIGREEN','ADANIPOWER','ALKEM',
  'AMBUJACEM','APLAPOLLO','ASTRAL','ATUL','AUBANK',
  'AUROPHARMA','BANDHANBNK','BANKBARODA','BEL','BERGEPAINT',
  'BHEL','BIOCON','BOSCHLTD','CANBK','CDSL',
  'CHOLAFIN','COFORGE','COLPAL','CONCOR','CROMPTON',
  'CUMMINSIND','DABUR','DALBHARAT','DEEPAKNTR','DIXON',
  'DLF','ELGIEQUIP','ESCORTS','EXIDEIND','FEDERALBNK',
  'FLUOROCHEM','GAIL','GLAXO','GMRINFRA','GODREJCP',
  'GODREJPROP','GRANULES','GSPL','HAL','HAVELLS',
  'HFCL','HINDPETRO','HONAUT','IDFCFIRSTB','IEX',
  'IGL','INDIANB','INDIGO','INDUSTOWER','INOXWIND',
  'IOC','IPCALAB','IRB','IRCTC','IRFC',
  'JKCEMENT','JUBLFOOD','KANSAINER','KEC','KEJRIWAL',
  'LALPATHLAB','LAURUSLABS','LICHSGFIN','LINDEINDIA','LUPIN',
  'MARICO','MAXHEALTH','MCX','MFSL','MPHASIS',
  'MRF','MUTHOOTFIN','NATIONALUM','NAVINFLUOR','NBCC',
  'NCC','NHPC','NMDC','OBEROIRLTY','OFSS',
  'OIL','PAGEIND','PEL','PERSISTENT','PETRONET',
  'PFC','PIIND','PIRAMALENT','PNB','POLICYBZR',
  'POLYCAB','POONAWALLA','PVRINOX','RAILTEL','RAMCOCEM',
  'RECLTD','SAIL','SCHAEFFLER','SCI','SIEMENS',
  'SKFINDIA','SONACOMS','STAR','SUMICHEM','SUNTV',
  'SUPREMEIND','SYNGENE','TATACOMM','TATACHEM','TATAELXSI',
  'TATAPOWER','TORNTPHARM','TORNTPOWER','TRIDENT','TVSMOTOR',
  'UBL','UNITDSPR','UPL','VOLTAS','WHIRLPOOL',
  'ZEEL','ZOMATO','ZYDUSLIFE',
  // Tier-1 candidates from WealthOS research:
  'MBAPL','SPORTKING','NRL','RUBYMILLS',
];
