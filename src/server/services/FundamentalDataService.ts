/**
 * FundamentalDataService.ts — ZFA Phase 1
 *
 * Provides real per-symbol fundamental data from Screener.in with SQLite caching.
 * Returns null for all fields when data is genuinely unavailable.
 * NEVER substitutes formula-based defaults for missing real data.
 */

import { getDB, dbRun, dbAll, dbGet } from '../database.js';
import { ScreenerService } from './screenerService.js';

export interface FundamentalSnapshot {
  symbol: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  fetchedAt: string;       // ISO timestamp of last Screener.in fetch
  source: 'SCREENER_IN' | 'DB_CACHE';
  ageHours: number;

  // Valuation
  peRatio: number | null;
  bookValue: number | null;
  dividendYieldPct: number | null;

  // Profitability — all from real Screener.in data
  rocePct: number | null;
  roePct: number | null;
  operatingMarginPct: number | null;

  // Balance sheet
  debtToEquity: number | null;
  /**
   * EBIT / Interest Expense — from Screener.in "Interest Coverage" row.
   * NEVER computed as formula (12/debt). null if Screener doesn't have it.
   */
  interestCoverage: number | null;

  // Growth
  salesGrowth5yPct: number | null;
  patGrowth5yPct: number | null;
  roe3yPct: number | null;

  // Governance / shareholding
  promoterHoldingPct: number | null;
  fiiHoldingPct: number | null;
  diiHoldingPct: number | null;
  /**
   * % of promoter shares pledged. null if unavailable.
   * Hard forensic gate: if > 30% → disqualified.
   */
  pledgedPct: number | null;

  // Derived flags (never formula-substituted)
  /** true only if pledgedPct > 30 AND pledgedPct is real data */
  isHighPledge: boolean;
  /** true only if debtToEquity > 1.5 AND the value is real data */
  isHighDebt: boolean;
  /** true only if interestCoverage < 2.0 AND the value is real data */
  isPoorDebtServiceability: boolean;
}

const FUNDAMENTALS_TTL_HOURS = 48; // Refresh from Screener.in every 48 hours

export class FundamentalDataService {
  private static instance: FundamentalDataService;

  public static getInstance(): FundamentalDataService {
    if (!FundamentalDataService.instance) {
      FundamentalDataService.instance = new FundamentalDataService();
    }
    return FundamentalDataService.instance;
  }

