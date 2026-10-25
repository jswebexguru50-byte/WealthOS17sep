/**
 * Integration tests for FactsRepository
 *
 * Uses a real in-memory SQLite3 database — no mocks for the DB layer.
 * We DO mock the `getDB` import so FactsRepository hits our test DB
 * instead of the production portfolio.db.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import sqlite3 from 'sqlite3';

// ── In-memory DB helpers ──────────────────────────────────────────────────────

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

function all(db: sqlite3.Database, sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
  });
}

// ── Replicate dbAll / dbGet that FactsRepository expects ─────────────────────
// The real helpers come from database.ts; we recreate the same async wrappers
// and patch them via vi.mock so FactsRepository uses our test DB.

let testDb: sqlite3.Database;

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

// ── Mock the database module BEFORE importing FactsRepository ─────────────────

vi.mock('../../src/server/database.js', () => ({
  getDB: () => testDb,           // FactsRepository calls getDB() — return our test DB object
  dbAll: dbAllImpl,
  dbGet: dbGetImpl,
  // Other exports used elsewhere; stubs are fine here
  isTransactionActive: false,
  runInDbLock: async (fn: () => Promise<any>) => fn(),
}));

// ── Now import FactsRepository (after mock is in place) ──────────────────────

import { FactsRepository } from '../../src/server/services/FactsRepository.js';

// ── Schema setup ─────────────────────────────────────────────────────────────

async function createSchema(db: sqlite3.Database) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS MasterTickers (
      symbol TEXT,
      isin   TEXT,
      name   TEXT,
      exchange TEXT,
      segment  TEXT,
      sector   TEXT,
      industry TEXT,
      fmv_31_jan_2018 REAL,
      upstox_key_nse TEXT,
      upstox_key_bse TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS Portfolios (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      benchmark_symbol TEXT,
      type             TEXT,
      status           TEXT DEFAULT 'ACTIVE',
      base_currency    TEXT,
      member_id        INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS MemberPortfolioPermissions (
      member_id      INTEGER,
      portfolio_name TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS Holdings (
      portfolio      TEXT,
      symbol         TEXT,
      isin           TEXT,
      quantity       REAL,
      avg_buy_price  REAL,
      ltp            REAL,
      unrealized_pnl REAL,
      sector         TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS Transactions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         TEXT,
      portfolio    TEXT,
      type         TEXT,
      symbol       TEXT,
      isin         TEXT,
      quantity     REAL,
      price        REAL,
      net_amount   REAL,
      gross_amount REAL,
      brokerage    REAL,
      notes        TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS CustomStrategies (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT,
      parameters_json TEXT,
      is_active       INTEGER DEFAULT 1,
      created_at      TEXT,
      updated_at      TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS CorporateActions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol      TEXT,
      isin        TEXT,
      record_date TEXT,
      action_type TEXT,
      details     TEXT
    )`,
  ];
  for (const s of stmts) await run(db, s);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('FactsRepository — integration (real in-memory SQLite)', () => {
  beforeAll(async () => {
    testDb = await createTestDb();
    await createSchema(testDb);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    // Reset singleton + clear caches between tests
    (FactsRepository as any).instance = undefined;
  });

  // Helper: clear and re-seed tables
  async function clearTable(table: string) {
    await run(testDb, `DELETE FROM ${table}`);
  }

  // ── 1. getTicker — happy path ─────────────────────────────────────────────

  it('getTicker returns a row from MasterTickers by symbol', async () => {
    await clearTable('MasterTickers');
    await run(testDb,
      `INSERT INTO MasterTickers (symbol, isin, name, exchange, segment, sector)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['INFY', 'INE009A01021', 'Infosys Ltd', 'NSE', 'EQ', 'IT']
    );

    const repo = FactsRepository.getInstance();
    const ticker = await repo.getTicker('INFY');

    expect(ticker).not.toBeNull();
    expect(ticker!.symbol).toBe('INFY');
    expect(ticker!.isin).toBe('INE009A01021');
    expect(ticker!.name).toBe('Infosys Ltd');
    expect(ticker!.exchange).toBe('NSE');
  });

  // ── 2. getTicker — missing symbol ────────────────────────────────────────

  it('getTicker returns null for a symbol not in MasterTickers', async () => {
    await clearTable('MasterTickers');

    const repo = FactsRepository.getInstance();
    const ticker = await repo.getTicker('DOES_NOT_EXIST');
    expect(ticker).toBeNull();
  });

  // ── 3. getTicker — cache hit (second call uses cache) ────────────────────

  it('getTicker result is cached — same object returned on second call', async () => {
    await clearTable('MasterTickers');
    await run(testDb,
      `INSERT INTO MasterTickers (symbol, isin, name, exchange, segment)
       VALUES ('TCS', 'INE467B01029', 'TCS Ltd', 'NSE', 'EQ')`
    );

    const repo = FactsRepository.getInstance();
    const first  = await repo.getTicker('TCS');
    // Mutate the DB — cache should still serve stale data
    await run(testDb, `DELETE FROM MasterTickers WHERE symbol = 'TCS'`);
    const second = await repo.getTicker('TCS');

    expect(first).not.toBeNull();
    // If cached, second should be the same object reference
    expect(second).toBe(first);
  });

  // ── 4. getTicker — cache expires after TTL ───────────────────────────────

  it('getTicker re-fetches after TTL expires (Date.now mocked)', async () => {
    await clearTable('MasterTickers');
    await run(testDb,
      `INSERT INTO MasterTickers (symbol, isin, name, exchange, segment)
       VALUES ('WIPRO', 'INE075A01022', 'Wipro Ltd', 'NSE', 'EQ')`
    );

    const now = Date.now();
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    const repo = FactsRepository.getInstance();
    const first = await repo.getTicker('WIPRO');
    expect(first).not.toBeNull();

    // Advance time past 2-min TTL
    dateNowSpy.mockReturnValue(now + 3 * 60_000);
    // Update DB so we can detect re-fetch
    await run(testDb, `UPDATE MasterTickers SET name = 'Wipro Updated' WHERE symbol = 'WIPRO'`);

    const second = await repo.getTicker('WIPRO');
    expect(second!.name).toBe('Wipro Updated');

    dateNowSpy.mockRestore();
  });

  // ── 5. invalidateTicker forces re-fetch ──────────────────────────────────

  it('invalidateTicker forces a DB re-fetch on the next getTicker call', async () => {
    await clearTable('MasterTickers');
    await run(testDb,
      `INSERT INTO MasterTickers (symbol, isin, name, exchange, segment)
       VALUES ('HDFCBANK', 'INE040A01034', 'HDFC Bank', 'NSE', 'EQ')`
    );

    const repo = FactsRepository.getInstance();
    const first = await repo.getTicker('HDFCBANK');
    expect(first!.name).toBe('HDFC Bank');

    // Update DB, then invalidate cache
    await run(testDb, `UPDATE MasterTickers SET name = 'HDFC Bank Ltd' WHERE symbol = 'HDFCBANK'`);
    repo.invalidateTicker('HDFCBANK');

    const second = await repo.getTicker('HDFCBANK');
    expect(second!.name).toBe('HDFC Bank Ltd');
  });

  // ── 6. getNseEquityUniverse — only NSE + EQ rows ─────────────────────────

  it('getNseEquityUniverse returns only NSE EQ rows', async () => {
    await clearTable('MasterTickers');
    await run(testDb,
      `INSERT INTO MasterTickers (symbol, isin, name, exchange, segment) VALUES
       ('RELIANCE', 'INE002A01018', 'Reliance Industries', 'NSE', 'EQ'),
       ('RELI',     'INE002A01018', 'Reliance BSE',        'BSE', 'EQ'),
       ('NIFTY',    NULL,           'Nifty Index',          'NSE', 'INDEX')`
    );

    const repo = FactsRepository.getInstance();
    const universe = await repo.getNseEquityUniverse();

    expect(universe.length).toBe(1);
    expect(universe[0].symbol).toBe('RELIANCE');
  });

  // ── 7. searchTickers — case-insensitive partial match ────────────────────

  it('searchTickers returns matching rows case-insensitively', async () => {
    await clearTable('MasterTickers');
    await run(testDb,
      `INSERT INTO MasterTickers (symbol, isin, name, exchange, segment) VALUES
       ('INFY',   'INE009A01021', 'Infosys Limited', 'NSE', 'EQ'),
       ('INFOSYS','INE009A01021', 'Infosys BSE',     'BSE', 'EQ'),
       ('TCS',    'INE467B01029', 'Tata Consultancy', 'NSE', 'EQ')`
    );

    const repo = FactsRepository.getInstance();
    const results = await repo.searchTickers('infy');

    expect(results.length).toBeGreaterThanOrEqual(1);
    const symbols = results.map(r => r.symbol);
    expect(symbols).toContain('INFY');
  });

  // ── 8. listActivePortfolios — returns only ACTIVE ────────────────────────

  it('listActivePortfolios returns only ACTIVE portfolios', async () => {
    await clearTable('Portfolios');
    await run(testDb,
      `INSERT INTO Portfolios (name, status) VALUES
       ('FamilyFund', 'ACTIVE'),
       ('OldFund',    'ARCHIVED'),
       ('NewFund',    'ACTIVE')`
    );

    const repo = FactsRepository.getInstance();
    const portfolios = await repo.listActivePortfolios();

    expect(portfolios.length).toBe(2);
    expect(portfolios.map(p => p.name).sort()).toEqual(['FamilyFund', 'NewFund']);
  });

  // ── 9. listActivePortfolios — filters by memberId ────────────────────────

  it('listActivePortfolios(memberId) returns portfolios owned by or accessible to that member', async () => {
    await clearTable('Portfolios');
    await clearTable('MemberPortfolioPermissions');
    await run(testDb,
      `INSERT INTO Portfolios (name, status, member_id) VALUES
       ('MemberOwned',   'ACTIVE', 42),
       ('OtherMember',   'ACTIVE', 99),
       ('ArchivedMine',  'ARCHIVED', 42)`
    );
    await run(testDb,
      `INSERT INTO MemberPortfolioPermissions (member_id, portfolio_name) VALUES (42, 'OtherMember')`
    );

    const repo = FactsRepository.getInstance();
    const portfolios = await repo.listActivePortfolios(42);

    const names = portfolios.map(p => p.name);
    // Should include owned + permission-granted, both active
    expect(names).toContain('MemberOwned');
    expect(names).toContain('OtherMember');
    // Archived should not appear
    expect(names).not.toContain('ArchivedMine');
  });

  // ── 10. getPortfolio — returns row by name, null for missing ─────────────

  it('getPortfolio returns the portfolio row by name', async () => {
    await clearTable('Portfolios');
    await run(testDb,
      `INSERT INTO Portfolios (name, status, benchmark_symbol) VALUES ('NRIFund', 'ACTIVE', 'NIFTY50')`
    );

    const repo = FactsRepository.getInstance();
    const p = await repo.getPortfolio('NRIFund');
    expect(p).not.toBeNull();
    expect(p!.name).toBe('NRIFund');
    expect(p!.benchmark_symbol).toBe('NIFTY50');

    const missing = await repo.getPortfolio('__no_such_portfolio__');
    expect(missing == null).toBe(true); // dbGet returns undefined when no row found
  });

  // ── 11. getHoldings — returns holdings for a portfolio ───────────────────

  it('getHoldings returns all holdings for a given portfolio', async () => {
    await clearTable('Holdings');
    await run(testDb,
      `INSERT INTO Holdings (portfolio, symbol, isin, quantity, avg_buy_price) VALUES
       ('FundA', 'INFY', 'INE009A01021', 100, 1500.00),
       ('FundA', 'TCS',  'INE467B01029', 50,  3500.00),
       ('FundB', 'WIPRO','INE075A01022', 200, 450.00)`
    );

    const repo = FactsRepository.getInstance();
    const holdings = await repo.getHoldings('FundA');

    expect(holdings.length).toBe(2);
    const symbols = holdings.map(h => h.symbol);
    expect(symbols).toContain('INFY');
    expect(symbols).toContain('TCS');
  });

  // ── 12. getHolding — filters by portfolio + symbol ───────────────────────

  it('getHolding returns the single holding for portfolio + symbol', async () => {
    await clearTable('Holdings');
    await run(testDb,
      `INSERT INTO Holdings (portfolio, symbol, isin, quantity, avg_buy_price) VALUES
       ('FundA', 'INFY', 'INE009A01021', 100, 1500.00),
       ('FundA', 'TCS',  'INE467B01029', 50,  3500.00)`
    );

    const repo = FactsRepository.getInstance();
    const holding = await repo.getHolding('FundA', 'INFY');

    expect(holding).not.toBeNull();
    expect(holding!.symbol).toBe('INFY');
    expect(holding!.quantity).toBe(100);

    const missing = await repo.getHolding('FundA', 'NOSUCH');
    expect(missing == null).toBe(true); // dbGet returns undefined when no row found
  });

  // ── 13. getTransactions — returns all transactions for a portfolio ────────

  it('getTransactions returns transactions for the requested portfolio', async () => {
    await clearTable('Transactions');
    await run(testDb,
      `INSERT INTO Transactions (date, portfolio, type, symbol, quantity, price, net_amount) VALUES
       ('2024-01-10', 'FundA', 'BUY', 'INFY', 100, 1500, 150000),
       ('2024-01-15', 'FundA', 'SELL','INFY', 50,  1600, 80000),
       ('2024-01-12', 'FundB', 'BUY', 'TCS',  20,  3500, 70000)`
    );

    const repo = FactsRepository.getInstance();
    const txns = await repo.getTransactions({ portfolio: 'FundA' });

    expect(txns.length).toBe(2);
    expect(txns.every(t => t.portfolio === 'FundA')).toBe(true);
  });

  // ── 14. listStrategies(true) — active only ───────────────────────────────

  it('listStrategies(true) returns only active strategies', async () => {
    await clearTable('CustomStrategies');
    await run(testDb,
      `INSERT INTO CustomStrategies (name, parameters_json, is_active) VALUES
       ('MomentumV1', '{}', 1),
       ('MomentumV2', '{}', 0),
       ('SMC',        '{}', 1)`
    );

    const repo = FactsRepository.getInstance();
    const strategies = await repo.listStrategies(true);

    expect(strategies.length).toBe(2);
    expect(strategies.every(s => s.is_active === 1)).toBe(true);
  });

  // ── 15. getStrategy — returns by id, null for missing ────────────────────

  it('getStrategy returns a strategy by id, null for missing', async () => {
    await clearTable('CustomStrategies');
    await run(testDb,
      `INSERT INTO CustomStrategies (id, name, parameters_json, is_active) VALUES
       (101, 'VPA', '{"param":1}', 1)`
    );

    const repo = FactsRepository.getInstance();
    const s = await repo.getStrategy(101);
    expect(s).not.toBeNull();
    expect(s!.name).toBe('VPA');

    const missing = await repo.getStrategy(9999);
    expect(missing == null).toBe(true); // dbGet returns undefined when no row found
  });

  // ── 16. getCorporateActions — returns actions for a symbol ───────────────

  it('getCorporateActions returns corporate actions for a given symbol', async () => {
    await clearTable('CorporateActions');
    await run(testDb,
      `INSERT INTO CorporateActions (symbol, isin, record_date, action_type, details) VALUES
       ('INFY', 'INE009A01021', '2024-03-01', 'DIVIDEND', '20 per share'),
       ('INFY', 'INE009A01021', '2023-09-01', 'SPLIT',    '2:1'),
       ('TCS',  'INE467B01029', '2024-02-01', 'DIVIDEND', '50 per share')`
    );

    const repo = FactsRepository.getInstance();
    const actions = await repo.getCorporateActions('INFY');

    expect(actions.length).toBe(2);
    expect(actions.every(a => a.symbol === 'INFY')).toBe(true);
    // Should be ordered by record_date DESC
    expect(actions[0].record_date).toBe('2024-03-01');
  });

  // ── 17. getCorporateActions — fromDate filter ─────────────────────────────

  it('getCorporateActions with fromDate filters out older records', async () => {
    await clearTable('CorporateActions');
    await run(testDb,
      `INSERT INTO CorporateActions (symbol, isin, record_date, action_type) VALUES
       ('WIPRO', 'INE075A01022', '2024-06-01', 'DIVIDEND'),
       ('WIPRO', 'INE075A01022', '2023-01-01', 'DIVIDEND')`
    );

    const repo = FactsRepository.getInstance();
    const actions = await repo.getCorporateActions('WIPRO', '2024-01-01');

    expect(actions.length).toBe(1);
    expect(actions[0].record_date).toBe('2024-06-01');
  });

  // ── 18. getHoldings — multiple portfolios ────────────────────────────────

  it('getHoldings accepts an array of portfolio names', async () => {
    await clearTable('Holdings');
    await run(testDb,
      `INSERT INTO Holdings (portfolio, symbol, isin, quantity, avg_buy_price) VALUES
       ('FundA', 'INFY', 'INE009A01021', 100, 1500),
       ('FundB', 'TCS',  'INE467B01029', 50,  3500),
       ('FundC', 'WIPRO','INE075A01022', 200, 450)`
    );

    const repo = FactsRepository.getInstance();
    const holdings = await repo.getHoldings(['FundA', 'FundB']);

    expect(holdings.length).toBe(2);
    const portfolios = new Set(holdings.map(h => h.portfolio));
    expect(portfolios.has('FundA')).toBe(true);
    expect(portfolios.has('FundB')).toBe(true);
    expect(portfolios.has('FundC')).toBe(false);
  });

  // ── 19. getHoldings — no arg returns all holdings ────────────────────────

  it('getHoldings with no argument returns all holdings', async () => {
    await clearTable('Holdings');
    await run(testDb,
      `INSERT INTO Holdings (portfolio, symbol, isin, quantity, avg_buy_price) VALUES
       ('FundA', 'INFY', 'INE009A01021', 100, 1500),
       ('FundB', 'TCS',  'INE467B01029', 50,  3500)`
    );

    const repo = FactsRepository.getInstance();
    const all = await repo.getHoldings();
    expect(all.length).toBe(2);
  });
});
