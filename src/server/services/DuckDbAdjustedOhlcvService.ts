import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { dbAll, getDB } from '../database.js';

const execFileAsync = promisify(execFile);

export interface AdjustedOhlcvBar {
  trade_date: string;
  symbol: string;
  isin?: string;
  upstox_key_nse?: string;
  open_adjusted: number;
  high_adjusted: number;
  low_adjusted: number;
  close_adjusted: number;
  volume_raw: number;
  data_source: string;
}

export type OhlcvReadSource = 'DUCKDB_ADJUSTED' | 'SQLITE_LEGACY_FALLBACK' | 'UNAVAILABLE';
export interface OhlcvReadResult {
  bars: AdjustedOhlcvBar[];
  source: OhlcvReadSource;
}

/** Structured result returned by the public single-symbol API route delegate. */
export interface BridgeInvokeResult {
  success: boolean;
  source: 'DUCKDB_ADJUSTED';
  executableUsed: string;
  data: AdjustedOhlcvBar[];
  /** Populated only when success === false. */
  error?: {
    message: string;
    exitCode: number | null;
    stderr: string;
    catalogPath: string;
    symbolQueried: string;
  };
}

export interface DuckDbReadinessResult {
  ok: boolean;
  executableUsed: string;
  bars: AdjustedOhlcvBar[];
  barsReturned: number;
  stderr: string;
  durationMs: number;
  catalogPath: string;
  error?: string;
}

/**
 * Read-only bridge to the permanent local DuckDB/Parquet candle catalog.
 *
 * This class is the SINGLE authority for:
 *  - Python executable resolution (system-local then bundled fallback)
 *  - Bridge script invocation, timeout, stderr capture, and result parsing
 *  - Catalog and Parquet partition path resolution
 *  - Structured error reporting (COVERAGE_GAP vs INFRASTRUCTURE_ERROR)
 *
 * No caller (including server.ts routes) should duplicate any of this logic.
 */
export class DuckDbAdjustedOhlcvService {
  private static readonly catalog = path.resolve('data', 'market_data', 'tejhq_hf_10y', 'ohlcv.duckdb');
  private static readonly bridge = path.resolve('scripts', 'market_data', 'query_adjusted_ohlcv.py');
  private static readonly kiteParquetRoot = path.resolve(
    'data', 'market_data', 'tejhq_hf_10y', 'kite_adjusted_backfill', 'candles'
  );
  // The user-local Python has DuckDB installed and is the stable production
  // bridge. The Codex-bundled runtime is retained only as a portable fallback.
  private static readonly localPython = 'C:\\Users\\gopal\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
  private static readonly bundledPython = 'C:\\Users\\gopal\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';

  /** Resolve the Python executable: system-local first, bundled fallback. */
  private static getPython(): string {
    return fs.existsSync(this.localPython) ? this.localPython : this.bundledPython;
  }

  /** Shared exec options to avoid repetition across all bridge calls. */
  private static execOpts(timeoutMs: number, maxBufferBytes: number) {
    return {
      timeout: timeoutMs,
      maxBuffer: maxBufferBytes,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      cwd: path.resolve('.')
    } as const;
  }