  public async initializeDatabase(): Promise<void> {
    const db = getDB();
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS FundamentalSnapshots (
        symbol                TEXT NOT NULL,
        fetched_at            TEXT NOT NULL,
        source                TEXT NOT NULL DEFAULT 'SCREENER_IN',
        company_name          TEXT,
        sector                TEXT,
        industry              TEXT,
        pe_ratio              REAL,
        book_value            REAL,
        dividend_yield_pct    REAL,
        roce_pct              REAL,
        roe_pct               REAL,
        operating_margin_pct  REAL,
        debt_to_equity        REAL,
        interest_coverage     REAL,
        sales_growth_5y_pct   REAL,
        pat_growth_5y_pct     REAL,
        roe_3y_pct            REAL,
        promoter_holding_pct  REAL,
        fii_holding_pct       REAL,
        dii_holding_pct       REAL,
        pledged_pct           REAL,
        PRIMARY KEY (symbol, fetched_at)
      )
    `);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_fund_snap_sym ON FundamentalSnapshots(symbol, fetched_at DESC)`);
  }

  /**
   * Returns the latest real fundamental snapshot for a symbol.
   * Fetches from Screener.in if no cached data within TTL.
   * Returns null if data cannot be fetched AND no valid cache exists.
   */
  public async getSnapshot(symbol: string): Promise<FundamentalSnapshot | null> {
    await this.initializeDatabase();
    const db = getDB();
    const cleanSym = symbol.trim().toUpperCase();

    // 1. Check SQLite cache
    const cached = await dbGet<any>(db, `
      SELECT * FROM FundamentalSnapshots
      WHERE symbol = ?
      ORDER BY fetched_at DESC LIMIT 1
    `, [cleanSym]);

    if (cached) {
      const ageHours = (Date.now() - new Date(cached.fetched_at).getTime()) / 3600000;
      if (ageHours < FUNDAMENTALS_TTL_HOURS) {
        return this.rowToSnapshot(cached, ageHours);
      }
    }

    // 2. Fetch from Screener.in
    const screenerData = await ScreenerService.getInstance().fetchScreenerData(cleanSym).catch(() => null);
    if (!screenerData) {
      // Return stale cache if available, clearly flagged
      if (cached) {
        const ageHours = (Date.now() - new Date(cached.fetched_at).getTime()) / 3600000;
        return { ...this.rowToSnapshot(cached, ageHours), source: 'DB_CACHE' };
      }
      return null; // No data at all — never fabricate
    }

    // 3. Parse and store real data
    const parseNum = (v?: string): number | null => {
      if (!v || v === '—' || v === '-' || v.trim() === '') return null;
      const cleaned = v.replace(/[%,₹x]/g, '').trim();
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    };

    const fetchedAt = new Date().toISOString();
    const peRatio = parseNum(screenerData.ratios?.stock_pe);
    const bookValue = parseNum(screenerData.ratios?.book_value);
    const dividendYieldPct = parseNum(screenerData.ratios?.dividend_yield);
    const rocePct = parseNum(screenerData.ratios?.roce);
    const roePct = parseNum(screenerData.ratios?.roe);
    const debtToEquity = parseNum(screenerData.ratios?.debt_to_equity);
    const promoterHoldingPct = parseNum(screenerData.shareholding?.promoters);
    const fiiHoldingPct = parseNum(screenerData.shareholding?.fiis);
    const diiHoldingPct = parseNum(screenerData.shareholding?.diis);
    const salesGrowth5yPct = parseNum(screenerData.growthMetrics?.sales5Yr);
    const patGrowth5yPct = parseNum(screenerData.growthMetrics?.profit5Yr);
    const roe3yPct = parseNum(screenerData.growthMetrics?.roe3Yr);

    // Interest coverage — ONLY from real Screener data, NEVER formula
    // Screener.in shows "Interest Coverage Ratio" in the summary ratios table
    const interestCoverage = null; // Parsed below from peers/ratios if available
    // NOTE: Screener.in does not always expose interest coverage in the main ratios object.
    // We mark it null for now; a future enhancement can parse it from the detailed ratio HTML.
    // Under no circumstances do we use (12 / debtToEquity) as a substitute.

    // Pledged % — critical governance check
    // Screener.in shows promoter pledge % in shareholding or in the ratios area
    // For now null — will be enhanced as Screener scraping improves
    const pledgedPct: number | null = null;

    await dbRun(db, `
      INSERT OR REPLACE INTO FundamentalSnapshots (
        symbol, fetched_at, source, company_name, sector, industry,
        pe_ratio, book_value, dividend_yield_pct,
        roce_pct, roe_pct, operating_margin_pct, debt_to_equity, interest_coverage,
        sales_growth_5y_pct, pat_growth_5y_pct, roe_3y_pct,
        promoter_holding_pct, fii_holding_pct, dii_holding_pct, pledged_pct
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      cleanSym, fetchedAt, 'SCREENER_IN',
      screenerData.company_name || cleanSym,
      screenerData.sector || null,
      screenerData.industry || null,
      peRatio, bookValue, dividendYieldPct,
      rocePct, roePct, null /* operating margin not in Screener ratios directly */, debtToEquity, interestCoverage,
      salesGrowth5yPct, patGrowth5yPct, roe3yPct,
      promoterHoldingPct, fiiHoldingPct, diiHoldingPct, pledgedPct
    ]);

    const snapshot: FundamentalSnapshot = {
      symbol: cleanSym,
      companyName: screenerData.company_name || cleanSym,
      sector: screenerData.sector || null,
      industry: screenerData.industry || null,
      fetchedAt,
      source: 'SCREENER_IN',
      ageHours: 0,
      peRatio,
      bookValue,
      dividendYieldPct,
      rocePct,
      roePct,
      operatingMarginPct: null,
      debtToEquity,
      interestCoverage,
      salesGrowth5yPct,
      patGrowth5yPct,
      roe3yPct,
      promoterHoldingPct,
      fiiHoldingPct,
      diiHoldingPct,
      pledgedPct,
      isHighPledge: pledgedPct !== null ? pledgedPct > 30 : false,
      isHighDebt: debtToEquity !== null ? debtToEquity > 1.5 : false,
      isPoorDebtServiceability: interestCoverage !== null ? interestCoverage < 2.0 : false
    };

    return snapshot;
  }

  /**
   * Returns the age of the latest fundamental snapshot in hours.
   * Returns Infinity if no data exists at all.
   */
  public async getDataAgeHours(symbol: string): Promise<number> {
    await this.initializeDatabase();
    const db = getDB();
    const row = await dbGet<any>(db, `
      SELECT fetched_at FROM FundamentalSnapshots WHERE symbol = ? ORDER BY fetched_at DESC LIMIT 1
    `, [symbol.trim().toUpperCase()]);
    if (!row) return Infinity;
    return (Date.now() - new Date(row.fetched_at).getTime()) / 3600000;
  }

  /**
   * Batch prefetch fundamentals for a list of symbols.
   * Rate-limited to respect Screener.in (one request per rateLimit ms).
   * Skips symbols that have fresh data (< TTL).
   */
  public async batchPrefetch(symbols: string[], rateLimitMs: number = 1500): Promise<{
    fetched: number;
    skipped: number;
    failed: number;
  }> {
    let fetched = 0; let skipped = 0; let failed = 0;
    for (const sym of symbols) {
      const age = await this.getDataAgeHours(sym);
      if (age < FUNDAMENTALS_TTL_HOURS) { skipped++; continue; }
      await new Promise(r => setTimeout(r, rateLimitMs));
      const snap = await this.getSnapshot(sym).catch(() => null);
      if (snap) fetched++; else failed++;
    }
    return { fetched, skipped, failed };
  }

  private rowToSnapshot(row: any, ageHours: number): FundamentalSnapshot {
    return {
      symbol: row.symbol,
      companyName: row.company_name || row.symbol,
      sector: row.sector || null,
      industry: row.industry || null,
      fetchedAt: row.fetched_at,
      source: 'DB_CACHE',
      ageHours,
      peRatio: row.pe_ratio ?? null,
      bookValue: row.book_value ?? null,
      dividendYieldPct: row.dividend_yield_pct ?? null,
      rocePct: row.roce_pct ?? null,
      roePct: row.roe_pct ?? null,
      operatingMarginPct: row.operating_margin_pct ?? null,
      debtToEquity: row.debt_to_equity ?? null,
      interestCoverage: row.interest_coverage ?? null,
      salesGrowth5yPct: row.sales_growth_5y_pct ?? null,
      patGrowth5yPct: row.pat_growth_5y_pct ?? null,
      roe3yPct: row.roe_3y_pct ?? null,
      promoterHoldingPct: row.promoter_holding_pct ?? null,
      fiiHoldingPct: row.fii_holding_pct ?? null,
      diiHoldingPct: row.dii_holding_pct ?? null,
      pledgedPct: row.pledged_pct ?? null,
      isHighPledge: (row.pledged_pct ?? null) !== null ? row.pledged_pct > 30 : false,
      isHighDebt: (row.debt_to_equity ?? null) !== null ? row.debt_to_equity > 1.5 : false,
      isPoorDebtServiceability: (row.interest_coverage ?? null) !== null ? row.interest_coverage < 2.0 : false
    };
  }
}
