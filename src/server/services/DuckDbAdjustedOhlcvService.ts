import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { dbAll, getDB } from '../database.js';
import readline from 'readline';

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

export interface BridgeInvokeResult {
  success: boolean;
  source: 'DUCKDB_ADJUSTED';
  executableUsed: string;
  data: AdjustedOhlcvBar[];
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

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
}

export class DuckDbAdjustedOhlcvService {
  private static readonly catalog = path.resolve('data', 'market_data', 'tejhq_hf_10y', 'ohlcv.duckdb');
  private static readonly bridgeWorker = path.resolve('scripts', 'market_data', 'query_adjusted_ohlcv_worker.py');
  private static readonly kiteParquetRoot = path.resolve(
    'data', 'market_data', 'tejhq_hf_10y', 'kite_adjusted_backfill', 'candles'
  );
  private static readonly localPython = 'C:\\Users\\gopal\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
  private static readonly bundledPython = 'C:\\Users\\gopal\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';

  private static workerProcess: ChildProcess | null = null;
  private static requestMap = new Map<number, PendingRequest>();
  private static reqIdSeq = 1;
  private static startupPromise: Promise<void> | null = null;
  private static lastStderr = '';
  public static workerStarts = 0;

  private static getPython(): string {
    return fs.existsSync(this.localPython) ? this.localPython : this.bundledPython;
  }

  private static async ensureWorker(): Promise<void> {
    if (this.workerProcess && !this.workerProcess.killed) return;
    
    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = new Promise((resolve, reject) => {
      const python = this.getPython();
      this.workerStarts++;
      
      this.workerProcess = spawn(python, ['-u', this.bridgeWorker], {
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1' },
        cwd: path.resolve('.')
      });

      const rl = readline.createInterface({
        input: this.workerProcess.stdout!,
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        try {
          const res = JSON.parse(line);
          const req = this.requestMap.get(res.id);
          if (req) {
            clearTimeout(req.timeout);
            this.requestMap.delete(res.id);
            req.resolve(res);
          }
        } catch (e) {
          console.error('[DuckDB Worker] Invalid JSON from stdout:', line);
        }
      });

      this.workerProcess.stderr!.on('data', (data) => {
        const msg = data.toString();
        this.lastStderr += msg;
        if (this.lastStderr.length > 10000) this.lastStderr = this.lastStderr.slice(-10000);
        console.error('[DuckDB Worker ERR]', msg.trim());
      });

      this.workerProcess.on('exit', (code) => {
        console.error(`[DuckDB Worker] Exited with code ${code}`);
        this.workerProcess = null;
        this.startupPromise = null;
        const err = new Error(`Worker crashed with code ${code}. Stderr: ${this.lastStderr}`);
        for (const [id, req] of this.requestMap.entries()) {
          clearTimeout(req.timeout);
          req.reject(err);
        }
        this.requestMap.clear();
      });

      this.workerProcess.on('error', (err) => {
        reject(err);
      });

      // Quick ping to ensure it's up
      const pingId = this.reqIdSeq++;
      const timeout = setTimeout(() => {
        reject(new Error("Worker ping timeout"));
      }, 60000);

      this.requestMap.set(pingId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
        timeout
      });

      this.workerProcess.stdin!.write(JSON.stringify({ cmd: 'ping', id: pingId }) + '\n');
    });

