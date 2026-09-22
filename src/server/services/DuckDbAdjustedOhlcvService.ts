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

/** Read-only bridge to the permanent local DuckDB/Parquet candle catalog. */
export class DuckDbAdjustedOhlcvService {
  private static readonly catalog = path.resolve('data', 'market_data', 'tejhq_hf_10y', 'ohlcv.duckdb');
  private static readonly bridge = path.resolve('scripts', 'market_data', 'query_adjusted_ohlcv.py');
  private static readonly bundledPython = 'C:\\Users\\gopal\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';

  static async getDailyBars(symbol: string, limit: number): Promise<AdjustedOhlcvBar[] | null> {
    const result = await this.getDailyBarsForSymbols([symbol], limit);
    const safeSymbol = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    return result.get(safeSymbol) || null;
  }

  /** Bounded batch bridge; avoids a Python/DuckDB process per symbol for strategy scans. */
  static async getDailyBarsForSymbols(symbols: string[], limit: number): Promise<Map<string, AdjustedOhlcvBar[]>> {
    const result = new Map<string, AdjustedOhlcvBar[]>();
    if (!fs.existsSync(this.catalog) || !fs.existsSync(this.bridge)) return result;
    const safeSymbols = [...new Set(symbols.map(symbol => symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '')).filter(symbol => /^[A-Z0-9_-]+$/.test(symbol)))];
    if (!safeSymbols.length || safeSymbols.length > 500) return result;
    try {
      const packagePath = path.resolve('.tools', 'hf_ohlcv_env');
      const python = process.env.PYTHON_EXECUTABLE || (fs.existsSync(this.bundledPython) ? this.bundledPython : 'python');
      const { stdout } = await execFileAsync(python, [
        this.bridge, '--symbols', safeSymbols.join(','), '--limit', String(Math.min(Math.max(limit, 1), 10_000))
      ], {
        timeout: 30_000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, PYTHONPATH: [packagePath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) }
      });
      const rows = JSON.parse(stdout);
      for (const row of Array.isArray(rows) ? rows : []) {
        const key = String(row.symbol || '').toUpperCase();
        if (!result.has(key)) result.set(key, []);
        result.get(key)!.push(row);
      }
      return result;
    } catch (error: any) {
      // The app remains operational with its existing live-data fallbacks.
      console.warn('[DuckDB OHLCV] Local catalog read unavailable:', error?.message || error);
      return result;
    }
  }

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
         ORDER BY trade_date DESC LIMIT ?`, [clean, `${clean}.NS`, `${clean}.BO`, Math.min(Math.max(limit, 1), 10_000)]);
      const bars = (rows || []).filter(r => Number(r.close) > 0).map(r => ({
        trade_date: String(r.trade_date), symbol: clean, open_adjusted: Number(r.open || r.close),
        high_adjusted: Number(r.high || r.close), low_adjusted: Number(r.low || r.close),
        close_adjusted: Number(r.close), volume_raw: Number(r.volume || 0),
        data_source: `SQLITE_LEGACY_FALLBACK:${r.data_source || 'UNKNOWN'}`
      }));
      return bars.length ? { bars, source: 'SQLITE_LEGACY_FALLBACK' } : primary;
    } catch {
      return primary;
    }
  }
}
