import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

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
    if (!fs.existsSync(this.catalog) || !fs.existsSync(this.bridge)) return null;
    const safeSymbol = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    if (!/^[A-Z0-9_-]+$/.test(safeSymbol)) return null;
    try {
      const packagePath = path.resolve('.tools', 'hf_ohlcv_env');
      const python = process.env.PYTHON_EXECUTABLE || (fs.existsSync(this.bundledPython) ? this.bundledPython : 'python');
      const { stdout } = await execFileAsync(python, [
        this.bridge, '--symbol', safeSymbol, '--limit', String(Math.min(Math.max(limit, 1), 10_000))
      ], {
        timeout: 30_000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, PYTHONPATH: [packagePath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) }
      });
      const rows = JSON.parse(stdout);
      return Array.isArray(rows) ? rows : null;
    } catch (error: any) {
      // The app remains operational with its existing live-data fallbacks.
      console.warn('[DuckDB OHLCV] Local catalog read unavailable:', error?.message || error);
      return null;
    }
  }

  /** Provenance-bearing canonical result for API/UI callers. */
  static async getDailyBarsWithSource(symbol: string, limit: number): Promise<OhlcvReadResult> {
    const bars = await this.getDailyBars(symbol, limit);
    return bars?.length ? { bars, source: 'DUCKDB_ADJUSTED' } : { bars: [], source: 'UNAVAILABLE' };
  }
}
