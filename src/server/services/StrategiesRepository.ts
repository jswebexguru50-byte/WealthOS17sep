import type { Database } from 'sqlite3';
import { dbAll, dbGet, dbRun } from '../database.js';

export class StrategiesRepository {
  private static instance: StrategiesRepository;
  static getInstance(): StrategiesRepository {
    if (!StrategiesRepository.instance) StrategiesRepository.instance = new StrategiesRepository();
    return StrategiesRepository.instance;
  }

  listAll(db: Database): Promise<any[]> {
    return dbAll<any>(
      db,
      `SELECT id, name, short_name, description, category,
         is_preset, preset_order, color_accent,
         is_active, parameters_json, base_template_id,
         last_backtest_at, backtest_win_rate, backtest_sharpe, backtest_total_signals
       FROM CustomStrategies
       ORDER BY is_preset DESC, preset_order ASC, created_at DESC`
    );
  }

  findById(db: Database, id: string): Promise<any> {
    return dbGet<any>(db, `SELECT * FROM CustomStrategies WHERE id = ?`, [id]);
  }

  findByNameExcluding(db: Database, name: string, excludeId: string): Promise<any> {
    return dbGet<any>(db, `SELECT id FROM CustomStrategies WHERE name = ? AND id != ?`, [name, excludeId]);
  }

  findByName(db: Database, name: string): Promise<any> {
    return dbGet<any>(db, `SELECT id FROM CustomStrategies WHERE name = ?`, [name]);
  }

  update(db: Database, id: string, name: string, description: string, category: string, parametersJson: string, now: string): Promise<void> {
    return dbRun(
      db,
      `UPDATE CustomStrategies SET name = ?, description = ?, category = ?, parameters_json = ?, updated_at = ? WHERE id = ?`,
      [name, description, category, parametersJson, now, id]
    );
  }

  insert(db: Database, id: string, name: string, description: string, category: string, parametersJson: string, baseTemplateId: string, now: string): Promise<void> {
    return dbRun(
      db,
      `INSERT INTO CustomStrategies (id, name, description, category, parameters_json, base_template_id, is_preset, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
      [id, name, description, category, parametersJson, baseTemplateId, now, now]
    );
  }

  insertClone(db: Database, newId: string, finalName: string, shortName: string, description: string, category: string, parametersJson: string, baseTemplateId: string, colorAccent: string, now: string): Promise<void> {
    return dbRun(
      db,
      `INSERT INTO CustomStrategies (id, name, short_name, description, category, parameters_json, base_template_id, is_preset, preset_order, color_accent, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, 1, ?, ?)`,
      [newId, finalName, shortName, description, category, parametersJson, baseTemplateId, colorAccent, now, now]
    );
  }

  deleteRunResults(db: Database, id: string): Promise<void> {
    return dbRun(db, `DELETE FROM strategy_run_results WHERE strategy_id = ?`, [id]);
  }

  delete(db: Database, id: string): Promise<void> {
    return dbRun(db, `DELETE FROM CustomStrategies WHERE id = ?`, [id]);
  }

  findByIds(db: Database, ids: string[]): Promise<any[]> {
    const placeholders = ids.map(() => '?').join(',');
    return dbAll<any>(
      db,
      `SELECT id, name, short_name, parameters_json FROM CustomStrategies WHERE id IN (${placeholders}) AND is_active = 1`,
      ids
    );
  }
}
