import type { Database } from 'sqlite3';
import { dbAll, dbGet, dbRun } from '../database.js';

export class SettingsRepository {
  private static instance: SettingsRepository;
  static getInstance(): SettingsRepository {
    if (!SettingsRepository.instance) SettingsRepository.instance = new SettingsRepository();
    return SettingsRepository.instance;
  }

  getAllConfig(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT key, value FROM AppConfig');
  }

  upsertConfig(db: Database, key: string, value: string): Promise<any> {
    return dbRun(db, 'INSERT OR REPLACE INTO AppConfig (key, value) VALUES (?, ?)', [key, value]);
  }

  getTickers(db: Database, search?: string): Promise<any[]> {
    let sql = 'SELECT * FROM MasterTickers';
    const params: any[] = [];
    if (search) {
      sql += ' WHERE symbol LIKE ? OR isin LIKE ? OR name LIKE ?';
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    sql += ' ORDER BY symbol ASC LIMIT 500';
    return dbAll(db, sql, params);
  }

  findTickerById(db: Database, id: number): Promise<any> {
    return dbGet(db, 'SELECT symbol, isin FROM MasterTickers WHERE id = ?', [id]);
  }

  remapTransactionsToTicker(db: Database, targetSymbol: string, targetIsin: string, sourceSymbol: string, sourceIsin: string): Promise<any> {
    return dbRun(db, 'UPDATE Transactions SET symbol=?, isin=? WHERE symbol=? OR isin=?', [targetSymbol, targetIsin, sourceSymbol, sourceIsin]);
  }

  remapHoldingsToTicker(db: Database, targetSymbol: string, targetIsin: string, sourceSymbol: string, sourceIsin: string): Promise<any> {
    return dbRun(db, 'UPDATE Holdings SET symbol=?, isin=? WHERE symbol=? OR isin=?', [targetSymbol, targetIsin, sourceSymbol, sourceIsin]);
  }

  deleteTicker(db: Database, id: number): Promise<any> {
    return dbRun(db, 'DELETE FROM MasterTickers WHERE id = ?', [id]);
  }

  upsertTicker(db: Database, fields: {
    isin: string; symbol: string; name: string; exchange: string;
    segment: string; sector: string; manual_ltp: any; fmv_31_jan_2018: any;
  }): Promise<any> {
    return dbRun(db, `
      INSERT INTO MasterTickers (isin, symbol, name, exchange, segment, sector, last_price, fmv_31_jan_2018)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(isin) DO UPDATE SET
        symbol = excluded.symbol,
        name = COALESCE(excluded.name, MasterTickers.name),
        exchange = COALESCE(excluded.exchange, MasterTickers.exchange),
        segment = COALESCE(excluded.segment, MasterTickers.segment),
        sector = COALESCE(excluded.sector, MasterTickers.sector),
        last_price = COALESCE(excluded.last_price, MasterTickers.last_price),
        fmv_31_jan_2018 = COALESCE(excluded.fmv_31_jan_2018, MasterTickers.fmv_31_jan_2018)
    `, [fields.isin, fields.symbol, fields.name || fields.symbol, fields.exchange || 'NSE', fields.segment || 'EQ', fields.sector || '', fields.manual_ltp || null, fields.fmv_31_jan_2018 || null]);
  }

  updateTicker(db: Database, id: number, fields: {
    symbol: any; name: any; exchange: any; segment: any;
    sector: any; manual_ltp: any; fmv_31_jan_2018: any;
  }): Promise<any> {
    return dbRun(db, `
      UPDATE MasterTickers SET
        symbol = COALESCE(?, symbol), name = COALESCE(?, name), exchange = COALESCE(?, exchange),
        segment = COALESCE(?, segment), sector = COALESCE(?, sector),
        last_price = COALESCE(?, last_price), fmv_31_jan_2018 = COALESCE(?, fmv_31_jan_2018),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [fields.symbol, fields.name, fields.exchange, fields.segment, fields.sector, fields.manual_ltp, fields.fmv_31_jan_2018, id]);
  }

  getUserMappings(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM UserMappings ORDER BY raw_name ASC');
  }
}
