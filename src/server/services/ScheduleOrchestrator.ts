import sqlite3 from 'sqlite3';
import path from 'path';

export interface ScripScheduleRecord {
  scripCode: string;
  priorityTier: string;
  lastStatutoryCheck?: string;
  lastConcallProcessed?: string;
  nextConcallExpected?: string;
}

export class ScheduleOrchestrator {
  private static instance: ScheduleOrchestrator;
  private db: sqlite3.Database;

  private constructor() {
    const dbPath = path.resolve(process.cwd(), 'portfolio.db');
    this.db = new (sqlite3.verbose()).Database(dbPath);
  }

  public static getInstance(): ScheduleOrchestrator {
    if (!ScheduleOrchestrator.instance) {
      ScheduleOrchestrator.instance = new ScheduleOrchestrator();
    }
    return ScheduleOrchestrator.instance;
  }

  public async initScheduleForScrips(scrips: { scripCode: string; priorityTier: string }[]): Promise<void> {
    return new Promise((resolve) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION;');
        const stmt = this.db.prepare(`
          INSERT OR IGNORE INTO ScripSchedule (scripCode, priorityTier, nextConcallExpected)
          VALUES (?, ?, DATE('now'))
        `);
        for (const s of scrips) {
          stmt.run([s.scripCode, s.priorityTier]);
        }
        stmt.finalize();
        this.db.run('COMMIT;', () => resolve());
      });
    });
  }

  public async getDueScrips(tierFilter?: string, limit: number = 100): Promise<ScripScheduleRecord[]> {
    return new Promise((resolve) => {
      let query = `
        SELECT scripCode, priorityTier, lastStatutoryCheck, lastConcallProcessed, nextConcallExpected
        FROM ScripSchedule
        WHERE nextConcallExpected IS NULL OR nextConcallExpected <= DATE('now')
      `;
      const params: any[] = [];
      if (tierFilter) {
        query += ` AND priorityTier = ?`;
        params.push(tierFilter);
      }
      query += ` ORDER BY priorityTier ASC LIMIT ?`;
      params.push(limit);

      this.db.all(query, params, (err, rows: any[]) => {
        resolve(rows || []);
      });
    });
  }

  public async markConcallProcessed(scripCode: string): Promise<void> {
    return new Promise((resolve) => {
      this.db.run(
        `UPDATE ScripSchedule 
         SET lastConcallProcessed = DATE('now'), 
             nextConcallExpected = DATE('now', '+90 days') 
         WHERE scripCode = ?`,
        [scripCode],
        () => resolve()
      );
    });
  }

  public async markStatutoryChecked(scripCode: string): Promise<void> {
    return new Promise((resolve) => {
      this.db.run(
        `UPDATE ScripSchedule 
         SET lastStatutoryCheck = DATE('now') 
         WHERE scripCode = ?`,
        [scripCode],
        () => resolve()
      );
    });
  }
}
