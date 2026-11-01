import type { Database } from 'sqlite3';
import { dbAll, dbRun } from '../database.js';

export class SystemRepository {
  private static instance: SystemRepository;
  static getInstance(): SystemRepository {
    if (!SystemRepository.instance) SystemRepository.instance = new SystemRepository();
    return SystemRepository.instance;
  }

  getChangeLogs(db: Database): Promise<any[]> {
    return dbAll<any>(db, `SELECT * FROM AppChangeLogs ORDER BY timestamp DESC LIMIT 100`);
  }

  insertChangeLog(db: Database, versionTag: string, summary: string, fileCount: number): Promise<void> {
    return dbRun(db, `INSERT INTO AppChangeLogs (version_tag, summary, file_count) VALUES (?, ?, ?)`, [versionTag, summary, fileCount]);
  }

  getSystemLogs(db: Database, limit: number): Promise<any[]> {
    return dbAll<any>(db, `SELECT * FROM SystemLogs ORDER BY timestamp DESC LIMIT ?`, [limit]);
  }

  getActionHistory(db: Database): Promise<any[]> {
    return dbAll<any>(db, `SELECT * FROM ActionHistory ORDER BY timestamp DESC LIMIT 200`);
  }
}
