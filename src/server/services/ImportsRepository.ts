import type { Database } from 'sqlite3';
import { dbAll, dbRun } from '../database.js';

export class ImportsRepository {
  private static instance: ImportsRepository;
  static getInstance(): ImportsRepository {
    if (!ImportsRepository.instance) ImportsRepository.instance = new ImportsRepository();
    return ImportsRepository.instance;
  }

  getCamsConfigurations(db: Database): Promise<any[]> {
    return dbAll<any>(db, `SELECT * FROM CamsConfigurations ORDER BY pan ASC`);
  }

  upsertCamsConfiguration(db: Database, pan: string, email: string, password: string | null, portfolioName: string): Promise<void> {
    return dbRun(
      db,
      `INSERT INTO CamsConfigurations (pan, email, password, portfolio_name, status) VALUES (?, ?, ?, ?, 'ACTIVE')
       ON CONFLICT(pan) DO UPDATE SET email=excluded.email, password=COALESCE(excluded.password, CamsConfigurations.password), portfolio_name=excluded.portfolio_name`,
      [pan, email, password, portfolioName]
    );
  }

  deleteCamsConfiguration(db: Database, pan: string): Promise<void> {
    return dbRun(db, `DELETE FROM CamsConfigurations WHERE pan = ?`, [pan]);
  }
}
