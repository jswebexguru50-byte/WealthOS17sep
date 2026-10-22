import crypto from 'crypto';
import sqlite3 from 'sqlite3';
import path from 'path';
import { XbrlFootnoteParser } from './XbrlFootnoteParser.js';
import { ShareholdingPatternDiff } from './ShareholdingPatternDiff.js';
import { RatingActionParser } from './RatingActionParser.js';
import { InsiderTradingParser } from './InsiderTradingParser.js';
import { ListingPlatform } from './ForensicExtractionSchema.js';

export interface RawFiling {
  scripCode: string;
  listingPlatform?: ListingPlatform;
  filingDate: string;
  documentUrl: string;
  category: 'XBRL_NOTE' | 'SHAREHOLDING' | 'RATING_ACTION' | 'INSIDER_TRADING' | 'ANNOUNCEMENT' | 'MIGRATION_EVENT';
  headline: string;
  bodyText: string;
  contentHash: string;
}

export class StatutoryFeedPoller {
  private static instance: StatutoryFeedPoller;
  private db: sqlite3.Database;

  private constructor() {
    const dbPath = path.resolve(process.cwd(), 'portfolio.db');
    this.db = new (sqlite3.verbose()).Database(dbPath);
    this.ensureSchema();
  }

  public static getInstance(): StatutoryFeedPoller {
    if (!StatutoryFeedPoller.instance) {
      StatutoryFeedPoller.instance = new StatutoryFeedPoller();
    }
    return StatutoryFeedPoller.instance;
  }

  private ensureSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS StatutoryEvents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scripCode TEXT NOT NULL,
        listingPlatform TEXT DEFAULT 'NSE_MAIN',
        eventDate TEXT NOT NULL,
        eventType TEXT NOT NULL,
        payloadJson TEXT NOT NULL,
        sourceUrl TEXT,
        contentHash TEXT UNIQUE NOT NULL,
        ingestedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_statutory_scrip ON StatutoryEvents(scripCode);
      CREATE INDEX IF NOT EXISTS idx_statutory_hash ON StatutoryEvents(contentHash);
      CREATE INDEX IF NOT EXISTS idx_statutory_platform ON StatutoryEvents(listingPlatform);
    `);
  }

  public generateHash(scrip: string, category: string, date: string, text: string): string {
    return crypto.createHash('sha256').update(`${scrip}::${category}::${date}::${text.slice(0, 500)}`).digest('hex');
  }

  public async isAlreadyProcessed(contentHash: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.db.get('SELECT 1 FROM StatutoryEvents WHERE contentHash = ?', [contentHash], (err, row) => {
        resolve(!!row);
      });
    });
  }

  public async persistEvent(
    scripCode: string,
    eventDate: string,
    eventType: string,
    payload: any,
    sourceUrl: string,
    contentHash: string,
    listingPlatform: ListingPlatform = 'NSE_MAIN'
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO StatutoryEvents (scripCode, listingPlatform, eventDate, eventType, payloadJson, sourceUrl, contentHash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run([scripCode, listingPlatform, eventDate, eventType, JSON.stringify(payload), sourceUrl, contentHash], (err) => {
        if (err) reject(err);
        else resolve();
      });
      stmt.finalize();
    });
  }

  /**
   * Deterministically processes raw filing through the appropriate specialized parser
   * with segment & platform awareness
   */
  public async processFiling(filing: RawFiling): Promise<any> {
    const { scripCode, filingDate, category, headline, bodyText, documentUrl, contentHash } = filing;
    const platform = filing.listingPlatform || 'NSE_MAIN';

    if (await this.isAlreadyProcessed(contentHash)) {
      return null; // Skip unchanged, 0 work
    }

    let parsedPayload: any = null;

    // Check for migration announcement (SME -> Mainboard)
    const lowerHeadline = headline.toLowerCase();
    const isMigration = lowerHeadline.includes('migration') && 
      (lowerHeadline.includes('mainboard') || lowerHeadline.includes('main board') || lowerHeadline.includes('emerge') || lowerHeadline.includes('sme'));

    if (isMigration) {
      parsedPayload = {
        category: 'MIGRATION_EVENT',
        headline,
        sourcePlatform: platform,
        targetPlatform: platform.includes('BSE') ? 'BSE_MAIN' : 'NSE_MAIN',
        migrationEffectiveDate: filingDate,
        summary: bodyText.slice(0, 300)
      };
      await this.persistEvent(scripCode, filingDate, 'MIGRATION_EVENT', parsedPayload, documentUrl, contentHash, platform);
      return parsedPayload;
    }

    switch (category) {
      case 'XBRL_NOTE':
        parsedPayload = XbrlFootnoteParser.parseFootnotes(bodyText);
        break;

      case 'RATING_ACTION':
        parsedPayload = RatingActionParser.parseRelease(headline, bodyText);
        break;

      case 'INSIDER_TRADING':
        parsedPayload = InsiderTradingParser.parseDisclosures(bodyText);
        break;

      case 'SHAREHOLDING':
        parsedPayload = { summary: headline, bodyText: bodyText.slice(0, 500) };
        break;

      default:
        parsedPayload = { headline, detail: bodyText.slice(0, 300) };
    }

    if (parsedPayload) {
      await this.persistEvent(scripCode, filingDate, category, parsedPayload, documentUrl, contentHash, platform);
    }

    return parsedPayload;
  }
}
