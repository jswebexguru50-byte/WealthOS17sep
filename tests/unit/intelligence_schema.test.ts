import { describe, expect, it } from 'vitest';
import sqlite3 from 'sqlite3';
import { initializeIntelligenceTables } from '../../src/server/intelligence/database/schema.js';

describe('intelligence schema bootstrap', () => {
  it('creates the evidence parent before claim tables on a fresh database', async () => {
    const db = new sqlite3.Database(':memory:');
    await initializeIntelligenceTables(db);
    const names = await new Promise<string[]>((resolve, reject) => {
      db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('EvidenceInventory','ManagementClaims') ORDER BY name",
        (error, rows: Array<{ name: string }>) => error ? reject(error) : resolve(rows.map(row => row.name))
      );
    });
    expect(names).toEqual(['EvidenceInventory', 'ManagementClaims']);
    await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
  });
});
