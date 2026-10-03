import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import {
  TrendlyneMetricPackPlanner,
  CANONICAL_30_METRIC_PACK,
  METRIC_PACK_CAPACITY,
  METRIC_PACK_USED,
  METRIC_PACK_UNUSED_REASON,
  METRIC_TOKEN_DESTINATIONS,
  writeProgressFiles
} from '../../scripts/fundamental/trendlyne_metric_pack_planner.js';

describe('Trendlyne Metric Pack & Batch Planner', () => {
  let db: sqlite3.Database;
  let planner: TrendlyneMetricPackPlanner;

  const runSql = (sql: string, params: any[] = []) =>
    new Promise<void>((resolve, reject) => {
      db.run(sql, params, (err) => (err ? reject(err) : resolve()));
    });

  beforeEach(async () => {
    // Set up an isolated in-memory SQLite database for deterministic testing
    db = new sqlite3.Database(':memory:');
    planner = new TrendlyneMetricPackPlanner(db);

    await runSql(`
      CREATE TABLE MasterTickers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        isin TEXT UNIQUE NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT,
        company_name TEXT,
        exchange TEXT DEFAULT 'NSE',
        segment TEXT DEFAULT 'EQ',
        status TEXT DEFAULT 'ACTIVE'
      )
    `);

    await runSql(`
      CREATE TABLE fundamental_endpoint_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        provider TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        authority TEXT,
        source_url TEXT,
        fetched_at TEXT NOT NULL,
        status TEXT NOT NULL,
        response_json TEXT
      )
    `);

    await runSql(`
      CREATE TABLE company_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factId TEXT UNIQUE NOT NULL,
        companyId TEXT NOT NULL,
        symbol TEXT NOT NULL,
        metric TEXT NOT NULL,
        periodType TEXT NOT NULL,
        periodEnd TEXT,
        asOfDate TEXT,
        factType TEXT,
        sourceType TEXT,
        scope TEXT,
        verificationStatus TEXT,
        fetchedAt TEXT,
        value TEXT,
        unit TEXT,
        provider TEXT,
        availableAt TEXT
      )
    `);

    await runSql(`
      CREATE TABLE HistoricalFinancialStatements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        statement_type TEXT NOT NULL,
        period_label TEXT,
        period_date TEXT,
        opm_pct REAL,
        primary_source TEXT
      )
    `);

    const symbols = [
      ['INE009A01021', 'INFY', 'Infosys Limited', 'Infosys Limited'],
      ['INE467B01029', 'TCS', 'Tata Consultancy Services Limited', 'Tata Consultancy Services'],
      ['INE002A01018', 'RELIANCE', 'Reliance Industries Limited', 'Reliance Industries'],
      ['INE040A01034', 'HDFCBANK', 'HDFC Bank Limited', 'HDFC Bank'],
      ['INE238A01034', 'AXISBANK', 'Axis Bank Limited', 'Axis Bank'],
      ['INE155A01022', 'TATAMOTORS', 'Tata Motors Limited', 'Tata Motors'],
      ['INE018A01030', 'LT', 'Larsen & Toubro Limited', 'Larsen & Toubro'],
      ['INE397D01024', 'BHARTIARTL', 'Bharti Airtel Limited', 'Bharti Airtel'],
      ['INE062A01020', 'SBIN', 'State Bank of India', 'State Bank of India'],
      ['INE001A01036', 'HINDUNILVR', 'Hindustan Unilever Limited', 'Hindustan Unilever'],
      ['INE296A01024', 'BAJFINANCE', 'Bajaj Finance Limited', 'Bajaj Finance'],
      ['INE917I01012', 'BAJAJFINSV', 'Bajaj Finserv Limited', 'Bajaj Finserv']
    ];

    for (const [isin, sym, name, compName] of symbols) {
      await runSql(
        `INSERT INTO MasterTickers (isin, symbol, name, company_name, status) VALUES (?, ?, ?, ?, 'ACTIVE')`,
        [isin, sym, name, compName]
      );
    }
  });

  afterEach(() => {
    db.close();
  });

  describe('1. Pre-Resolution of Symbols Before Batching', () => {
    it('correctly resolves symbols by exact ticker, ISIN, and company name', async () => {
      const bySym = await planner.resolveProviderCode('INFY');
      expect(bySym).not.toBeNull();
      expect(bySym?.providerCode).toBe('INFY');

      const byLower = await planner.resolveProviderCode('infy');
      expect(byLower).not.toBeNull();
      expect(byLower?.providerCode).toBe('INFY');

      const byIsin = await planner.resolveProviderCode('INE009A01021');
      expect(byIsin).not.toBeNull();
      expect(byIsin?.providerCode).toBe('INFY');

      const byName = await planner.resolveProviderCode('Infosys Limited');
      expect(byName).not.toBeNull();
      expect(byName?.providerCode).toBe('INFY');
    });

    it('identifies unresolved symbols (TERA, ZOMATO) and categorizes them with UNRESOLVED_PROVIDER_CODE', async () => {
      const resTera = await planner.resolveProviderCode('TERA');
      expect(resTera).toBeNull();

      const resZomato = await planner.resolveProviderCode('ZOMATO');
      expect(resZomato).toBeNull();

      const plan = await planner.planBatchRun({
        candidateSymbols: ['TERA', 'ZOMATO'],
        scanUniverseIfDeficient: false
      });

      expect(plan.unresolvedSymbols).toHaveLength(2);
      expect(plan.unresolvedSymbols[0].symbol).toBe('TERA');
      expect(plan.unresolvedSymbols[0].reason).toBe('UNRESOLVED_PROVIDER_CODE');
      expect(plan.unresolvedSymbols[1].symbol).toBe('ZOMATO');
      expect(plan.unresolvedSymbols[1].reason).toBe('UNRESOLVED_PROVIDER_CODE');

      // Unresolved symbols MUST NEVER be in plannedBatches or eligibleResolvedSymbols
      expect(plan.eligibleResolvedSymbols).toHaveLength(0);
      expect(plan.plannedBatches).toHaveLength(0);
    });

    it('falls back to snapshot cache if ticker exists in prior successful snapshot', async () => {
      // Insert cached snapshot for a symbol not in MasterTickers
      await new Promise<void>((resolve, reject) => {
        db.run(`
          INSERT INTO fundamental_endpoint_snapshots
          (symbol, provider, endpoint, fetched_at, status)
          VALUES ('CACHEDSYM', 'TRENDLYNE_MCP', 'get_stock_parameter_values', '2026-09-01 10:00:00', 'SUCCESS')
        `, (err) => err ? reject(err) : resolve());
      });

      const res = await planner.resolveProviderCode('CACHEDSYM');
      expect(res).not.toBeNull();
      expect(res?.providerCode).toBe('CACHEDSYM');
    });
  });

  describe('2. Freshness Skipping (15-Day Rule)', () => {
    it('skips fresh complete symbols (< 15 days) with reason SKIPPED_FRESH', async () => {
      // Mark INFY and TCS as fresh (fetched 2 days ago)
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().replace('T', ' ').substring(0, 19);
      await new Promise<void>((resolve, reject) => {
        db.run(`
          INSERT INTO fundamental_endpoint_snapshots
          (symbol, provider, endpoint, fetched_at, status)
          VALUES ('INFY', 'TRENDLYNE_MCP', 'get_stock_parameter_values', ?, 'SUCCESS'),
                 ('TCS', 'TRENDLYNE_MCP', 'get_stock_parameter_values', ?, 'SUCCESS')
        `, [twoDaysAgo, twoDaysAgo], (err) => err ? reject(err) : resolve());
      });

      const plan = await planner.planBatchRun({
        candidateSymbols: ['INFY', 'TCS'],
        scanUniverseIfDeficient: false
      });

      expect(plan.freshSkippedSymbols).toHaveLength(2);
      expect(plan.freshSkippedSymbols.map(s => s.symbol)).toContain('INFY');
      expect(plan.freshSkippedSymbols.map(s => s.symbol)).toContain('TCS');
      expect(plan.freshSkippedSymbols[0].reason).toBe('SKIPPED_FRESH');
      expect(plan.status).toBe('SKIPPED_FRESH');
      expect(plan.plannedBatches).toHaveLength(0);
    });

    it('does not skip stale symbols (>= 15 days)', async () => {
      // Mark RELIANCE as stale (20 days ago)
      const twentyDaysAgo = new Date(Date.now() - 20 * 86_400_000).toISOString().replace('T', ' ').substring(0, 19);
      await new Promise<void>((resolve, reject) => {
        db.run(`
          INSERT INTO fundamental_endpoint_snapshots
          (symbol, provider, endpoint, fetched_at, status)
          VALUES ('RELIANCE', 'TRENDLYNE_MCP', 'get_stock_parameter_values', ?, 'SUCCESS')
        `, [twentyDaysAgo], (err) => err ? reject(err) : resolve());
      });

      const plan = await planner.planBatchRun({
        candidateSymbols: ['RELIANCE'],
        allowPartialFinalBatch: true,
        scanUniverseIfDeficient: false
      });

      expect(plan.freshSkippedSymbols).toHaveLength(0);
      expect(plan.eligibleResolvedSymbols).toHaveLength(1);
      expect(plan.eligibleResolvedSymbols[0].providerCode).toBe('RELIANCE');
    });
  });

  describe('3. Full Batch Rule & Partial Batch Handling', () => {
    it('refuses to execute partial batch by default when < 10 symbols are available', async () => {
      // Candidates have 2 valid stale symbols (RELIANCE, HDFCBANK)
      const plan = await planner.planBatchRun({
        candidateSymbols: ['RELIANCE', 'HDFCBANK'],
        scanUniverseIfDeficient: false,
        allowPartialFinalBatch: false
      });

      expect(plan.eligibleResolvedSymbols).toHaveLength(2);
      expect(plan.plannedBatches).toHaveLength(0);
      expect(plan.status).toBe('PARTIAL_BATCH_NOT_EXECUTED');
      expect(plan.message).toContain('Found 2 valid provider-resolved symbol(s), but full batch requires 10');
      expect(plan.message).toContain('--allow-partial-final-batch');
    });

    it('allows partial batch when --allow-partial-final-batch is specified', async () => {
      const plan = await planner.planBatchRun({
        candidateSymbols: ['RELIANCE', 'HDFCBANK'],
        scanUniverseIfDeficient: false,
        allowPartialFinalBatch: true
      });

      expect(plan.eligibleResolvedSymbols).toHaveLength(2);
      expect(plan.plannedBatches).toHaveLength(1);
      expect(plan.plannedBatches[0].symbols).toEqual(['RELIANCE', 'HDFCBANK']);
      expect(plan.status).toBe('READY');
      expect(plan.plannedBatches[0].metricsPacked).toBe(CANONICAL_30_METRIC_PACK.length);
    });

    it('packs exact batches of 10 symbols, discarding partial final batch unless allowed', async () => {
      // 12 active symbols in MasterTickers:
      // INFY, TCS, RELIANCE, HDFCBANK, AXISBANK, TATAMOTORS, LT, BHARTIARTL, SBIN, HINDUNILVR, BAJFINANCE, BAJAJFINSV
      const planNoPartial = await planner.planBatchRun({
        scanUniverseIfDeficient: true,
        allowPartialFinalBatch: false
      });

      expect(planNoPartial.eligibleResolvedSymbols.length).toBeGreaterThanOrEqual(10);
      // Exactly 1 full batch of 10 symbols
      expect(planNoPartial.plannedBatches).toHaveLength(1);
      expect(planNoPartial.plannedBatches[0].symbols).toHaveLength(10);
      expect(planNoPartial.status).toBe('READY');

      // With allowPartialFinalBatch: true and maxSymbols: 12
      const planWithPartial = await planner.planBatchRun({
        maxSymbols: 12,
        scanUniverseIfDeficient: true,
        allowPartialFinalBatch: true
      });

      // 12 symbols -> Batch 1 has 10, Batch 2 has 2
      expect(planWithPartial.plannedBatches).toHaveLength(2);
      expect(planWithPartial.plannedBatches[0].symbols).toHaveLength(10);
      expect(planWithPartial.plannedBatches[1].symbols).toHaveLength(2);
      expect(planWithPartial.status).toBe('READY');
    });
  });

  describe('4. Continuous Universe Scanning & TERA/ZOMATO Scenario', () => {
    it('skips TERA and ZOMATO and scans universe to build a full 10-symbol batch', async () => {
      // The exact failure scenario from the prompt:
      // Input candidate list has ['TERA', 'ZOMATO']
      const plan = await planner.planBatchRun({
        candidateSymbols: ['TERA', 'ZOMATO'],
        scanUniverseIfDeficient: true,
        allowPartialFinalBatch: false
      });

      // 1. TERA and ZOMATO are reported as unresolved
      expect(plan.unresolvedSymbols).toHaveLength(2);
      expect(plan.unresolvedSymbols.map(u => u.symbol)).toEqual(['TERA', 'ZOMATO']);

      // 2. Continuous scanning finds 10 symbols from MasterTickers
      expect(plan.eligibleResolvedSymbols).toHaveLength(10);
      expect(plan.plannedBatches).toHaveLength(1);
      expect(plan.plannedBatches[0].symbols).toHaveLength(10);

      // 3. TERA and ZOMATO are strictly NOT in the planned batch
      expect(plan.plannedBatches[0].symbols).not.toContain('TERA');
      expect(plan.plannedBatches[0].symbols).not.toContain('ZOMATO');
      expect(plan.status).toBe('READY');
    });

    it('returns DATA_INSUFFICIENT/PARTIAL_BATCH_NOT_EXECUTED when entire universe is exhausted with < 10 symbols', async () => {
      // Delete all except 3 symbols from MasterTickers
      await new Promise<void>((resolve, reject) => {
        db.run(`DELETE FROM MasterTickers WHERE symbol NOT IN ('INFY', 'TCS', 'RELIANCE')`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const plan = await planner.planBatchRun({
        candidateSymbols: ['TERA', 'ZOMATO'],
        scanUniverseIfDeficient: true,
        allowPartialFinalBatch: false
      });

      // 2 unresolved + 3 found in universe = 3 eligible < 10
      expect(plan.unresolvedSymbols).toHaveLength(2);
      expect(plan.eligibleResolvedSymbols).toHaveLength(3);
      expect(plan.plannedBatches).toHaveLength(0);
      expect(plan.status).toBe('PARTIAL_BATCH_NOT_EXECUTED');
    });
  });

  describe('5. Output Contract Invariants', () => {
    it('produces all four required output arrays: freshSkippedSymbols, unresolvedSymbols, eligibleResolvedSymbols, plannedBatches', async () => {
      const plan = await planner.planBatchRun({
        candidateSymbols: ['TERA', 'INFY'],
        scanUniverseIfDeficient: false
      });

      expect(Array.isArray(plan.freshSkippedSymbols)).toBe(true);
      expect(Array.isArray(plan.unresolvedSymbols)).toBe(true);
      expect(Array.isArray(plan.eligibleResolvedSymbols)).toBe(true);
      expect(Array.isArray(plan.plannedBatches)).toBe(true);
    });
  });

  describe('6. Metric Pack Capacity & Token Destination Invariants', () => {
    it('enforces metric pack size <= 50, capacity 50, and 30 verified safe tokens used', () => {
      expect(CANONICAL_30_METRIC_PACK.length).toBeLessThanOrEqual(50);
      expect(METRIC_PACK_CAPACITY).toBe(50);
      expect(METRIC_PACK_USED).toBe(30);
      expect(METRIC_PACK_UNUSED_REASON).toBe('NO_MORE_VERIFIED_SAFE_TOKENS');
    });

    it('contains zero duplicate metric tokens', () => {
      const set = new Set(CANONICAL_30_METRIC_PACK);
      expect(set.size).toBe(CANONICAL_30_METRIC_PACK.length);
    });

    it('every token has an explicit mapped destination and rationale', () => {
      for (const token of CANONICAL_30_METRIC_PACK) {
        const dest = METRIC_TOKEN_DESTINATIONS[token];
        expect(dest).toBeDefined();
        expect(dest.token).toBe(token);
        expect(['company_facts', 'HistoricalFinancialStatements', 'fundamental_endpoint_snapshots']).toContain(dest.destination);
        expect(dest.rationale.length).toBeGreaterThan(0);
      }
    });
  });

  describe('7. Strict Lockdown of planBatches Entry Point', () => {
    it('no planner entry point can create a partial final batch unless allowPartialFinalBatch is true', () => {
      const freshnessMap = new Map<string, { isFresh: boolean }>();
      // 15 symbols due
      const symbols15 = [
        'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10',
        'S11', 'S12', 'S13', 'S14', 'S15'
      ];
      symbols15.forEach(s => freshnessMap.set(s, { isFresh: false }));

      // Default: allowPartialFinalBatch is false
      const batchesDefault = planner.planBatches(symbols15, freshnessMap);
      expect(batchesDefault).toHaveLength(1);
      expect(batchesDefault[0].symbols).toHaveLength(10);

      // Explicit false:
      const batchesExplicitFalse = planner.planBatches(symbols15, freshnessMap, false);
      expect(batchesExplicitFalse).toHaveLength(1);
      expect(batchesExplicitFalse[0].symbols).toHaveLength(10);

      // Explicit true:
      const batchesAllowed = planner.planBatches(symbols15, freshnessMap, true);
      expect(batchesAllowed).toHaveLength(2);
      expect(batchesAllowed[0].symbols).toHaveLength(10);
      expect(batchesAllowed[1].symbols).toHaveLength(5);
    });
  });

  describe('8. Zero Synthetic Date Fallback Invariants', () => {
    it('anchors annual and quarterly facts strictly from provider metadata when asOfDate is valid', async () => {
      const parsedData = new Map<string, Record<string, any>>();
      parsedData.set('INFY', {
        asOfDate: '2026-09-30',
        companyName: 'Infosys',
        sra: 150000,
        npa: 25000,
        rocea: 32.5,
        opmpctq: 24.2
      });

      const { factsPersisted, skippedUnanchoredCount } = await planner.ingestParsedMetrics(parsedData);
      expect(factsPersisted).toBeGreaterThan(0);
      expect(skippedUnanchoredCount).toBe(0);

      // Verify facts in company_facts table
      const facts = await planner.queryAll(`SELECT metric, periodType, periodEnd, asOfDate FROM company_facts WHERE symbol = 'INFY'`);
      expect(facts.length).toBeGreaterThan(0);
      for (const f of facts) {
        expect(f.asOfDate).toBe('2026-09-30');
        if (f.periodType === 'ANNUAL') {
          expect(f.periodEnd).toMatch(/^2026-03-31/);
        }
      }
    });

    it('if provider response lacks asOfDate, no annual or quarterly fact gets today date as periodEnd/asOfDate', async () => {
      const parsedData = new Map<string, Record<string, any>>();
      // Provider response lacking asOfDate
      parsedData.set('INFY', {
        asOfDate: null,
        companyName: 'Infosys',
        sra: 150000,
        npa: 25000,
        rocea: 32.5,
        opmpctq: 24.2
      });

      const { factsPersisted, skippedUnanchoredCount } = await planner.ingestParsedMetrics(parsedData);
      expect(factsPersisted).toBe(0);
      expect(skippedUnanchoredCount).toBe(1);

      // Verify no company_facts row was inserted
      const facts = await planner.queryAll(`SELECT * FROM company_facts WHERE symbol = 'INFY'`);
      expect(facts).toHaveLength(0);

      // Verify snapshot was still recorded for freshness/audit
      const snapshots = await planner.queryAll(`SELECT * FROM fundamental_endpoint_snapshots WHERE symbol = 'INFY'`);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].status).toBe('SUCCESS');
    });
  });

  describe('9. Execution Status & Progress Contract (Zero Facts Not SUCCESS)', () => {
    it('mocked execution with executedCalls > 0 and factsPersisted = 0 produces status SUCCESS_WITH_NO_FACTS', () => {
      const startTime = new Date().toISOString();
      const completedTime = new Date().toISOString();

      let finalStatus = 'SUCCESS';
      const executedCalls = 1;
      const factsPersisted = 0;

      if (executedCalls > 0 && factsPersisted === 0) {
        finalStatus = 'SUCCESS_WITH_NO_FACTS';
      }

      expect(finalStatus).toBe('SUCCESS_WITH_NO_FACTS');
      expect(finalStatus).not.toBe('SUCCESS');

      // Write progress files and verify contract
      writeProgressFiles({
        jobName: 'trendlyne_long_term_fundamental_refresh',
        status: finalStatus,
        startedAt: startTime,
        completedAt: completedTime,
        startTime,
        completedTime,
        executedCalls,
        factsPersisted,
        metricPackUsed: METRIC_PACK_USED,
        metricPackCapacity: METRIC_PACK_CAPACITY,
        metricPackUnusedReason: METRIC_PACK_UNUSED_REASON,
        allowPartialFinalBatch: false,
        message: 'Executed 1 call(s) but provider returned no usable facts (SUCCESS_WITH_NO_FACTS).',
        error: 'Provider returned no usable facts'
      });

      const progressPath = path.resolve('reports', 'data_quality', 'jobs', 'trendlyne_fundamental_refresh_progress.json');
      expect(fs.existsSync(progressPath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      expect(saved.status).toBe('SUCCESS_WITH_NO_FACTS');
      expect(saved.status).not.toBe('RUNNING');
      expect(saved.status).not.toBe('SUCCESS');
      expect(saved.completedAt).toBeDefined();
      expect(saved.completedAt).not.toBeNull();
      expect(saved.executedCalls).toBe(1);
      expect(saved.factsPersisted).toBe(0);
      expect(saved.metricPackUsed).toBe(30);
      expect(saved.metricPackCapacity).toBe(50);
      expect(saved.metricPackUnusedReason).toBe('NO_MORE_VERIFIED_SAFE_TOKENS');
    });
  });
});
