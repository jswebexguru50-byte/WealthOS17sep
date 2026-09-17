import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { getDB, dbAll, dbGet, dbRun } from '../database.js';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private dbPath: string;

  private constructor() {
    this.dbPath = path.join(process.cwd(), 'portfolio.db');
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

    return new Promise((resolve, reject) => {
      // Use SQLite backup API if available, else copy file safely
      fs.copyFile(this.dbPath, backupFilePath, (err) => {
        if (err) return reject(err);
        console.log(`[DatabaseManager] Created automatic snapshot backup: ${backupFileName}`);
        resolve(backupFilePath);
      });
    });
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

