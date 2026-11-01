import type { Database } from 'sqlite3';
import { dbAll, dbRun } from '../database.js';

export class QuantRepository {
  private static instance: QuantRepository;
  static getInstance(): QuantRepository {
    if (!QuantRepository.instance) QuantRepository.instance = new QuantRepository();
    return QuantRepository.instance;
  }

  insertPaperTrade(db: Database, id: string, symbol: string, companyName: string, strategyIds: any, gateSnapshot: any, entryDate: string, entryPrice: any, stopLoss: any, target1: any, target2: any, positionSize: any, positionInr: any, notes: any): Promise<void> {
    return dbRun(
      db,
      `INSERT INTO paper_trades (id, symbol, company_name, strategy_ids, gate_snapshot, entry_date, entry_price, stop_loss, target_1, target_2, position_size, position_inr, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      [id, symbol, companyName, strategyIds, gateSnapshot, entryDate, entryPrice, stopLoss, target1, target2, positionSize, positionInr, notes]
    );
  }

  listPaperTrades(db: Database): Promise<any[]> {
    return dbAll<any>(db, `SELECT * FROM paper_trades ORDER BY created_at DESC`);
  }

  updatePaperTrade(db: Database, id: string, status: any, exitDate: string, exitPrice: any, pnlPct: any, pnlInr: any, holdingDays: any, maxGainPct: any, maxLossPct: any, verdict: any, notes: any): Promise<void> {
    return dbRun(
      db,
      `UPDATE paper_trades SET status = ?, exit_date = ?, exit_price = ?, pnl_pct = ?, pnl_inr = ?, holding_days = ?, max_gain_pct = ?, max_loss_pct = ?, verdict = ?, notes = ? WHERE id = ?`,
      [status, exitDate, exitPrice, pnlPct, pnlInr, holdingDays, maxGainPct, maxLossPct, verdict, notes, id]
    );
  }

  insertFunnelPreset(db: Database, id: string, name: string, strategyIdsJson: any, gateConfigJson: any): Promise<void> {
    return dbRun(
      db,
      `INSERT INTO funnel_presets (id, name, strategy_ids_json, gate_config_json) VALUES (?, ?, ?, ?)`,
      [id, name, strategyIdsJson, gateConfigJson]
    );
  }

  listFunnelPresets(db: Database): Promise<any[]> {
    return dbAll<any>(db, `SELECT * FROM funnel_presets ORDER BY created_at DESC`);
  }

  getDailyOhlcv(db: Database, symbol: string): Promise<any[]> {
    return dbAll<any>(
      db,
      `SELECT trade_date as date, open, high, low, close, volume FROM DailyOHLCV WHERE symbol = ? ORDER BY trade_date ASC`,
      [symbol]
    );
  }

  getDistinctDailyOhlcvSymbols(db: Database): Promise<any[]> {
    return dbAll<any>(db, `SELECT DISTINCT symbol FROM DailyOHLCV ORDER BY symbol ASC`);
  }
}
