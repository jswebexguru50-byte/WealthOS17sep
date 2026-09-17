import { getDB, dbRun, dbAll, dbGet } from '../database.js';

interface PipelineRunSummary {
  runDate: string;
  startedAt: string;
  completedAt?: string;
  status: 'RUNNING' | 'COMPLETE' | 'FAILED';
  bhavcopySymbols: number;
  upstoxFilled: number;
  yahooFilled: number;
  totalSymbolsCovered: number;
  qualityIssues: number;
  durationMs?: number;
}

interface QualityIssue {
  symbol: string;
  tradeDate: string;
  issueType: 'PRICE_JUMP' | 'INVALID_OHLC' | 'ZERO_VOLUME' | 'MISSING_DAY';
  detail: string;
}

interface DataQualityReport {
  symbol: string;
  totalBars: number;
  oldestDate: string;
  newestDate: string;
  dataSources: Record<string, number>;
  missingDays: number;
  priceJumps: number;
  invalidOHLC: number;
  completenessPercent: number;
}

export class DailyEODPipelineService {
  private static instance: DailyEODPipelineService;
  private static pipelineStatus: PipelineRunSummary | null = null;

  public static getInstance(): DailyEODPipelineService {
    if (!DailyEODPipelineService.instance) {
      DailyEODPipelineService.instance = new DailyEODPipelineService();
    }
    return DailyEODPipelineService.instance;
  }

  public static getPipelineStatus(): PipelineRunSummary | null {
    return DailyEODPipelineService.pipelineStatus;
  }

