import type { Database } from 'sqlite3';
import { dbAll, dbGet, dbRun } from '../database.js';

export class CommandCenterRepository {
  private static instance: CommandCenterRepository;
  static getInstance(): CommandCenterRepository {
    if (!CommandCenterRepository.instance) CommandCenterRepository.instance = new CommandCenterRepository();
    return CommandCenterRepository.instance;
  }

  getLatestXirrPerPortfolio(db: Database): Promise<any[]> {
    return dbAll(db, `
      SELECT p1.portfolio, p1.xirr
      FROM PortfolioHistory p1
      INNER JOIN (
        SELECT portfolio, MAX(date) as max_date
        FROM PortfolioHistory
        WHERE xirr IS NOT NULL AND xirr != 0
        GROUP BY portfolio
      ) p2 ON p1.portfolio = p2.portfolio AND p1.date = p2.max_date
    `).catch(() => []);
  }

  getPmsTransactions(db: Database): Promise<any[]> {
    return dbAll(db, `
      SELECT portfolio, type, net_amount, quantity, price, is_cash_flow, is_ca
      FROM Transactions
      WHERE (LOWER(portfolio) LIKE '%pms%' OR LOWER(portfolio) LIKE '%cc9%' OR LOWER(portfolio) LIKE '%iifl%')
    `).catch(() => []);
  }

  getRealizedGainsStats(db: Database, portfolio: string): Promise<any[]> {
    return dbAll(db, `
      SELECT
        ROUND(SUM(buy_cost), 2) as cost,
        ROUND(SUM(sell_proceeds), 2) as sales,
        ROUND(SUM(realized_pnl), 2) as pnl,
        MIN(buy_date) as start_date,
        MAX(sell_date) as end_date
      FROM RealizedGains
      WHERE portfolio = ?
    `, [portfolio]).catch(() => []);
  }

  getRecentDriftAlerts(db: Database, portfolioNames: string[]): Promise<any[]> {
    if (portfolioNames.length === 0) return Promise.resolve([]);
    const placeholders = portfolioNames.map(() => '?').join(',');
    return dbAll(db, `
      SELECT vs.portfolio, vs.drift_pct, vs.drift_alert, vs.trigger_source, vs.created_at
      FROM ValuationSnapshots vs
      INNER JOIN (
        SELECT portfolio, MAX(id) as max_id
        FROM ValuationSnapshots
        WHERE portfolio IN (${placeholders})
        GROUP BY portfolio
      ) latest ON vs.id = latest.max_id
      WHERE vs.drift_alert IS NOT NULL AND vs.drift_alert != ''
      ORDER BY vs.id DESC
    `, portfolioNames);
  }

  getValuationSnapshotMeta(db: Database): Promise<any> {
    return dbGet(db, 'SELECT COUNT(*) as count, MAX(created_at) as last_ts FROM ValuationSnapshots');
  }

  dismissDriftAlertsForPortfolios(db: Database, portfolios: string[]): Promise<any> {
    const placeholders = portfolios.map(() => '?').join(',');
    return dbRun(db, `UPDATE ValuationSnapshots SET drift_alert = NULL WHERE portfolio IN (${placeholders})`, portfolios);
  }

  dismissAllDriftAlerts(db: Database): Promise<any> {
    return dbRun(db, 'UPDATE ValuationSnapshots SET drift_alert = NULL');
  }
}
