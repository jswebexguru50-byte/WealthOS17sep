import fs from 'node:fs';
import Database from 'better-sqlite3';
import { ResearchItemStore } from '../../../src/server/research_v2/research/store.js';
import type { ResearchItemCandidate } from '../../../src/server/research_v2/research/researchItems.js';

export const SCHEMA_SQL = new URL('../../../src/server/db/migrations/research_v2_schema.sql', import.meta.url);

/** Applies the research_v2 schema SQL file to an open database. */
export function applySchema(db: Database.Database): void {
  db.exec(fs.readFileSync(SCHEMA_SQL, 'utf8'));
}

/** In-memory database with the research_v2 schema applied from the schema SQL file. */
export function memoryDb(): Database.Database {
  const db = new Database(':memory:');
  applySchema(db);
  return db;
}

export function memoryStore(): { db: Database.Database; store: ResearchItemStore } {
  const db = memoryDb();
  return { db, store: new ResearchItemStore(db) };
}

export function countItems(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM research_items').get() as { n: number }).n;
}

const BASE_TEXT = 'The company reported consolidated revenue growth driven by strong demand across all segments';

/** A valid secondary candidate; override any field. `seed` makes the URL and excerpt unique. */
export function candidate(overrides: Partial<ResearchItemCandidate> = {}, seed = 'a'): ResearchItemCandidate {
  return {
    symbol: 'TATATECH',
    tier: 'SECONDARY',
    url: `https://www.moneycontrol.com/news/${seed}`,
    title: `Article ${seed}`,
    publisher: 'Moneycontrol',
    publishedAt: '2026-09-30T00:00:00Z',
    retrievedAt: '2026-10-10T08:00:00Z',
    excerpt: `${BASE_TEXT} ${seed} ${seed.repeat(3)} unique marker ${seed}${seed}`,
    subQuestionIds: ['Q7.a'],
    ...overrides,
  };
}

/** A valid primary filing candidate on an exchange host. */
export function filing(overrides: Partial<ResearchItemCandidate> = {}, seed = 'f'): ResearchItemCandidate {
  return {
    symbol: 'TATATECH',
    tier: 'PRIMARY',
    url: `https://www.bseindia.com/xml-data/corpfiling/${seed}.pdf`,
    title: `Filing ${seed}`,
    publisher: 'BSE',
    publishedAt: '2026-09-29T00:00:00Z',
    retrievedAt: '2026-10-10T08:00:00Z',
    excerpt: `Regulation 30 disclosure ${seed}: the board approved results for the quarter ended ${seed} Sept 2026`,
    subQuestionIds: ['Q7.a'],
    documentKind: 'FILING',
    ...overrides,
  };
}
