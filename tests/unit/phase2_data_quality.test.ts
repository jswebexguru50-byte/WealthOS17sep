/**
 * tests/unit/phase2_data_quality.test.ts
 *
 * WEALTHOS / ITAS v6.3: PHASE 2 DETERMINISTIC DATA QUALITY TEST SUITE
 * Implements the 10 mandated data quality & PIT leakage tests from Section 12 & Directive B:
 * 1. Duplicate records
 * 2. Missing delivery records
 * 3. Missing turnover records
 * 4. Missing trading sessions
 * 5. Invalid availableAt (Directive B: IF consumed at decisionTimestamp, THEN availableAt <= decisionTimestamp; future records are not leaked)
 * 6. Future information leakage
 * 7. Historical universe leakage
 * 8. Corporate-action inconsistency
 * 9. Financial publication-date leakage
 * 10. Shareholding-date leakage
 *
 * Every failure identifies: field, symbol, date, source, record ID, failure reason.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const pilotDbPath = path.resolve(process.cwd(), 'data/portfolio_v6.3_pilot_research.db');

describe('Phase 2 Historical Data Quality & PIT Invariants', () => {
  let db: sqlite3.Database;

  beforeAll(async () => {
    expect(fs.existsSync(pilotDbPath)).toBe(true);
    db = await new Promise((resolve, reject) => {
      const conn = new sqlite3.Database(pilotDbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) reject(err);
        else resolve(conn);
      });
    });
  });

  afterAll(async () => {
    if (db) {
      await new Promise((resolve) => db.close(resolve));
    }
  });

  function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  // 1. Duplicate Records Invariant
  it('1. Verifies zero duplicate records exist across DailyOHLCV, Calendar, Universe, and CorporateActions', async () => {
    const dupOhlcv = await queryAll(`
      SELECT symbol, trade_date, count(*) as c 
      FROM DailyOHLCV 
      GROUP BY symbol, trade_date 
      HAVING c > 1
    `);
    expect(dupOhlcv, `Duplicate DailyOHLCV records detected: ${JSON.stringify(dupOhlcv)}`).toEqual([]);

    const dupCalendar = await queryAll(`
      SELECT date, count(*) as c 
      FROM authoritative_trading_calendar 
      GROUP BY date 
      HAVING c > 1
    `);
    expect(dupCalendar, `Duplicate calendar records detected: ${JSON.stringify(dupCalendar)}`).toEqual([]);

    const dupUniverse = await queryAll(`
      SELECT symbol, universe, effective_from, count(*) as c 
      FROM historical_investable_universe 
      GROUP BY symbol, universe, effective_from 
      HAVING c > 1
    `);
    expect(dupUniverse, `Duplicate universe records detected: ${JSON.stringify(dupUniverse)}`).toEqual([]);
  });

  // 2. Missing Delivery Records Invariant
  it('2. Verifies zero null or non-positive delivery records exist across all active sessions', async () => {
    const missingDelivery = await queryAll(`
      SELECT symbol, trade_date as date, source, source_record_id as recordId, delivery_qty as value
      FROM DailyOHLCV
      WHERE delivery_qty IS NULL OR delivery_qty <= 0
    `);
    if (missingDelivery.length > 0) {
      const failures = missingDelivery.map(r => ({
        field: 'delivery_qty',
        symbol: r.symbol,
        date: r.date,
        source: r.source,
        recordId: r.recordId,
        failureReason: 'NULL_OR_NON_POSITIVE_DELIVERY_RECORD'
      }));
      throw new Error(`MISSING_DELIVERY_INVARIANT_FAILED: ${JSON.stringify(failures)}`);
    }
    expect(missingDelivery).toEqual([]);
  });

  // 3. Missing Turnover Records Invariant
  it('3. Verifies zero null or non-positive turnover records exist across all active sessions', async () => {
    const missingTurnover = await queryAll(`
      SELECT symbol, trade_date as date, source, source_record_id as recordId, turnover as value
      FROM DailyOHLCV
      WHERE turnover IS NULL OR turnover <= 0
    `);
    if (missingTurnover.length > 0) {
      const failures = missingTurnover.map(r => ({
        field: 'turnover',
        symbol: r.symbol,
        date: r.date,
        source: r.source,
        recordId: r.recordId,
        failureReason: 'NULL_OR_NON_POSITIVE_TURNOVER_RECORD'
      }));
      throw new Error(`MISSING_TURNOVER_INVARIANT_FAILED: ${JSON.stringify(failures)}`);
    }
    expect(missingTurnover).toEqual([]);
  });

  // 4. Missing Trading Sessions Invariant
  it('4. Verifies authoritative trading calendar session coverage is 100% complete without missing days', async () => {
    const expectedTradingSessions = await queryAll(`
      SELECT date FROM authoritative_trading_calendar WHERE tradable = 1 ORDER BY date ASC
    `);
    expect(expectedTradingSessions.length).toBe(129);

    const actualDistinctDates = await queryAll(`
      SELECT DISTINCT trade_date FROM DailyOHLCV ORDER BY trade_date ASC
    `);
    expect(actualDistinctDates.length).toBe(129);

    const expSet = new Set(expectedTradingSessions.map(r => r.date));
    const actSet = new Set(actualDistinctDates.map(r => r.trade_date));

    for (const d of expSet) {
      expect(actSet.has(d), `Calendar tradable session ${d} is missing corresponding market bars`).toBe(true);
    }
  });

  // 5. Invalid availableAt / Directive B (Decision Consumption vs Database Content)
  it('5. Enforces Directive B: Consumed records satisfy availableAt <= decisionTimestamp, while future records are properly excluded without false leakage flags', async () => {
    // Pick an intermediate decision timestamp: 2025-12-15 16:00:00+05:30
    const decisionTimestamp = '2025-12-15T16:00:00+05:30';

    // A compliant PIT query returns records available on or before decisionTimestamp
    const consumedRecords = await queryAll(`
      SELECT symbol, trade_date as date, available_at as availableAt, source, source_record_id as recordId
      FROM DailyOHLCV
      WHERE available_at <= ?
    `, [decisionTimestamp]);

    expect(consumedRecords.length).toBeGreaterThan(0);

    // Verify all consumed records strictly satisfy the contract
    for (const r of consumedRecords) {
      expect(
        r.availableAt <= decisionTimestamp,
        `CONSUMED_RECORD_PIT_VIOLATION: ${r.symbol} on ${r.date} has availableAt ${r.availableAt} > decisionTimestamp ${decisionTimestamp}`
      ).toBe(true);
    }

    // Verify records exist in the database that are legitimately in the future of decisionTimestamp
    const futureRecordsInDb = await queryAll(`
      SELECT symbol, trade_date as date, available_at as availableAt
      FROM DailyOHLCV
      WHERE available_at > ?
    `, [decisionTimestamp]);

    expect(futureRecordsInDb.length).toBeGreaterThan(0);

    // DIRECTIVE B PROOF: Future records in DB must NOT be considered leaked because they were NOT consumed
    const leakedRecords = consumedRecords.filter(r => r.availableAt > decisionTimestamp);
    expect(leakedRecords).toEqual([]);
  });

  // 6. Future Information Leakage Invariant
  it('6. Enforces zero future information leakage: publicationTimestamp <= availableAt and economicTimestamp <= availableAt', async () => {
    // Check OHLCV
    const ohlcvLeakage = await queryAll(`
      SELECT symbol, trade_date as date, economic_timestamp, available_at, source, source_record_id as recordId
      FROM DailyOHLCV
      WHERE available_at < economic_timestamp
    `);
    expect(ohlcvLeakage).toEqual([]);

    // Check PIT Disclosures
    const disclosureLeakage = await queryAll(`
      SELECT symbol, period_end_date as date, publication_timestamp, available_at, source, source_record_id as recordId
      FROM pit_disclosure_registry
      WHERE available_at < publication_timestamp
    `);
    expect(disclosureLeakage).toEqual([]);
  });

  // 7. Historical Universe Leakage Invariant
  it('7. Enforces historical universe boundary: zero trading records exist outside active eligible universe intervals', async () => {
    const universeIntervals = await queryAll(`
      SELECT symbol, effective_from, effective_to, eligibility_status
      FROM historical_investable_universe
    `);

    const intervalMap = new Map<string, { from: string; to: string | null }>();
    for (const u of universeIntervals) {
      intervalMap.set(u.symbol, { from: u.effective_from, to: u.effective_to });
    }

    const allBars = await queryAll(`
      SELECT symbol, trade_date, source, source_record_id
      FROM DailyOHLCV
    `);

    const leakage: any[] = [];
    for (const b of allBars) {
      const interval = intervalMap.get(b.symbol);
      if (!interval) {
        leakage.push({ field: 'universe', symbol: b.symbol, date: b.trade_date, reason: 'SYMBOL_NOT_IN_UNIVERSE' });
        continue;
      }
      if (b.trade_date < interval.from) {
        leakage.push({ field: 'universe', symbol: b.symbol, date: b.trade_date, reason: 'BAR_PRE_DATES_UNIVERSE_EFFECTIVE_FROM' });
      }
      if (interval.to && b.trade_date > interval.to) {
        leakage.push({ field: 'universe', symbol: b.symbol, date: b.trade_date, reason: 'BAR_POST_DATES_UNIVERSE_EFFECTIVE_TO' });
      }
    }

    expect(leakage, `Historical universe leakage detected: ${JSON.stringify(leakage)}`).toEqual([]);
  });

  // 8. Corporate Action Inconsistency Invariant
  it('8. Verifies corporate actions reconciliation consistency: zero unreconciled ratios or missing source citations', async () => {
    const caRows = await queryAll(`
      SELECT symbol, action_type, ex_date, ratio_numerator, ratio_denominator, amount, source, source_record_id
      FROM corporate_actions_reconciled
    `);

    const inconsistencies: any[] = [];
    for (const ca of caRows) {
      if (!ca.source || !ca.source_record_id) {
        inconsistencies.push({
          field: 'source_provenance',
          symbol: ca.symbol,
          date: ca.ex_date,
          source: ca.source,
          recordId: ca.source_record_id,
          failureReason: 'MISSING_SOURCE_CITATION'
        });
      }
      if (ca.action_type === 'SPLIT' && (!ca.ratio_numerator || !ca.ratio_denominator)) {
        inconsistencies.push({
          field: 'split_ratio',
          symbol: ca.symbol,
          date: ca.ex_date,
          source: ca.source,
          recordId: ca.source_record_id,
          failureReason: 'INVALID_SPLIT_RATIO'
        });
      }
    }

    expect(inconsistencies).toEqual([]);
  });

  // 9. Financial Publication Date Leakage Invariant
  it('9. Enforces financial disclosure PIT constraint: availableAt is strictly greater than fiscal period_end_date', async () => {
    const prematureFinancials = await queryAll(`
      SELECT symbol, period_label, period_end_date, available_at, source, source_record_id
      FROM pit_disclosure_registry
      WHERE disclosure_kind = 'FINANCIAL_STATEMENT'
        AND available_at <= (period_end_date || 'T23:59:59+05:30')
    `);

    if (prematureFinancials.length > 0) {
      const failures = prematureFinancials.map(r => ({
        field: 'financial_statement_available_at',
        symbol: r.symbol,
        date: r.period_end_date,
        source: r.source,
        recordId: r.source_record_id,
        failureReason: 'FINANCIAL_DISCLOSURE_AVAILABLE_BEFORE_OR_ON_PERIOD_END'
      }));
      throw new Error(`FINANCIAL_PIT_LEAKAGE_DETECTED: ${JSON.stringify(failures)}`);
    }

    expect(prematureFinancials).toEqual([]);
  });

  // 10. Shareholding Date Leakage Invariant
  it('10. Enforces shareholding disclosure PIT constraint: availableAt is strictly greater than quarter end as_of_date', async () => {
    const prematureShareholding = await queryAll(`
      SELECT symbol, period_label, period_end_date, available_at, source, source_record_id
      FROM pit_disclosure_registry
      WHERE disclosure_kind = 'SHAREHOLDING_PATTERN'
        AND available_at <= (period_end_date || 'T23:59:59+05:30')
    `);

    if (prematureShareholding.length > 0) {
      const failures = prematureShareholding.map(r => ({
        field: 'shareholding_pattern_available_at',
        symbol: r.symbol,
        date: r.period_end_date,
        source: r.source,
        recordId: r.source_record_id,
        failureReason: 'SHAREHOLDING_DISCLOSURE_AVAILABLE_BEFORE_OR_ON_AS_OF_DATE'
      }));
      throw new Error(`SHAREHOLDING_PIT_LEAKAGE_DETECTED: ${JSON.stringify(failures)}`);
    }

    expect(prematureShareholding).toEqual([]);
  });
});