  public async initializeDatabase(): Promise<void> {
    const db = getDB();
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS PipelineRunLog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_date TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL DEFAULT 'RUNNING',
        bhavcopy_symbols INTEGER DEFAULT 0,
        upstox_filled INTEGER DEFAULT 0,
        yahoo_filled INTEGER DEFAULT 0,
        total_symbols INTEGER DEFAULT 0,
        quality_issues INTEGER DEFAULT 0,
        duration_ms INTEGER,
        error_message TEXT
      )
    `);

    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS DataQualityIssues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        issue_type TEXT NOT NULL,
        detail TEXT,
        detected_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved INTEGER DEFAULT 0
      )
    `);

    try {
      await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_dqi_symbol ON DataQualityIssues(symbol)`);
      await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_dqi_type ON DataQualityIssues(issue_type)`);
    } catch {}
  }

  /**
   * Run the full daily EOD pipeline:
   * 1. Fetch Bhavcopy from NSE for today
   * 2. Fill gaps with Upstox
   * 3. Fill remaining gaps with Yahoo
   * 4. Run quality checks
   */
  public async runDailyPipeline(targetDate?: string): Promise<PipelineRunSummary> {
    await this.initializeDatabase();

    const runDate = targetDate || new Date().toISOString().split('T')[0];
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    const summary: PipelineRunSummary = {
      runDate,
      startedAt,
      status: 'RUNNING',
      bhavcopySymbols: 0,
      upstoxFilled: 0,
      yahooFilled: 0,
      totalSymbolsCovered: 0,
      qualityIssues: 0
    };
    DailyEODPipelineService.pipelineStatus = summary;

    const db = getDB();
    const logRow = await dbRun(db, `
      INSERT INTO PipelineRunLog (run_date, started_at, status) VALUES (?, ?, 'RUNNING')
    `, [runDate, startedAt]);
    const logId = (logRow as any)?.lastID;

    try {
      // Stage 1: NSE Bhavcopy
      const bhavcopyCount = await this.stageBhavcopy(runDate);
      summary.bhavcopySymbols = bhavcopyCount;

      // Stage 2: Identify missing symbols and fill from Upstox
      const allUniverse = await this.getUniverseSymbols();
      const coveredSymbols = await this.getSymbolsCoveredForDate(runDate);
      const missing = allUniverse.filter(s => !coveredSymbols.has(s));

      if (missing.length > 0) {
        summary.upstoxFilled = await this.stageUpstoxFill(missing, runDate);
      }

      // Stage 3: Yahoo fallback for still-missing
      const stillCovered = await this.getSymbolsCoveredForDate(runDate);
      const stillMissing = allUniverse.filter(s => !stillCovered.has(s));
      if (stillMissing.length > 0 && stillMissing.length <= 200) {
        summary.yahooFilled = await this.stageYahooFill(stillMissing);
      }

      // Stage 4: Quality checks
      summary.qualityIssues = await this.runQualityChecks(runDate);

      const finalCovered = await this.getSymbolsCoveredForDate(runDate);
      summary.totalSymbolsCovered = finalCovered.size;
      summary.status = 'COMPLETE';
      summary.completedAt = new Date().toISOString();
      summary.durationMs = Date.now() - startTime;

      await dbRun(db, `
        UPDATE PipelineRunLog SET
          status = 'COMPLETE', completed_at = ?, bhavcopy_symbols = ?,
          upstox_filled = ?, yahoo_filled = ?, total_symbols = ?,
          quality_issues = ?, duration_ms = ?
        WHERE id = ?
      `, [summary.completedAt, summary.bhavcopySymbols, summary.upstoxFilled,
          summary.yahooFilled, summary.totalSymbolsCovered, summary.qualityIssues,
          summary.durationMs, logId]);

      console.log(`[EOD Pipeline] Complete for ${runDate}: ${summary.totalSymbolsCovered} symbols, ${summary.qualityIssues} quality issues, ${summary.durationMs}ms`);
    } catch (err: any) {
      summary.status = 'FAILED';
      summary.completedAt = new Date().toISOString();
      summary.durationMs = Date.now() - startTime;
      await dbRun(db, `UPDATE PipelineRunLog SET status = 'FAILED', completed_at = ?, error_message = ?, duration_ms = ? WHERE id = ?`,
        [summary.completedAt, err.message, summary.durationMs, logId]);
      console.error(`[EOD Pipeline] Failed for ${runDate}:`, err.message);
    }

    DailyEODPipelineService.pipelineStatus = summary;
    return summary;
  }

  private async stageBhavcopy(runDate: string): Promise<number> {
    try {
      const { NseBhavcopyService } = await import('./NseBhavcopyService.js');
      const service = NseBhavcopyService.getInstance();
      const result = await service.backfillHistoricalData(runDate, runDate);
      return result.totalRows || 0;
    } catch (err: any) {
      console.warn(`[EOD Pipeline] Bhavcopy stage failed for ${runDate}: ${err.message}`);
      return 0;
    }
  }

  private async stageUpstoxFill(symbols: string[], runDate: string): Promise<number> {
    try {
      const { MarketDataIngestorService } = await import('./MarketDataIngestorService.js');
      const ingestor = MarketDataIngestorService.getInstance();
      const result = await ingestor.backfillFromUpstox(symbols, 5);
      return result.totalStored;
    } catch (err: any) {
      console.warn(`[EOD Pipeline] Upstox fill failed: ${err.message}`);
      return 0;
    }
  }

  private async stageYahooFill(symbols: string[]): Promise<number> {
    let filled = 0;
    try {
      const { fetchTickerData } = await import('../yahooFinance.js');
      const db = getDB();

      for (let i = 0; i < symbols.length; i++) {
        try {
          const data = await fetchTickerData(symbols[i], 5, false);
          if (data?.closePrices?.length > 0) {
            for (const cp of data.closePrices) {
              if (cp.close > 0 && cp.volume > 0) {
                await dbRun(db, `
                  INSERT OR IGNORE INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'YAHOO')
                `, [symbols[i], cp.date, cp.open ?? cp.close, cp.high ?? cp.close, cp.low ?? cp.close, cp.close, cp.volume]);
                filled++;
              }
            }
          }
        } catch {}
        if (i % 10 === 9) await new Promise(r => setTimeout(r, 200));
      }
    } catch {}
    return filled;
  }

  private async getUniverseSymbols(): Promise<string[]> {
    const db = getDB();
    try {
      const rows = await dbAll(db, `
        SELECT DISTINCT symbol FROM DailyOHLCV
        UNION
        SELECT DISTINCT symbol FROM MasterTickers WHERE exchange = 'NSE' AND segment = 'EQ'
      `);
      return (rows || []).map((r: any) => r.symbol).filter(Boolean);
    } catch {
      const rows = await dbAll(db, `SELECT DISTINCT symbol FROM DailyOHLCV`);
      return (rows || []).map((r: any) => r.symbol).filter(Boolean);
    }
  }

  private async getSymbolsCoveredForDate(tradeDate: string): Promise<Set<string>> {
    const db = getDB();
    const rows = await dbAll(db, `SELECT DISTINCT symbol FROM DailyOHLCV WHERE trade_date = ?`, [tradeDate]);
    return new Set((rows || []).map((r: any) => r.symbol));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // QUALITY CHECKS
  // ─────────────────────────────────────────────────────────────────────────────

  private async runQualityChecks(runDate: string): Promise<number> {
    const db = getDB();
    let issueCount = 0;

    // Check 1: Invalid OHLC relationship (low > open or low > close, high < open or high < close)
    const invalidOHLC: any[] = await dbAll(db, `
      SELECT symbol, trade_date, open, high, low, close
      FROM DailyOHLCV
      WHERE trade_date = ? AND (low > open OR low > close OR high < open OR high < close)
    `, [runDate]);

    for (const row of invalidOHLC) {
      await this.logQualityIssue(row.symbol, row.trade_date, 'INVALID_OHLC',
        `O=${row.open} H=${row.high} L=${row.low} C=${row.close}`);
      issueCount++;
    }

    // Check 2: Suspicious price jumps (>50% in a single day)
    const todayRows: any[] = await dbAll(db, `
      SELECT d.symbol, d.trade_date, d.close, d.prev_close,
        (SELECT d2.close FROM DailyOHLCV d2
         WHERE d2.symbol = d.symbol AND d2.trade_date < d.trade_date
         ORDER BY d2.trade_date DESC LIMIT 1) as prev_day_close
      FROM DailyOHLCV d
      WHERE d.trade_date = ? AND d.close > 0
    `, [runDate]);

    for (const row of todayRows) {
      const prevClose = row.prev_close || row.prev_day_close;
      if (prevClose && prevClose > 0) {
        const changePct = Math.abs((row.close - prevClose) / prevClose) * 100;
        if (changePct > 50) {
          await this.logQualityIssue(row.symbol, row.trade_date, 'PRICE_JUMP',
            `${changePct.toFixed(1)}% change: ${prevClose} → ${row.close}`);
          issueCount++;
        }
      }
    }

    // Check 3: Zero volume
    const zeroVol: any[] = await dbAll(db, `
      SELECT symbol, trade_date FROM DailyOHLCV
      WHERE trade_date = ? AND (volume IS NULL OR volume = 0) AND close > 0
    `, [runDate]);

    for (const row of zeroVol) {
      await this.logQualityIssue(row.symbol, row.trade_date, 'ZERO_VOLUME', 'Volume is 0 or null');
      issueCount++;
    }

    // Check 4: Gate 3 - Circuit Locked / Zero Range (High == Low == Close)
    const circuitLocked: any[] = await dbAll(db, `
      SELECT symbol, trade_date, open, high, low, close, volume
      FROM DailyOHLCV
      WHERE trade_date = ? AND high = low AND open = close AND close > 0
    `, [runDate]);

    for (const row of circuitLocked) {
      await this.logQualityIssue(row.symbol, row.trade_date, 'CIRCUIT_LOCKED',
        `Locked bar: O=H=L=C=${row.close} (Zero Range)`);
      issueCount++;
    }

    // Check 5: Gate 4 - Illiquidity Trap (Daily Turnover < 25 Lakhs)
    const illiquidRows: any[] = await dbAll(db, `
      SELECT symbol, trade_date, close, volume, (close * volume) as turnover
      FROM DailyOHLCV
      WHERE trade_date = ? AND (close * volume) < 2500000 AND volume > 0
    `, [runDate]);

    for (const row of illiquidRows) {
      await this.logQualityIssue(row.symbol, row.trade_date, 'ILLIQUID_TRAP',
        `Daily turnover ₹${(Number(row.turnover) / 100000).toFixed(2)} Lakhs (< ₹25 Lakhs institutional threshold)`);
      issueCount++;
    }

    return issueCount;
  }

  /**
   * Institutional Corporate Action Adjustment Pipeline (Splits, Bonuses, Super-Dividends)
   * Retroactively adjusts historical OHLCV data prior to ex_date so indicators don't distort.
   */
  public async applyCorporateActionAdjustment(
    symbol: string,
    exDate: string,
    actionType: 'SPLIT' | 'BONUS' | 'SUPER_DIVIDEND',
    ratioFactor: number,
    dividendAmount?: number
  ): Promise<{ rowsAdjusted: number; status: string }> {
    const db = getDB();
    let rowsAdjusted = 0;

    if (actionType === 'SPLIT' || actionType === 'BONUS') {
      if (ratioFactor <= 0 || ratioFactor === 1.0) {
        return { rowsAdjusted: 0, status: 'SKIPPED_INVALID_FACTOR' };
      }

      // Price scales down by factor, Volume scales up by factor
      const res: any = await dbRun(db, `
        UPDATE DailyOHLCV
        SET
          open = ROUND(open / ?, 2),
          high = ROUND(high / ?, 2),
          low = ROUND(low / ?, 2),
          close = ROUND(close / ?, 2),
          prev_close = ROUND(prev_close / ?, 2),
          volume = ROUND(volume * ?)
        WHERE symbol = ? AND trade_date < ?
      `, [ratioFactor, ratioFactor, ratioFactor, ratioFactor, ratioFactor, ratioFactor, symbol, exDate]);

      rowsAdjusted = res?.changes || 0;
    } else if (actionType === 'SUPER_DIVIDEND' && dividendAmount && dividendAmount > 0) {
      // Deduct cash dividend from prior close/open/high/low
      const res: any = await dbRun(db, `
        UPDATE DailyOHLCV
        SET
          open = MAX(0.05, ROUND(open - ?, 2)),
          high = MAX(0.05, ROUND(high - ?, 2)),
          low = MAX(0.05, ROUND(low - ?, 2)),
          close = MAX(0.05, ROUND(close - ?, 2)),
          prev_close = MAX(0.05, ROUND(prev_close - ?, 2))
        WHERE symbol = ? AND trade_date < ?
      `, [dividendAmount, dividendAmount, dividendAmount, dividendAmount, dividendAmount, symbol, exDate]);

      rowsAdjusted = res?.changes || 0;
    }

    return {
      rowsAdjusted,
      status: `SUCCESS_ADJUSTED_${actionType}_FACTOR_${ratioFactor}`,
    };
  }

  private async logQualityIssue(symbol: string, tradeDate: string, issueType: string, detail: string): Promise<void> {
    const db = getDB();
    try {
      await dbRun(db, `
        INSERT INTO DataQualityIssues (symbol, trade_date, issue_type, detail)
        VALUES (?, ?, ?, ?)
      `, [symbol, tradeDate, issueType, detail]);
    } catch {}
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA QUALITY REPORT
  // ─────────────────────────────────────────────────────────────────────────────

  public async getDataQualityReport(symbol: string): Promise<DataQualityReport> {
    const db = getDB();

    const stats: any = await dbGet(db, `
      SELECT
        COUNT(*) as totalBars,
        MIN(trade_date) as oldestDate,
        MAX(trade_date) as newestDate
      FROM DailyOHLCV WHERE symbol = ?
    `, [symbol]);

    const sources: any[] = await dbAll(db, `
      SELECT data_source, COUNT(*) as cnt
      FROM DailyOHLCV WHERE symbol = ?
      GROUP BY data_source
    `, [symbol]);

    const dataSources: Record<string, number> = {};
    for (const s of sources) {
      dataSources[s.data_source || 'UNKNOWN'] = s.cnt;
    }

    const issues: any[] = await dbAll(db, `
      SELECT issue_type, COUNT(*) as cnt
      FROM DataQualityIssues WHERE symbol = ? AND resolved = 0
      GROUP BY issue_type
    `, [symbol]);

    let priceJumps = 0, invalidOHLC = 0, missingDays = 0;
    for (const i of issues) {
      if (i.issue_type === 'PRICE_JUMP') priceJumps = i.cnt;
      if (i.issue_type === 'INVALID_OHLC') invalidOHLC = i.cnt;
      if (i.issue_type === 'MISSING_DAY') missingDays = i.cnt;
    }

    // Estimate completeness: trading days between oldest and newest
    const oldest = new Date(stats.oldestDate || '2024-01-01');
    const newest = new Date(stats.newestDate || new Date().toISOString().split('T')[0]);
    const diffDays = Math.ceil((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));
    const expectedTradingDays = Math.round(diffDays * 5 / 7);
    const completenessPercent = expectedTradingDays > 0
      ? Math.min(100, Math.round((stats.totalBars / expectedTradingDays) * 100))
      : 0;

    return {
      symbol,
      totalBars: stats.totalBars || 0,
      oldestDate: stats.oldestDate || '',
      newestDate: stats.newestDate || '',
      dataSources,
      missingDays,
      priceJumps,
      invalidOHLC,
      completenessPercent
    };
  }
}
