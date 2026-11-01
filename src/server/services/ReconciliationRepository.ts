import type { Database } from 'sqlite3';
import { dbAll, dbGet, dbRun } from '../database.js';

export class ReconciliationRepository {
  private static instance: ReconciliationRepository;
  static getInstance(): ReconciliationRepository {
    if (!ReconciliationRepository.instance) ReconciliationRepository.instance = new ReconciliationRepository();
    return ReconciliationRepository.instance;
  }

  ensureAuditTable(db: Database): Promise<any> {
    return dbRun(db, `
      CREATE TABLE IF NOT EXISTS ReconciliationAuditSnapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        statement_date TEXT,
        portfolio TEXT NOT NULL,
        statement_filename TEXT,
        baseline_holdings_count INTEGER,
        baseline_cost REAL,
        baseline_valuation REAL,
        baseline_cash REAL DEFAULT 0,
        currency TEXT DEFAULT 'INR',
        holdings_snapshot TEXT,
        notes TEXT
      )
    `);
  }

  getSnapshotCount(db: Database): Promise<any> {
    return dbGet(db, 'SELECT COUNT(*) as c FROM ReconciliationAuditSnapshots');
  }

  insertSnapshot(db: Database, b: {
    statement_date: string; portfolio: string; statement_filename: string;
    baseline_holdings_count: number; baseline_cost: number; baseline_valuation: number;
    baseline_cash: number; currency: string; notes: string;
  }): Promise<any> {
    return dbRun(db, `
      INSERT INTO ReconciliationAuditSnapshots (
        statement_date, portfolio, statement_filename, baseline_holdings_count,
        baseline_cost, baseline_valuation, baseline_cash, currency, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      b.statement_date, b.portfolio, b.statement_filename, b.baseline_holdings_count,
      b.baseline_cost, b.baseline_valuation, b.baseline_cash, b.currency, b.notes
    ]);
  }

  getUsdRate(db: Database): Promise<any> {
    return dbGet(db, "SELECT rate_to_inr FROM CurrencyRates WHERE currency = 'USD'");
  }

  getAllBaselines(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM ReconciliationAuditSnapshots ORDER BY statement_date DESC');
  }

  getBaselineForPortfolio(db: Database, portfolio: string): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM ReconciliationAuditSnapshots WHERE LOWER(portfolio) = LOWER(?) ORDER BY statement_date DESC LIMIT 1', [portfolio]);
  }

  getAllHoldings(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM Holdings WHERE quantity > 0');
  }

  getHoldingsForPortfolio(db: Database, portfolio: string): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM Holdings WHERE quantity > 0 AND LOWER(portfolio) = LOWER(?)', [portfolio]);
  }

  getTransactionsAfterDate(db: Database, portfolio: string, date: string): Promise<any[]> {
    return dbAll(db, `
      SELECT date, type, symbol, isin, quantity, price, net_amount, notes
      FROM Transactions
      WHERE LOWER(portfolio) = LOWER(?) AND date > ?
      ORDER BY date ASC
    `, [portfolio, date]).catch(() => []);
  }

  getBankFDs(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM BankAccountsAndFDs').catch(() => []);
  }

  getDataQualitySummary(db: Database): Promise<any[]> {
    return dbAll<any>(db, `
      SELECT
        COUNT(*) as total_audited,
        SUM(CASE WHEN integrity_status = 'PASSED' THEN 1 ELSE 0 END) as passed_count,
        SUM(CASE WHEN integrity_status = 'WARNING' THEN 1 ELSE 0 END) as warning_count,
        SUM(CASE WHEN integrity_status = 'FAILED' THEN 1 ELSE 0 END) as failed_count,
        AVG(field_accuracy_score) as avg_accuracy_score,
        AVG(sum_total_pct) as avg_shareholding_sum
      FROM DataQualityAuditLedger
    `);
  }

  getDataQualityQuarters(db: Database): Promise<any[]> {
    return dbAll<any>(db, `
      SELECT as_of_quarter, COUNT(*) as count
      FROM DataQualityAuditLedger
      GROUP BY as_of_quarter
      ORDER BY count DESC
    `);
  }

  getDataQualityLedger(db: Database, status: string | undefined, limit: number): Promise<any[]> {
    let query = 'SELECT * FROM DataQualityAuditLedger';
    const params: any[] = [];
    if (status) {
      query += ' WHERE integrity_status = ?';
      params.push(status);
    }
    query += ' ORDER BY audited_at DESC LIMIT ?';
    params.push(limit);
    return dbAll<any>(db, query, params);
  }

  getStockAuditCard(db: Database, symbol: string): Promise<any> {
    return dbGet(db, 'SELECT * FROM DataQualityAuditLedger WHERE symbol = ?', [symbol]);
  }

  getDriftRowsForSymbol(db: Database, symbol: string): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM DataSyncDriftLedger WHERE symbol = ? ORDER BY sync_status DESC, metric_name ASC', [symbol]);
  }

  getHistoricalFinancials(db: Database, symbol: string): Promise<any[]> {
    return dbAll(db, `
      SELECT * FROM HistoricalFinancialStatements
      WHERE symbol = ?
      ORDER BY
        CASE statement_type
          WHEN 'ANNUAL_PL' THEN 1
          WHEN 'QUARTERLY_PL' THEN 2
          WHEN 'BALANCE_SHEET' THEN 3
          WHEN 'CASH_FLOW' THEN 4
          ELSE 5
        END, period_label DESC
    `, [symbol]);
  }

  getHistoricalShareholding(db: Database, symbol: string): Promise<any[]> {
    return dbAll(db, `
      SELECT * FROM HistoricalShareholdingPattern
      WHERE symbol = ?
      ORDER BY quarter_label DESC
    `, [symbol]);
  }
}
