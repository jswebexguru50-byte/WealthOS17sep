/**
 * Integration tests for MiscRepository
 * Uses a real in-memory SQLite3 database — no mocks for the DB layer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import sqlite3 from 'sqlite3';

let testDb: sqlite3.Database;

function createTestDb(): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) reject(err); else resolve(db);
    });
  });
}

function run(db: sqlite3.Database, sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { if (err) reject(err); else resolve(); });
  });
}

function dbAllImpl<T>(db: any, sql: string, params?: any[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    testDb.all(sql, params ?? [], (err: Error | null, rows: T[]) => {
      if (err) reject(err); else resolve(rows ?? []);
    });
  });
}

function dbGetImpl<T>(db: any, sql: string, params?: any[]): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    testDb.get(sql, params ?? [], (err: Error | null, row: T) => {
      if (err) reject(err); else resolve(row);
    });
  });
}

function dbRunImpl(db: any, sql: string, params?: any[]): Promise<void> {
  return new Promise((resolve, reject) => {
    testDb.run(sql, params ?? [], function (err: Error | null) {
      if (err) reject(err); else resolve();
    });
  });
}

vi.mock('../../src/server/database.js', () => ({
  getDB: () => testDb,
  dbAll: dbAllImpl,
  dbGet: dbGetImpl,
  dbRun: dbRunImpl,
}));

import { MiscRepository } from '../../src/server/services/MiscRepository.js';

async function createSchema() {
  await run(testDb, `CREATE TABLE IF NOT EXISTS Holdings (
    portfolio TEXT, symbol TEXT, isin TEXT, quantity REAL, avg_buy_price REAL
  )`);
  await run(testDb, `CREATE TABLE IF NOT EXISTS Transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, portfolio TEXT, type TEXT,
    symbol TEXT, isin TEXT, quantity REAL, price REAL, net_amount REAL
  )`);
  await run(testDb, `CREATE TABLE IF NOT EXISTS Portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, status TEXT DEFAULT 'ACTIVE'
  )`);
  await run(testDb, `CREATE TABLE IF NOT EXISTS FemaRepatriationLedger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    financial_year TEXT, remittance_date TEXT, portfolio TEXT,
    source_account_nro TEXT, destination_country TEXT,
    remitted_amount_inr REAL, fx_rate_usd_inr REAL, remitted_amount_usd REAL,
    form_15ca_ack_no TEXT, form_15cb_cert_no TEXT, ca_membership_no TEXT, purpose_code TEXT
  )`);
  await run(testDb, `CREATE TABLE IF NOT EXISTS AccountProfiles (
    portfolio_name       TEXT PRIMARY KEY,
    account_type         TEXT,
    demat_scheme         TEXT,
    designated_bank      TEXT,
    bank_account_number  TEXT,
    pis_permission_ref   TEXT,
    resident_country     TEXT,
    tax_residency_status TEXT,
    updated_at           TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(testDb, `CREATE TABLE IF NOT EXISTS FEREEnrichedLedger (
    symbol     TEXT PRIMARY KEY,
    fere_score REAL,
    detail     TEXT
  )`);
}

describe('MiscRepository — integration (real in-memory SQLite)', () => {
  beforeAll(async () => {
    testDb = await createTestDb();
    await createSchema();
  });

  afterAll(() => { testDb.close(); });

  beforeEach(async () => {
    (MiscRepository as any).instance = undefined;
    await run(testDb, 'DELETE FROM Holdings');
    await run(testDb, 'DELETE FROM Transactions');
    await run(testDb, 'DELETE FROM Portfolios');
    await run(testDb, 'DELETE FROM FemaRepatriationLedger');
    await run(testDb, 'DELETE FROM AccountProfiles');
    await run(testDb, 'DELETE FROM FEREEnrichedLedger');
  });

  it('getPortfolioNames returns union of Holdings, Transactions, and Portfolios', async () => {
    await run(testDb, `INSERT INTO Holdings (portfolio, symbol, isin, quantity, avg_buy_price) VALUES ('FundA','INFY','X',100,1500)`);
    await run(testDb, `INSERT INTO Transactions (date, portfolio, type, symbol) VALUES ('2024-01-01','FundB','BUY','TCS')`);
    await run(testDb, `INSERT INTO Portfolios (name) VALUES ('FundC')`);

    const repo = MiscRepository.getInstance();
    const rows = await repo.getPortfolioNames(testDb as any);
    const names = rows.map((r: any) => r.portfolio || r.name);
    expect(names).toContain('FundA');
    expect(names).toContain('FundB');
    expect(names).toContain('FundC');
  });

  it('getFallbackPortfolios unions distinct non-null portfolios from Holdings and Transactions', async () => {
    await run(testDb, `INSERT INTO Holdings (portfolio, symbol, isin, quantity, avg_buy_price) VALUES ('FundA','INFY','X',100,1500)`);
    await run(testDb, `INSERT INTO Transactions (date, portfolio, type, symbol) VALUES ('2024-01-01','FundB','BUY','TCS')`);

    const repo = MiscRepository.getInstance();
    const rows = await repo.getFallbackPortfolios(testDb as any);
    const portfolios = rows.map((r: any) => r.portfolio);
    expect(portfolios).toContain('FundA');
    expect(portfolios).toContain('FundB');
  });

  it('insertFemaRepatriation creates a ledger entry', async () => {
    const repo = MiscRepository.getInstance();
    await repo.insertFemaRepatriation(
      testDb as any, '2024-2025', '2024-08-15', 'FundA', 'NRO Savings', 'UAE',
      5000000, 86.80, 57604, 'CA001', 'CB002', 'MEM003', 'S1301'
    );
    const rows = await dbAllImpl<any>(null, `SELECT * FROM FemaRepatriationLedger`);
    expect(rows).toHaveLength(1);
    expect(rows[0].financial_year).toBe('2024-2025');
    expect(rows[0].destination_country).toBe('UAE');
    expect(rows[0].purpose_code).toBe('S1301');
  });

  it('getAccountProfiles returns empty array when no profiles', async () => {
    const repo = MiscRepository.getInstance();
    expect(await repo.getAccountProfiles(testDb as any)).toEqual([]);
  });

  it('upsertAccountProfile inserts a new profile', async () => {
    const repo = MiscRepository.getInstance();
    await repo.upsertAccountProfile(
      testDb as any, 'FundAlpha', 'NRE', 'NON_PIS', 'HDFC Bank',
      'ACC1234', 'PIS-REF-001', 'UAE', 'NRI'
    );
    const rows = await dbAllImpl<any>(null, `SELECT * FROM AccountProfiles`);
    expect(rows).toHaveLength(1);
    expect(rows[0].portfolio_name).toBe('FundAlpha');
    expect(rows[0].account_type).toBe('NRE');
    expect(rows[0].resident_country).toBe('UAE');
  });

  it('upsertAccountProfile updates existing profile on conflict', async () => {
    const repo = MiscRepository.getInstance();
    await repo.upsertAccountProfile(testDb as any, 'FundX', 'NRE', 'NON_PIS', 'HDFC', 'ACC001', null, 'UAE', 'NRI');
    await repo.upsertAccountProfile(testDb as any, 'FundX', 'NRO', 'PIS', 'ICICI', 'ACC002', 'PIS-NEW', 'US', 'NRI');
    const rows = await dbAllImpl<any>(null, `SELECT * FROM AccountProfiles WHERE portfolio_name = 'FundX'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].account_type).toBe('NRO');
    expect(rows[0].designated_bank).toBe('ICICI');
  });

  it('getAccountProfiles returns all profiles ordered by portfolio_name ASC', async () => {
    const repo = MiscRepository.getInstance();
    await repo.upsertAccountProfile(testDb as any, 'ZetaFund', 'NRE', 'NON_PIS', null, null, null, 'UAE', 'NRI');
    await repo.upsertAccountProfile(testDb as any, 'AlphaFund', 'NRO', 'PIS', null, null, null, 'US', 'NRI');
    const profiles = await repo.getAccountProfiles(testDb as any);
    expect(profiles[0].portfolio_name).toBe('AlphaFund');
    expect(profiles[1].portfolio_name).toBe('ZetaFund');
  });

  it('getFereStock returns row matching cleanSymbol', async () => {
    await run(testDb, `INSERT INTO FEREEnrichedLedger (symbol, fere_score) VALUES ('INFY', 92.5)`);
    const repo = MiscRepository.getInstance();
    const row = await repo.getFereStock(testDb as any, 'INFY', 'INFY-EQ');
    expect(row).not.toBeNull();
    expect((row as any).fere_score).toBeCloseTo(92.5);
  });

  it('getFereStock returns row matching rawSymbol when cleanSymbol misses', async () => {
    await run(testDb, `INSERT INTO FEREEnrichedLedger (symbol, fere_score) VALUES ('INFY-EQ', 85.0)`);
    const repo = MiscRepository.getInstance();
    const row = await repo.getFereStock(testDb as any, 'INFY', 'INFY-EQ');
    expect((row as any).symbol).toBe('INFY-EQ');
  });

  it('getFereStock returns undefined when neither symbol matches', async () => {
    const repo = MiscRepository.getInstance();
    const row = await repo.getFereStock(testDb as any, 'NOSYM', 'NOSYM-EQ');
    expect(row).toBeUndefined();
  });
});
