import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { getDB, dbAll, dbGet, dbRun, getEffectiveDbPath } from '../database.js';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private dbPath: string;

  private constructor() {
    this.dbPath = getEffectiveDbPath();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public getDb(): sqlite3.Database {
    return getDB();
  }

  /**
   * Create an automated point-in-time backup of the database before destructive ops or bulk imports.
   */
  public async createBackup(tag: string = 'auto'): Promise<string> {
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `portfolio_backup_${tag}_${timestamp}.db`;
    const backupFilePath = path.join(backupDir, backupFileName);

    const source = getDB() as any;
    if (typeof source.backup !== 'function') {
      throw new Error('SQLITE_BACKUP_API_UNAVAILABLE');
    }
    // better-sqlite3 copies pages in bounded asynchronous batches. This keeps
    // WAL state consistent without copying a live database file by hand.
    await source.backup(backupFilePath, { attached: 'main', filename: backupFilePath });
    const verify = new (await import('better-sqlite3')).default(backupFilePath, { readonly: true });
    try {
      const result = verify.pragma('quick_check', { simple: true });
      if (result !== 'ok') throw new Error(`SQLITE_BACKUP_QUICK_CHECK_FAILED:${String(result)}`);
    } finally {
      verify.close();
    }
    const retained = fs.readdirSync(backupDir)
      .filter((name) => name.startsWith('portfolio_backup_') && name.endsWith('.db'))
      .map((name) => ({ name, path: path.join(backupDir, name), mtime: fs.statSync(path.join(backupDir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of retained.slice(10)) {
      try { fs.unlinkSync(old.path); } catch (error) { console.warn('[DatabaseManager] backup retention cleanup failed:', old.name, error); }
    }
    console.log(`[DatabaseManager] Created verified online snapshot backup: ${backupFileName}`);
    return backupFilePath;
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return (await dbAll(getDB(), sql, params)) as T[];
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return (await dbGet(getDB(), sql, params)) as T | undefined;
  }

  public async execute(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return await dbRun(getDB(), sql, params);
  }
}


