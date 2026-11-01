/** Real settings routes + apiClient over loopback HTTP and isolated SQLite. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import sqlite3 from 'sqlite3';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const state = vi.hoisted(() => {
  // dbRun's backup hook must never inspect or copy a production DB.
  vi.stubEnv('DATABASE_URL', ':memory:');
  return { db: undefined as sqlite3.Database | undefined };
});
vi.mock('../../src/server/database.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/server/database.js')>(),
  getDB: () => state.db,
}));
// These unrelated services are not used by the exercised settings routes.
vi.mock('../../src/server/services/FamilyBenchmarkService.js', () => ({ FamilyBenchmarkService: {} }));
vi.mock('../../src/server/services/AssetScripMappingService.js', () => ({ AssetScripMappingService: {} }));
vi.mock('../../src/server/services/MasterTickerService.js', () => ({ MasterTickerService: {} }));

import settingsRouter from '../../src/server/routes/settings.js';
import { apiClient } from '../../src/lib/apiClient.js';

let server: Server;
let base: string;
function exec(sql: string): Promise<void> {
  return new Promise((resolve, reject) => state.db!.exec(sql, error => error ? reject(error) : resolve()));
}

beforeAll(async () => {
  state.db = new sqlite3.Database(':memory:');
  await exec(`
    CREATE TABLE AppConfig (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE MasterTickers (id INTEGER PRIMARY KEY, symbol TEXT, isin TEXT, name TEXT);
    INSERT INTO MasterTickers VALUES (1, 'A&B', 'TEST001', 'Encoded symbol');
  `);
  const app = express();
  app.use(express.json());
  app.use('/api', settingsRouter);
  app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

beforeEach(async () => { await exec('DELETE FROM AppConfig'); });

afterAll(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (state.db) await new Promise<void>((resolve, reject) => state.db!.close(error => error ? reject(error) : resolve()));
  vi.unstubAllEnvs();
});

describe('apiClient against real settings routes', () => {
  it('reads an empty configuration with the exact successful contract', async () => {
    await expect(apiClient.get(`${base}/config`)).resolves.toEqual({ success: true, config: {} });
  });

  it('posts JSON and reads the persisted value back', async () => {
    await expect(apiClient.post(`${base}/config`, { key: 'theme', value: 'dark' }))
      .resolves.toMatchObject({ success: true });
    await expect(apiClient.get(`${base}/config`)).resolves.toEqual({ success: true, config: { theme: 'dark' } });
  });

  it('upserts a key without leaving duplicate values', async () => {
    await apiClient.post(`${base}/config`, { key: 'theme', value: 'dark' });
    await apiClient.post(`${base}/config`, { key: 'theme', value: 'light' });
    await expect(apiClient.get(`${base}/config`)).resolves.toEqual({ success: true, config: { theme: 'light' } });
  });

  it('propagates validation errors from an actual HTTP 400', async () => {
    await expect(apiClient.post(`${base}/config`, { value: 'invalid' })).rejects.toThrow('key is required.');
    await expect(apiClient.get(`${base}/config`)).resolves.toEqual({ success: true, config: {} });
  });

  it('round-trips a reserved character through URL query encoding', async () => {
    await expect(apiClient.get(`${base}/tickers`, { search: 'A&B' })).resolves.toEqual({
      success: true, tickers: [{ id: 1, symbol: 'A&B', isin: 'TEST001', name: 'Encoded symbol' }],
    });
  });

  it('returns an empty array for an unmatched ticker search', async () => {
    await expect(apiClient.get(`${base}/tickers`, { search: 'missing' }))
      .resolves.toEqual({ success: true, tickers: [] });
  });

  it('keeps GET requests read-only in SQLite', async () => {
    const changes = () => new Promise<number>((resolve, reject) => {
      state.db!.get('SELECT total_changes() AS n', (error, row: { n: number }) => error ? reject(error) : resolve(row.n));
    });
    const before = await changes();
    await apiClient.get(`${base}/config`);
    await apiClient.get(`${base}/tickers`);
    expect(await changes()).toBe(before);
  });

  it('propagates an actual HTTP 404 through the fetch helper', async () => {
    await expect(apiClient.get(`${base}/__missing__`)).rejects.toThrow('Not Found');
  });
});
