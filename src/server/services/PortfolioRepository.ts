import type { Database } from 'sqlite3';
import { dbAll, dbGet, dbRun } from '../database.js';

export class PortfolioRepository {
  private static instance: PortfolioRepository;
  static getInstance(): PortfolioRepository {
    if (!PortfolioRepository.instance) PortfolioRepository.instance = new PortfolioRepository();
    return PortfolioRepository.instance;
  }

  getByMemberId(db: Database, memberId: number): Promise<any[]> {
    return dbAll(db, `
      SELECT DISTINCT p.name AS portfolio
      FROM Portfolios p
      WHERE (p.member_id = ? OR p.name IN (SELECT portfolio_name FROM MemberPortfolioPermissions WHERE member_id = ?))
        AND p.status = 'ACTIVE'
      ORDER BY p.name ASC
    `, [memberId, memberId]);
  }

  getAllRanked(db: Database): Promise<any[]> {
    return dbAll(db, `
      WITH PortfolioNames AS (
        SELECT DISTINCT portfolio FROM (
          SELECT portfolio FROM Transactions WHERE portfolio IS NOT NULL AND portfolio != ''
          UNION
          SELECT portfolio FROM Holdings WHERE portfolio IS NOT NULL AND portfolio != ''
          UNION
          SELECT portfolio FROM ZerodhaHoldings WHERE portfolio IS NOT NULL AND portfolio != ''
          UNION
          SELECT portfolio_name AS portfolio FROM CamsConfigurations WHERE portfolio_name IS NOT NULL AND portfolio_name != ''
          UNION
          SELECT name AS portfolio FROM Portfolios WHERE name IS NOT NULL AND name != '' AND status = 'ACTIVE'
        )
      ),
      PortfolioData AS (
        SELECT
          PN.portfolio,
          P.base_currency,
          (SELECT SUM(current_value) FROM Holdings H WHERE H.portfolio = PN.portfolio) AS total_value
        FROM PortfolioNames PN
        LEFT JOIN Portfolios P ON PN.portfolio = P.name
      )
      SELECT portfolio
      FROM PortfolioData
      ORDER BY
        CASE WHEN COALESCE(base_currency, 'INR') = 'INR' THEN 0 ELSE 1 END ASC,
        COALESCE(total_value, 0) DESC,
        portfolio ASC
    `);
  }

  getDetailedByMemberId(db: Database, memberId: number): Promise<any[]> {
    return dbAll(db, `SELECT * FROM Portfolios WHERE (member_id = ? OR name IN (SELECT portfolio_name FROM MemberPortfolioPermissions WHERE member_id = ?)) AND status = 'ACTIVE' ORDER BY name ASC`, [memberId, memberId]);
  }

  getAllDetailed(db: Database): Promise<any[]> {
    return dbAll(db, 'SELECT * FROM Portfolios ORDER BY name ASC');
  }

  getPmsByMemberId(db: Database, memberId: number): Promise<any[]> {
    return dbAll(db, `SELECT name AS portfolio FROM Portfolios WHERE type = 'PMS' AND status = 'ACTIVE' AND (member_id = ? OR name IN (SELECT portfolio_name FROM MemberPortfolioPermissions WHERE member_id = ?))`, [memberId, memberId]);
  }

  getPmsAll(db: Database): Promise<any[]> {
    return dbAll(db, `SELECT name AS portfolio FROM Portfolios WHERE type = 'PMS' AND status = 'ACTIVE'`);
  }

  findByName(db: Database, name: string): Promise<any> {
    return dbGet(db, 'SELECT id FROM Portfolios WHERE name = ?', [name]);
  }

  create(db: Database, name: string, type: string, currency: string): Promise<any> {
    return dbRun(db, `INSERT INTO Portfolios (name, type, base_currency, status) VALUES (?, ?, ?, 'ACTIVE')`, [name, type, currency]);
  }

  insertWithType(db: Database, name: string, type: string): Promise<any> {
    return dbRun(db, `INSERT INTO Portfolios (name, type, status) VALUES (?, ?, 'ACTIVE')`, [name, type]);
  }

  updateType(db: Database, name: string, type: string): Promise<any> {
    return dbRun(db, 'UPDATE Portfolios SET type = ? WHERE name = ?', [type, name]);
  }

  insertWithCurrency(db: Database, name: string, currency: string): Promise<any> {
    return dbRun(db, `INSERT INTO Portfolios (name, type, base_currency, status) VALUES (?, 'EQUITY', ?, 'ACTIVE')`, [name, currency]);
  }

  updateCurrency(db: Database, name: string, currency: string): Promise<any> {
    return dbRun(db, 'UPDATE Portfolios SET base_currency = ? WHERE name = ?', [currency, name]);
  }

  renameInTable(db: Database, table: string, col: string, newName: string, oldName: string): Promise<any> {
    return dbRun(db, `UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`, [newName, oldName]).catch(() => {});
  }

  renamePortfolio(db: Database, newName: string, oldName: string): Promise<any> {
    return dbRun(db, 'UPDATE Portfolios SET name = ? WHERE name = ?', [newName, oldName]);
  }

  deleteFromTable(db: Database, table: string, col: string, name: string): Promise<any> {
    return dbRun(db, `DELETE FROM ${table} WHERE ${col} = ?`, [name]);
  }

  archive(db: Database, name: string): Promise<any> {
    return dbRun(db, `UPDATE Portfolios SET status = 'ARCHIVED' WHERE name = ?`, [name]);
  }

  beginTransaction(db: Database): Promise<any> {
    return dbRun(db, 'BEGIN TRANSACTION');
  }

  commit(db: Database): Promise<any> {
    return dbRun(db, 'COMMIT');
  }

  rollback(db: Database): Promise<any> {
    return dbRun(db, 'ROLLBACK').catch(() => {});
  }
}