  // ────────────────────────────────────────────────────────────────────────
  // PRIMARY API: single-symbol invoke (thin delegate for server.ts route)
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Invoke the bridge for a single symbol with optional date range.
   * server.ts routes call THIS — never execFileAsync directly.
   * Returns a fully-typed structured result including stderr on failure.
   */
  static async invokeForSymbol(
    symbol: string,
    limit: number,
    fromDate = '1900-01-01',
    toDate = '2999-12-31'
  ): Promise<BridgeInvokeResult> {
    const python = this.getPython();
    const clean = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    if (!fs.existsSync(this.bridge) || !fs.existsSync(this.catalog)) {
      return {
        success: false, source: 'DUCKDB_ADJUSTED', executableUsed: python, data: [],
        error: { message: 'Bridge script or catalog not found', exitCode: null, stderr: '', catalogPath: this.catalog, symbolQueried: clean }
      };
    }
    try {
      const { stdout, stderr } = await execFileAsync(
        python,
        [this.bridge, '--symbol', clean, '--limit', String(Math.min(Math.max(limit, 1), 10_000)), '--from-date', fromDate, '--to-date', toDate],
        this.execOpts(120_000, 16 * 1024 * 1024)
      );
      if (stderr?.trim()) console.warn('[DuckDB OHLCV] Bridge stderr:', stderr.trim());
      const data: AdjustedOhlcvBar[] = JSON.parse(stdout || '[]');
      return { success: true, source: 'DUCKDB_ADJUSTED', executableUsed: python, data };
    } catch (err: any) {
      const stderr: string = err?.stderr ?? (err?.killed ? 'Process timed out' : '');
      const exitCode: number | null = err?.code ?? null;
      console.error('[DuckDB OHLCV] invokeForSymbol INFRASTRUCTURE_ERROR - executable:', python, '| exit:', exitCode, '| stderr:', stderr || err?.message);
      return {
        success: false, source: 'DUCKDB_ADJUSTED', executableUsed: python, data: [],
        error: { message: err?.message || String(err), exitCode, stderr, catalogPath: this.catalog, symbolQueried: clean }
      };
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // BATCH API: multi-symbol bridge (used by strategy scanner)
  // ────────────────────────────────────────────────────────────────────────

  static async getDailyBars(symbol: string, limit: number): Promise<AdjustedOhlcvBar[] | null> {
    const { bars } = await this.getDailyBarsForSymbols([symbol], limit);
    const safeSymbol = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    return bars.get(safeSymbol) || null;
  }

  /**
   * Bounded batch bridge for strategy scans. One Python process per chunk of <=500 symbols.
   * Returns both the bar map AND bridgeFailureCount so callers can distinguish:
   *   COVERAGE_GAP         - symbol present in universe but no Parquet partition (expected)
   *   INFRASTRUCTURE_ERROR - Python/DuckDB process failed (bridgeFailureCount > 0)
   */
  static async getDailyBarsForSymbols(
    symbols: string[],
    limit: number
  ): Promise<{ bars: Map<string, AdjustedOhlcvBar[]>; bridgeFailureCount: number }> {
    const bars = new Map<string, AdjustedOhlcvBar[]>();
    if (!fs.existsSync(this.catalog) || !fs.existsSync(this.bridge)) {
      return { bars, bridgeFailureCount: 1 };
    }
    const safeSymbols = [...new Set(
      symbols.map(s => s.trim().toUpperCase().replace(/\.(NS|BO)$/, '')).filter(s => /^[A-Z0-9_-]+$/.test(s))
    )];
    if (!safeSymbols.length || safeSymbols.length > 500) return { bars, bridgeFailureCount: 0 };
    const python = this.getPython();
    try {
      const { stdout, stderr } = await execFileAsync(
        python,
        [this.bridge, '--symbols', safeSymbols.join(','), '--limit', String(Math.min(Math.max(limit, 1), 10_000))],
        this.execOpts(120_000, 16 * 1024 * 1024)
      );
      if (stderr?.trim()) console.warn('[DuckDB OHLCV] Bridge stderr (batch):', stderr.trim());
      const rows: AdjustedOhlcvBar[] = JSON.parse(stdout || '[]');
      for (const row of Array.isArray(rows) ? rows : []) {
        const key = String(row.symbol || '').toUpperCase();
        if (!bars.has(key)) bars.set(key, []);
        bars.get(key)!.push(row);
      }
      return { bars, bridgeFailureCount: 0 };
    } catch (err: any) {
      const stderr: string = err?.stderr ?? '';
      const exitCode: number | null = err?.code ?? null;
      console.warn(
        '[DuckDB OHLCV] Batch bridge INFRASTRUCTURE_ERROR - executable:', python,
        '| exit:', exitCode,
        '| stderr:', stderr || err?.message || String(err)
      );
      return { bars, bridgeFailureCount: 1 };
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // PROVENANCE WRAPPERS
  // ────────────────────────────────────────────────────────────────────────

  /** Provenance-bearing canonical result for API/UI callers. */
  static async getDailyBarsWithSource(symbol: string, limit: number): Promise<OhlcvReadResult> {
    const bars = await this.getDailyBars(symbol, limit);
    return bars?.length ? { bars, source: 'DUCKDB_ADJUSTED' } : { bars: [], source: 'UNAVAILABLE' };
  }

  /**
   * Canonical app read: DuckDB always wins. SQLite is used only when the
   * requested symbol is absent from the durable catalog, and its provenance is
   * carried to callers so UI/API can never present it as adjusted Kite data.
   */
  static async getDailyBarsWithLegacyFallback(symbol: string, limit: number): Promise<OhlcvReadResult> {
    const primary = await this.getDailyBarsWithSource(symbol, limit);
    if (primary.bars.length) return primary;
    const clean = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    try {
      const rows: any[] = await dbAll(getDB(), `
        SELECT trade_date, symbol, open, high, low, close, volume, data_source
          FROM DailyOHLCV
         WHERE upper(symbol) IN (?, ?, ?)
         ORDER BY trade_date DESC LIMIT ?`,
        [clean, `${clean}.NS`, `${clean}.BO`, Math.min(Math.max(limit, 1), 10_000)]
      );
      const bars = (rows || []).filter(r => Number(r.close) > 0).map(r => ({
        trade_date: String(r.trade_date), symbol: clean,
        open_adjusted: Number(r.open || r.close), high_adjusted: Number(r.high || r.close),
        low_adjusted: Number(r.low || r.close), close_adjusted: Number(r.close),
        volume_raw: Number(r.volume || 0),
        data_source: `SQLITE_LEGACY_FALLBACK:${r.data_source || 'UNKNOWN'}`
      }));
      return bars.length ? { bars, source: 'SQLITE_LEGACY_FALLBACK' } : primary;
    } catch {
      return primary;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // READINESS AND COVERAGE UTILITIES
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Lightweight startup readiness check. Validates the Python bridge can serve
   * one known Parquet partition without scanning the full catalog.
   * A false result is an INFRASTRUCTURE_ERROR, not a coverage gap.
   */
  static async readinessCheck(symbol = 'TCS'): Promise<DuckDbReadinessResult> {
    const python = this.getPython();
    const t0 = Date.now();
    const clean = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    if (!fs.existsSync(this.bridge) || !fs.existsSync(this.catalog)) {
      return { ok: false, executableUsed: python, bars: [], barsReturned: 0, stderr: '',
        durationMs: Date.now() - t0, catalogPath: this.catalog, error: 'Bridge script or catalog file not found' };
    }
    try {
      const { stdout, stderr } = await execFileAsync(
        python, [this.bridge, '--symbols', clean, '--limit', '1'],
        this.execOpts(60_000, 1024 * 1024)
      );
      const bars: AdjustedOhlcvBar[] = JSON.parse(stdout || '[]');
      return { ok: bars.length > 0, executableUsed: python, bars, barsReturned: bars.length,
        stderr: stderr?.trim() || '', durationMs: Date.now() - t0, catalogPath: this.catalog };
    } catch (err: any) {
      const stderr: string = err?.stderr ?? '';
      return { ok: false, executableUsed: python, bars: [], barsReturned: 0,
        stderr: stderr || err?.message || String(err),
        durationMs: Date.now() - t0, catalogPath: this.catalog, error: err?.message || String(err) };
    }
  }

  /**
   * Fast filesystem-only coverage check against the exact provided universe list.
   * Uses the same symbol=<SYM>/part-0.parquet naming convention as ingestion.
   * Returns { covered, gaps } where covered.size + gaps.size === unique symbols in input.
   *
   * A symbol in `gaps` is a COVERAGE_GAP (expected, not an error).
   * A bridge process failure is an INFRASTRUCTURE_ERROR (see readinessCheck / bridgeFailureCount).
   * No Python process is spawned - purely synchronous fs.existsSync calls.
   */
  static getDuckDbCoverage(symbols: string[]): { covered: Set<string>; gaps: Set<string> } {
    const covered = new Set<string>();
    const gaps = new Set<string>();
    for (const raw of symbols) {
      const sym = raw.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
      if (!sym) continue;
      const partitionPath = path.join(this.kiteParquetRoot, `symbol=${sym}`, 'part-0.parquet');
      if (fs.existsSync(partitionPath)) {
        covered.add(sym);
      } else {
        gaps.add(sym);
      }
    }
    return { covered, gaps };
  }
}
