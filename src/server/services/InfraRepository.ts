import type { Database } from 'sqlite3';
import { dbAll, dbGet, dbRun } from '../database.js';

export class InfraRepository {
  private static instance: InfraRepository;

  static getInstance(): InfraRepository {
    if (!InfraRepository.instance) InfraRepository.instance = new InfraRepository();
    return InfraRepository.instance;
  }

  // ── data_sources ────────────────────────────────────────────────────────────

  async getDataSources(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM data_sources ORDER BY reliability_tier ASC, source_id ASC');
  }

  // ── CorporateActions ────────────────────────────────────────────────────────

  async getCorporateActionsAll(db: Database, limit: number): Promise<any[]> {
    return dbAll(db, `
      SELECT * FROM CorporateActions
      ORDER BY record_date DESC, id DESC
      LIMIT ?
    `, [limit]);
  }

  // ── HistoricalPrices ────────────────────────────────────────────────────────

  async getHistoricalPricesUniverseCount(db: Database): Promise<number> {
    const rows = await dbAll<{ count: number }>(db, 'SELECT COUNT(DISTINCT symbol) as count FROM HistoricalPrices WHERE symbol IS NOT NULL');
    return rows?.[0]?.count || 0;
  }

  // ── DailyOHLCV ─────────────────────────────────────────────────────────────

  async getDailyOHLCVSymbols(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT DISTINCT symbol FROM DailyOHLCV ORDER BY symbol');
  }

  async getDailyOHLCVSymbolsForBacktest(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT DISTINCT symbol FROM DailyOHLCV GROUP BY symbol HAVING COUNT(*) >= 100 ORDER BY COUNT(*) DESC LIMIT 150');
  }

  async getCandlesForSymbol(db: Database, symbol: string): Promise<any[]> {
    return dbAll(db, 'SELECT date, open, high, low, close, volume FROM DailyOHLCV WHERE symbol = ? ORDER BY date ASC', [symbol]);
  }

  async bulkInsertDailyOHLCVRows(db: Database, rows: any[][]): Promise<number> {
    const ROW_BATCH = 400;
    let stored = 0;
    await dbRun(db, 'BEGIN TRANSACTION');
    try {
      for (let b = 0; b < rows.length; b += ROW_BATCH) {
        const slice = rows.slice(b, b + ROW_BATCH);
        const sql = `INSERT OR IGNORE INTO DailyOHLCV (symbol, trade_date, open, high, low, close, volume, data_source) VALUES ${slice.map(() => "(?,?,?,?,?,?,?,'YAHOO_FINANCE')").join(',')}`;
        await dbRun(db, sql, slice.flat());
        stored += slice.length;
      }
      await dbRun(db, 'COMMIT');
    } catch {
      await dbRun(db, 'ROLLBACK').catch(() => {});
      stored = 0;
    }
    return stored;
  }

  // ── MasterTickers ───────────────────────────────────────────────────────────

  async getMasterTickerNseEqSymbols(db: Database): Promise<any[]> {
    return dbAll(db, `SELECT symbol FROM MasterTickers WHERE exchange = 'NSE' AND segment = 'EQ' AND symbol IS NOT NULL ORDER BY symbol`);
  }

  async getMasterTickerNseEqSymbolsStrict(db: Database): Promise<any[]> {
    return dbAll(db, `SELECT symbol FROM MasterTickers WHERE exchange = 'NSE' AND segment = 'EQ' AND symbol IS NOT NULL AND symbol != '' ORDER BY symbol`);
  }

  // ── CustomStrategies ────────────────────────────────────────────────────────

  async listCustomStrategies(db: Database): Promise<any[]> {
    return dbAll(db, `
      SELECT id, name, base_template_id, description, parameters_json,
             created_at, last_backtest_at, backtest_win_rate, backtest_sharpe, backtest_total_signals
      FROM CustomStrategies
      WHERE is_active = 1
      ORDER BY updated_at DESC
    `);
  }

  async listActiveCustomStrategies(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT id, name, base_template_id, parameters_json FROM CustomStrategies WHERE is_active = 1');
  }

  async getCustomStrategyById(db: Database, id: string): Promise<any> {
    return dbGet(db, 'SELECT * FROM CustomStrategies WHERE id = ? AND is_active = 1', [id]);
  }

  async insertCustomStrategy(
    db: Database,
    id: string,
    name: string,
    baseTemplateId: string,
    description: string | null,
    parametersJson: string
  ): Promise<void> {
    await dbRun(db, `
      INSERT INTO CustomStrategies (id, name, base_template_id, description, parameters_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        base_template_id = excluded.base_template_id,
        description = excluded.description,
        parameters_json = excluded.parameters_json,
        updated_at = CURRENT_TIMESTAMP
    `, [id, name, baseTemplateId, description, parametersJson]);
  }

  async softDeleteCustomStrategy(db: Database, id: string): Promise<void> {
    await dbRun(db, 'UPDATE CustomStrategies SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  }

  async updateCustomStrategyBacktestResults(
    db: Database,
    winRate: number,
    sharpe: number,
    signals: number,
    id: string
  ): Promise<void> {
    await dbRun(db, 'UPDATE CustomStrategies SET backtest_win_rate = ?, backtest_sharpe = ?, backtest_total_signals = ?, last_backtest_at = CURRENT_TIMESTAMP WHERE id = ?', [winRate, sharpe, signals, id]);
  }

  async getCustomStrategyTableColumns(db: Database): Promise<any[]> {
    return dbAll(db, 'PRAGMA table_info(CustomStrategies)');
  }

  async addCustomStrategyColumn(db: Database, safeName: string, safeType: string): Promise<void> {
    await dbRun(db, `ALTER TABLE CustomStrategies ADD COLUMN ${safeName} ${safeType}`);
  }

  async dropCustomStrategyColumn(db: Database, columnName: string): Promise<void> {
    await dbRun(db, `ALTER TABLE CustomStrategies DROP COLUMN ${columnName}`);
  }

  // ── FnO / Options ───────────────────────────────────────────────────────────

  async getFnoOptionsMetrics(db: Database, symbol: string): Promise<any> {
    return dbGet(db, `SELECT * FROM derived_options_metrics WHERE symbol = ? ORDER BY as_of_date DESC LIMIT 1`, [symbol]);
  }

  async getFnoOptionsChain(db: Database, symbol: string): Promise<any[]> {
    return dbAll(db, `
      SELECT expiry, strike, option_type, oi, oi_change, iv, volume, ltp, as_of_date
      FROM options_chain_snapshot WHERE symbol = ?
      ORDER BY as_of_date DESC, expiry ASC, strike ASC LIMIT 200
    `, [symbol]);
  }

  // ── EventIntelligenceLog ────────────────────────────────────────────────────

  async getRecentAdverseEvents(db: Database): Promise<any[]> {
    return dbAll(db, `
      SELECT event_id, symbol, headline, event_type, materiality_score, is_adverse,
             source_url, published_at, data_source, created_at
      FROM EventIntelligenceLog
      WHERE is_adverse = 1
      ORDER BY created_at DESC
      LIMIT 50
    `);
  }

  // ── strategy_scan_metadata ──────────────────────────────────────────────────

  async getLatestScanId(db: Database): Promise<string | null> {
    const row = await dbGet<{ scan_id: string }>(db, `SELECT scan_id FROM strategy_scan_metadata ORDER BY created_at DESC LIMIT 1`);
    return row?.scan_id ?? null;
  }
}