    try {
      await this.startupPromise;
    } catch (e) {
      this.startupPromise = null;
      throw e;
    }
  }

  private static async sendCommand(cmd: any, timeoutMs: number = 120_000): Promise<any> {
    await this.ensureWorker();
    
    const id = this.reqIdSeq++;
    cmd.id = id;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requestMap.delete(id);
        reject(new Error("Worker request timeout"));
      }, timeoutMs);
      
      this.requestMap.set(id, { resolve, reject, timeout });
      
      if (!this.workerProcess || !this.workerProcess.stdin) {
        reject(new Error("Worker not available"));
        return;
      }
      
      try {
        this.workerProcess.stdin.write(JSON.stringify(cmd) + '\n');
      } catch (err) {
        reject(err);
      }
    });
  }

  static async invokeForSymbol(
    symbol: string,
    limit: number,
    fromDate = '1900-01-01',
    toDate = '2999-12-31'
  ): Promise<BridgeInvokeResult> {
    const python = this.getPython();
    const clean = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    try {
      const res = await this.sendCommand({
        cmd: 'query',
        symbols: [clean],
        limit,
        fromDate,
        toDate
      });
      
      if (res.ok) {
        return { success: true, source: 'DUCKDB_ADJUSTED', executableUsed: python, data: res.rows || [] };
      } else {
        return {
          success: false, source: 'DUCKDB_ADJUSTED', executableUsed: python, data: [],
          error: { message: res.error, exitCode: null, stderr: this.lastStderr, catalogPath: this.catalog, symbolQueried: clean }
        };
      }
    } catch (err: any) {
      return {
        success: false, source: 'DUCKDB_ADJUSTED', executableUsed: python, data: [],
        error: { message: err?.message || String(err), exitCode: null, stderr: this.lastStderr, catalogPath: this.catalog, symbolQueried: clean }
      };
    }
  }

  static async getDailyBars(symbol: string, limit: number): Promise<AdjustedOhlcvBar[] | null> {
    const { bars } = await this.getDailyBarsForSymbols([symbol], limit);
    const safeSymbol = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    return bars.get(safeSymbol) || null;
  }

  static async getDailyBarsForSymbols(
    symbols: string[],
    limit: number
  ): Promise<{ bars: Map<string, AdjustedOhlcvBar[]>; bridgeFailureCount: number }> {
    const bars = new Map<string, AdjustedOhlcvBar[]>();
    const safeSymbols = [...new Set(
      symbols.map(s => s.trim().toUpperCase().replace(/\.(NS|BO)$/, '')).filter(s => /^[A-Z0-9_-]+$/.test(s))
    )];
    
    if (!safeSymbols.length) return { bars, bridgeFailureCount: 0 };
    
    try {
      const res = await this.sendCommand({
        cmd: 'query',
        symbols: safeSymbols,
        limit
      }, 120_000);
      
      if (!res.ok) {
        console.warn('[DuckDB OHLCV] Batch worker returned error:', res.error);
        return { bars, bridgeFailureCount: 1 };
      }
      
      const rows = res.rows || [];
      for (const row of rows) {
        const key = String(row.symbol || '').toUpperCase();
        if (!bars.has(key)) bars.set(key, []);
        bars.get(key)!.push(row);
      }
      return { bars, bridgeFailureCount: 0 };
    } catch (err: any) {
      console.warn('[DuckDB OHLCV] Batch worker exception:', err?.message || String(err));
      return { bars, bridgeFailureCount: 1 };
    }
  }

  static async getDailyBarsWithSource(symbol: string, limit: number): Promise<OhlcvReadResult> {
    const bars = await this.getDailyBars(symbol, limit);
    return bars?.length ? { bars, source: 'DUCKDB_ADJUSTED' } : { bars: [], source: 'UNAVAILABLE' };
  }

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

  static async readinessCheck(symbol = 'TCS'): Promise<DuckDbReadinessResult> {
    const python = this.getPython();
    const t0 = Date.now();
    const clean = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
    try {
      const res = await this.sendCommand({
        cmd: 'query',
        symbols: [clean],
        limit: 1
      }, 60_000);
      
      const bars = res.rows || [];
      return { 
        ok: res.ok && bars.length > 0, 
        executableUsed: python, 
        bars, 
        barsReturned: bars.length,
        stderr: this.lastStderr, 
        durationMs: Date.now() - t0, 
        catalogPath: this.catalog,
        error: res.error
      };
    } catch (err: any) {
      return { 
        ok: false, 
        executableUsed: python, 
        bars: [], 
        barsReturned: 0,
        stderr: this.lastStderr || err?.message,
        durationMs: Date.now() - t0, 
        catalogPath: this.catalog, 
        error: err?.message || String(err) 
      };
    }
  }

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
