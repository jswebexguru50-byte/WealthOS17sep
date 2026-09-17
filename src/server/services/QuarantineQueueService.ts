import sqlite3 from 'sqlite3';
import path from 'path';
import { ListingPlatform } from './ForensicExtractionSchema.js';

export interface QuarantinedRecord {
  id?: number;
  scripCode: string;
  listingPlatform?: ListingPlatform;
  fieldName: string;
  extractedValue: string;
  failureReason: 'SANITY_BOUND_VIOLATION' | 'CITATION_VERACITY_LOW' | 'CROSS_CHECK_DISAGREEMENT' | 'UNUSUAL_OUTLIER';
  citationVeracityScore?: number;
  sourceDocument: string;
  quarantinedAt?: string;
  reviewStatus?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CORRECTED';
  reviewedAt?: string;
  reviewerNote?: string;
}

export class QuarantineQueueService {
  private static db: sqlite3.Database | null = null;

  private static getDb(): sqlite3.Database {
    if (!QuarantineQueueService.db) {
      const dbPath = path.resolve(process.cwd(), 'portfolio.db');
      QuarantineQueueService.db = new (sqlite3.verbose()).Database(dbPath);
      QuarantineQueueService.initTable();
    }
    return QuarantineQueueService.db;
  }

  private static initTable() {
    const db = this.getDb();
    db.run(`
      CREATE TABLE IF NOT EXISTS QuarantinedRecords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scripCode TEXT NOT NULL,
        listingPlatform TEXT DEFAULT 'NSE_MAIN',
        fieldName TEXT NOT NULL,
        extractedValue TEXT NOT NULL,
        failureReason TEXT NOT NULL,
        citationVeracityScore REAL,
        sourceDocument TEXT,
        quarantinedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        reviewStatus TEXT DEFAULT 'PENDING',
        reviewedAt TEXT,
        reviewerNote TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_quarantine_status ON QuarantinedRecords(reviewStatus);
      CREATE INDEX IF NOT EXISTS idx_quarantine_scrip ON QuarantinedRecords(scripCode);
    `);
  }

  public static async quarantine(record: QuarantinedRecord): Promise<void> {
    const db = this.getDb();
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO QuarantinedRecords (
          scripCode, listingPlatform, fieldName, extractedValue, failureReason, citationVeracityScore, sourceDocument
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run([
        record.scripCode,
        record.listingPlatform || 'NSE_MAIN',
        record.fieldName,
        record.extractedValue,
        record.failureReason,
        record.citationVeracityScore || null,
        record.sourceDocument
      ], (err) => {
        if (err) {
          console.error('[QuarantineQueue] Error inserting quarantine record:', err);
          reject(err);
        } else {
          console.log(`[QuarantineQueue] Quarantined ${record.scripCode} - ${record.fieldName}: ${record.failureReason}`);
          resolve();
        }
      });
      stmt.finalize();
    });
  }

  public static async getPendingRecords(): Promise<QuarantinedRecord[]> {
    const db = this.getDb();
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM QuarantinedRecords WHERE reviewStatus = 'PENDING' ORDER BY id DESC`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as QuarantinedRecord[]);
      });
    });
  }

  public static async resolveRecord(
    id: number,
    status: 'ACCEPTED' | 'REJECTED' | 'CORRECTED',
    note: string
  ): Promise<void> {
    const db = this.getDb();
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        UPDATE QuarantinedRecords 
        SET reviewStatus = ?, reviewerNote = ?, reviewedAt = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      stmt.run([status, note, id], (err) => {
        if (err) reject(err);
        else resolve();
      });
      stmt.finalize();
    });
  }
}
