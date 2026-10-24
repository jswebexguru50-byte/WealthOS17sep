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

interface EvidenceBackedMetricValues {
  operatingMarginPct: number | null;
  interestCoverage: number | null;
  roe3yPct: number | null;
  pledgedPct: number | null;
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
        return this.fillNullMetrics(this.rowToSnapshot(cached, ageHours), db);
      }
    }

    // 2. Fetch from Screener.in
    const screenerData = await ScreenerService.getInstance().fetchScreenerData(cleanSym).catch(() => null);
    if (!screenerData) {
      // Return stale cache if available, clearly flagged
      if (cached) {
        const ageHours = (Date.now() - new Date(cached.fetched_at).getTime()) / 3600000;
        return this.fillNullMetrics({ ...this.rowToSnapshot(cached, ageHours), source: 'DB_CACHE' }, db);
      }
      return null; // No data at all — never fabricate
    }

    // 3. Parse and store real data
    const parseNum = (v?: unknown): number | null => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v !== 'string' || v === '—' || v === '-' || v.trim() === '') return null;
      const cleaned = v.replace(/[%,₹x]/gi, '').trim();
      const n = parseFloat(cleaned);
      return Number.isFinite(n) ? n : null;
    };

    const evidence = await this.readEvidenceBackedMetrics(db, cleanSym);

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
    const operatingMarginPct = parseNum(screenerData.quarterlyResults?.latestOpmPct)
      ?? parseNum(screenerData.quarterlySeries?.at(-1)?.opmPct)
      ?? parseNum(screenerData.annualPlSeries?.at(-1)?.opmPct)
      ?? evidence.operatingMarginPct;
    const roe3yPct = parseNum(screenerData.growthMetrics?.roe3Yr) ?? evidence.roe3yPct;

    // These values are accepted only from persisted source rows. No ratio is
    // reconstructed from debt, interest expense, earnings, or shareholding.
    const interestCoverage = evidence.interestCoverage;
    const pledgedPct = evidence.pledgedPct;

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
      rocePct, roePct, operatingMarginPct, debtToEquity, interestCoverage,
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
      operatingMarginPct,
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

  /**
   * Fill only fields that are null in the snapshot from persisted evidence rows.
   * Existing non-null values and the fetch/cache source label are preserved.
   */
  private async fillNullMetrics(snapshot: FundamentalSnapshot, db: any): Promise<FundamentalSnapshot> {
    if (
      snapshot.operatingMarginPct !== null &&
      snapshot.interestCoverage !== null &&
      snapshot.roe3yPct !== null &&
      snapshot.pledgedPct !== null
    ) {
      return snapshot;
    }

    const evidence = await this.readEvidenceBackedMetrics(db, snapshot.symbol);
    const operatingMarginPct = snapshot.operatingMarginPct ?? evidence.operatingMarginPct;
    const interestCoverage = snapshot.interestCoverage ?? evidence.interestCoverage;
    const roe3yPct = snapshot.roe3yPct ?? evidence.roe3yPct;
    const pledgedPct = snapshot.pledgedPct ?? evidence.pledgedPct;

    return {
      ...snapshot,
      operatingMarginPct,
      interestCoverage,
      roe3yPct,
      pledgedPct,
      isHighPledge: pledgedPct !== null ? pledgedPct > 30 : false,
      isPoorDebtServiceability: interestCoverage !== null ? interestCoverage < 2.0 : false,
    };
  }

  /**
   * Read exact, persisted source rows. This intentionally excludes missing,
   * derived, rejected, and unverified facts; a null result remains null.
   */
  private async readEvidenceBackedMetrics(db: any, symbol: string): Promise<EvidenceBackedMetricValues> {
    const result: EvidenceBackedMetricValues = {
      operatingMarginPct: null,
      interestCoverage: null,
      roe3yPct: null,
      pledgedPct: null,
    };

    const parseStoredNumber = (value: unknown): number | null => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value !== 'string' || value.trim() === '') return null;
      const parsed = Number.parseFloat(value.trim());
      return Number.isFinite(parsed) ? parsed : null;
    };

    const readCanonicalFact = async (
      metrics: string[],
      allowedUnits: string[],
    ): Promise<number | null> => {
      try {
        const placeholders = metrics.map(() => '?').join(',');
        const rows = await dbAll<any>(db, `
          SELECT value, unit
          FROM company_facts
          WHERE UPPER(symbol) = ?
            AND metric IN (${placeholders})
            AND value IS NOT NULL
            AND factType <> 'MISSING'
            AND availabilityStatus = 'AVAILABLE'
            AND verificationStatus IN ('VERIFIED', 'VERIFIED_PARTIAL', 'SECONDARY_VERIFIED')
            AND (sourceType IS NULL OR sourceType <> 'DERIVED')
          ORDER BY periodEnd DESC, availableAt DESC, fetchedAt DESC
        `, [symbol, ...metrics]);

        for (const row of rows) {
          const unit = typeof row.unit === 'string' ? row.unit.trim().toUpperCase() : null;
          if (unit === null || !allowedUnits.includes(unit)) continue;
          const value = parseStoredNumber(row.value);
          if (value !== null) return value;
        }
      } catch {
        // Optional evidence tables may not exist in a disposable/test database.
      }
      return null;
    };

    try {
      const row = await dbGet<any>(db, `
        SELECT opm_pct
        FROM HistoricalFinancialStatements
        WHERE UPPER(symbol) = ?
          AND opm_pct IS NOT NULL
          AND primary_source <> 'TRENDLYNE_MCP'
        ORDER BY period_date DESC, id DESC
        LIMIT 1
      `, [symbol]);
      result.operatingMarginPct = parseStoredNumber(row?.opm_pct);
    } catch {
      // Optional evidence table.
    }

    result.operatingMarginPct ??= await readCanonicalFact(
      ['operating_margin_annual_pct', 'operating_margin_pct', 'opm_pct'],
      ['PERCENTAGE', '%', 'PCT'],
    );

    try {
      const snapshotRow = await dbGet<any>(db, `
        SELECT operating_margin_pct, interest_coverage, roe_3y_pct
        FROM FundamentalSnapshots
        WHERE UPPER(symbol) = ?
          AND source IS NOT NULL
          AND TRIM(source) <> ''
        ORDER BY fetched_at DESC
        LIMIT 1
      `, [symbol]);
      result.operatingMarginPct ??= parseStoredNumber(snapshotRow?.operating_margin_pct);
      result.interestCoverage ??= parseStoredNumber(snapshotRow?.interest_coverage);
      result.roe3yPct ??= parseStoredNumber(snapshotRow?.roe_3y_pct);
    } catch {
      // Optional evidence table.
    }

    result.interestCoverage = await readCanonicalFact(
      ['interest_coverage', 'icr'],
      ['RATIO', 'X'],
    ) ?? result.interestCoverage;
    result.roe3yPct = await readCanonicalFact(
      ['roe_3y_pct', 'roe3y_pct', 'roe_3y'],
      ['PERCENTAGE', '%', 'PCT'],
    ) ?? result.roe3yPct;

    try {
      const row = await dbGet<any>(db, `
        SELECT pledged_pct
        FROM FundamentalSnapshots
        WHERE UPPER(symbol) = ?
          AND pledged_pct IS NOT NULL
          AND source IS NOT NULL
          AND TRIM(source) <> ''
        ORDER BY fetched_at DESC
        LIMIT 1
      `, [symbol]);
      result.pledgedPct = parseStoredNumber(row?.pledged_pct);
    } catch {
      // Optional evidence table.
    }

    result.pledgedPct ??= await readCanonicalFact(
      ['promoter_pledge', 'promoter_pledge_pct'],
      ['PERCENTAGE', '%', 'PCT'],
    );
    return result;
  }
}
