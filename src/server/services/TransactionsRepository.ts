import type { Database } from 'sqlite3';
import { dbAll, dbGet, dbRun } from '../database.js';

export class TransactionsRepository {
  private static instance: TransactionsRepository;
  static getInstance(): TransactionsRepository {
    if (!TransactionsRepository.instance) TransactionsRepository.instance = new TransactionsRepository();
    return TransactionsRepository.instance;
  }

  countTransactions(db: Database, baseQuery: string, params: any[]): Promise<any> {
    return dbGet(db, `SELECT COUNT(*) as count ${baseQuery}`, params);
  }

  getTransactions(db: Database, selectClause: string, baseQuery: string, orderClause: string, limit: number, offset: number, params: any[]): Promise<any[]> {
    return dbAll(db, `${selectClause} ${baseQuery} ORDER BY ${orderClause} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  }

  findTickerBySymbolOrIsin(db: Database, symbol: string, isin: string): Promise<any> {
    return dbGet(db, 'SELECT isin, symbol FROM MasterTickers WHERE symbol = ? OR isin = ?', [symbol, isin]);
  }

  findIsinBySymbol(db: Database, symbol: string): Promise<any> {
    return dbGet(db, 'SELECT isin FROM MasterTickers WHERE symbol = ? AND isin IS NOT NULL AND isin != "" AND NOT isin LIKE "CUSTOM_%"', [symbol]);
  }

  insertMutualFundTicker(db: Database, isin: string, symbol: string): Promise<any> {
    return dbRun(db, `INSERT OR IGNORE INTO MasterTickers (isin, symbol, name, exchange, segment, sector) VALUES (?, ?, ?, 'MUTUAL_FUND', 'MF', 'Mutual Funds')`, [isin, symbol, symbol]);
  }

  insertTransaction(db: Database, fields: {
    date: any; portfolio: any; type: any; isin: string; symbol: string;
    quantity: any; price: any; gross_amount: any; brokerage: any; net_amount: any;
    notes: any; isCashFlow: number; broker_name: any; account_number: any; folio: any;
  }): Promise<any> {
    return dbRun(db, `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, brokerage, net_amount, notes, is_cash_flow, broker_name, account_number, folio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fields.date, fields.portfolio, fields.type, fields.isin, fields.symbol, fields.quantity, fields.price, fields.gross_amount, fields.brokerage, fields.net_amount, fields.notes, fields.isCashFlow, fields.broker_name, fields.account_number, fields.folio]);
  }

  findTickerBySymbolOrName(db: Database, symbol: string): Promise<any> {
    return dbGet(db, 'SELECT isin, symbol FROM MasterTickers WHERE symbol = ? OR name = ?', [symbol, symbol]);
  }

  findIsinBySymbolStrict(db: Database, symbol: string): Promise<any> {
    return dbGet(db, 'SELECT isin FROM MasterTickers WHERE symbol = ? AND isin IS NOT NULL AND isin != ""', [symbol]);
  }

  updateTransaction(db: Database, id: string, fields: {
    date: any; portfolio: any; type: any; isin: string; symbol: string;
    quantity: any; price: any; gross_amount: any; brokerage: any; net_amount: any;
    notes: any; isCashFlow: number;
  }): Promise<any> {
    return dbRun(db, `UPDATE Transactions SET date=?, portfolio=?, type=?, isin=?, symbol=?, quantity=?, price=?, gross_amount=?, brokerage=?, net_amount=?, notes=?, is_cash_flow=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [fields.date, fields.portfolio, fields.type, fields.isin, fields.symbol, fields.quantity, fields.price, fields.gross_amount, fields.brokerage, fields.net_amount, fields.notes, fields.isCashFlow, id]);
  }

  deleteTransaction(db: Database, id: string): Promise<any> {
    return dbRun(db, 'DELETE FROM Transactions WHERE id = ?', [id]);
  }

  bulkDeleteTransactions(db: Database, ids: any[]): Promise<any> {
    const ph = ids.map(() => '?').join(',');
    return dbRun(db, `DELETE FROM Transactions WHERE id IN (${ph})`, ids);
  }

  bulkUpdateTransactions(db: Database, clauses: string[], params: any[], ids: any[]): Promise<any> {
    const ph = ids.map(() => '?').join(',');
    return dbRun(db, `UPDATE Transactions SET ${clauses.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id IN (${ph})`, [...params, ...ids]);
  }

  getAllTransactions(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM Transactions ORDER BY date DESC');
  }

  getAllCorporateActions(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM CorporateActions ORDER BY record_date DESC');
  }

  getAllHoldings(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM Holdings ORDER BY current_value DESC');
  }

  getAllMasterTickers(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM MasterTickers ORDER BY symbol ASC');
  }

  updateMasterTicker(db: Database, id: string, fields: {
    isin: any; symbol: any; name: any; exchange: any; sector: any;
    manual_ltp: any; manual_ltp_date: any; fmv_31_jan_2018: any;
  }): Promise<any> {
    return dbRun(db, `UPDATE MasterTickers SET isin=?, symbol=?, name=?, exchange=?, sector=?, manual_ltp=?, manual_ltp_date=?, fmv_31_jan_2018=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [fields.isin, fields.symbol, fields.name, fields.exchange, fields.sector, fields.manual_ltp, fields.manual_ltp_date, fields.fmv_31_jan_2018, id]);
  }

  getHoldingsBySymbolOrIsin(db: Database, symbol: any, isin: any): Promise<any[]> {
    return dbAll(db, 'SELECT portfolio, isin, symbol, quantity, total_cost, folio FROM Holdings WHERE symbol = ? OR isin = ?', [symbol, isin]);
  }

  updateHoldingLtp(db: Database, ltp: any, cv: number, pnl: number, pct: number, portfolio: string, isin: string, symbol: string, folio: string): Promise<any> {
    return dbRun(db, `UPDATE Holdings SET ltp=?, current_value=?, unrealized_pnl=?, unrealized_pct=?, data_source='Manual Entry', last_update=CURRENT_TIMESTAMP WHERE portfolio=? AND isin=? AND symbol=? AND folio=?`,
      [ltp, cv, pnl, pct, portfolio, isin, symbol, folio]);
  }

  upsertMasterTickerByIsin(db: Database, fields: {
    isin: any; symbol: any; name: any; exchange: any; sector: any; manual_ltp: any; fmv_31_jan_2018: any;
  }): Promise<any> {
    return dbRun(db, `INSERT INTO MasterTickers (isin, symbol, name, exchange, sector, manual_ltp, fmv_31_jan_2018) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(isin) DO UPDATE SET symbol=COALESCE(excluded.symbol, MasterTickers.symbol), name=CASE WHEN excluded.name!='' THEN excluded.name ELSE MasterTickers.name END, exchange=COALESCE(excluded.exchange, MasterTickers.exchange), sector=CASE WHEN excluded.sector!='' THEN excluded.sector ELSE MasterTickers.sector END, manual_ltp=COALESCE(excluded.manual_ltp, MasterTickers.manual_ltp), fmv_31_jan_2018=COALESCE(excluded.fmv_31_jan_2018, MasterTickers.fmv_31_jan_2018)`,
      [fields.isin, fields.symbol || '', fields.name || '', fields.exchange || 'NYSE', fields.sector || '', fields.manual_ltp || null, fields.fmv_31_jan_2018 || 0]);
  }
}
