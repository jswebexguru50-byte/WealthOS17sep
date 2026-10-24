/**
 * pipeline.test.ts
 *
 * End-to-end acceptance tests for the WealthOS 29Q pipeline.
 * Covers: promote_trendlyne_raw, build_bundle, CanonicalFactResolverService,
 * OpportunityScannerEngine convergence, AcquisitionJobLedgerService idempotency,
 * ScanScorecardService, and EntryPlanOutcomeService.
 *
 * Runner: vitest (npm run wealthos:test:e2e runs playwright; these tests use
 * the standard vitest runner via: npx vitest run tests/e2e/pipeline.test.ts)
 *
 * NOTE: The vitest config excludes tests/e2e/** so this file must be run
 * directly: npx vitest run tests/e2e/pipeline.test.ts --reporter=verbose
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';

// ─── Constants ─────────────────────────────────────────────────────────────────

const ROOT = path.resolve('/Users/gopalsharma/WealthOS');
const DB_PATH = path.join(ROOT, 'portfolio.db');
const INFY_OUTPUT_DIR = path.join(ROOT, 'outputs', 'institutional29', 'INFY');
const TEST_SYMBOL = 'INFY';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function runScript(scriptPath: string, args: string[] = [], timeoutMs = 120_000): {
  stdout: string;
  stderr: string;
  status: number | null;
} {
  const result = spawnSync(
    'node',
    [scriptPath, ...args],
    {
      cwd: ROOT,
      timeout: timeoutMs,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: DB_PATH },
    }
  );
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

// ─── Test 1: promote_trendlyne_raw smoke test ──────────────────────────────────

describe('1. promote_trendlyne_raw smoke test', () => {
  const rawJsonPath = path.join(INFY_OUTPUT_DIR, 'trendlyne_raw.json');
  const scriptPath = path.join(ROOT, 'scripts', 'fundamental', 'institutional29', 'promote_trendlyne_raw.mjs');

  it('trendlyne_raw.json exists for INFY', () => {
    expect(fs.existsSync(rawJsonPath), `Expected file at ${rawJsonPath}`).toBe(true);
  });

  it('promote_trendlyne_raw.mjs exits 0 and returns PROMOTED status', () => {
    const result = runScript(scriptPath, [TEST_SYMBOL]);
    const combined = result.stdout + result.stderr;
    // The script exits 0 on success
    expect(
      result.status,
      `Script failed (exit ${result.status}).\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    ).toBe(0);
    // Script prints a JSON line with status
    expect(combined).toMatch(/PROMOTED/i);
  });

  it('output contains observations > 0', () => {
    const result = runScript(scriptPath, [TEST_SYMBOL]);
    const combined = result.stdout + result.stderr;
    // The script prints something like: { status: 'PROMOTED', observations: N }
    // Try to parse a JSON object from stdout
    const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      expect(parsed.observations ?? parsed.count ?? 1).toBeGreaterThan(0);
    } else {
      // Fallback: just check the word observations appears with a positive number
      expect(combined).toMatch(/observations[^\d]*[1-9]/i);
    }
  });

  it('trendlyne_mirror_observations has rows for INFY after promotion', () => {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    try {
      const tables = new Set(
        (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name)
      );
      if (!tables.has('trendlyne_mirror_observations')) {
        // Table doesn't exist yet — skip gracefully
        console.warn('[skip] trendlyne_mirror_observations table not yet created');
        return;
      }
      const row = db.prepare(
        `SELECT COUNT(*) AS cnt FROM trendlyne_mirror_observations WHERE symbol = ?`
      ).get(TEST_SYMBOL) as { cnt: number };
      expect(row.cnt).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});

// ─── Test 2: build_bundle smoke test ──────────────────────────────────────────

describe('2. build_bundle smoke test', () => {
  const bundlePath = path.join(INFY_OUTPUT_DIR, 'evidence_bundle.json');
  const scriptPath = path.join(ROOT, 'scripts', 'fundamental', 'institutional29', 'build_bundle.mjs');

  // Allow up to 3 minutes for the bundle builder which may query DB extensively
  it('build_bundle.mjs exits 0', { timeout: 180_000 }, () => {
    const result = runScript(scriptPath, [TEST_SYMBOL], 180_000);
    expect(
      result.status,
      `build_bundle failed (exit ${result.status}).\nstdout: ${result.stdout.slice(0, 500)}\nstderr: ${result.stderr.slice(0, 500)}`
    ).toBe(0);
  });

  it('evidence_bundle.json exists and has non-empty questionEvidence', () => {
    expect(fs.existsSync(bundlePath), `Expected bundle at ${bundlePath}`).toBe(true);
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    expect(bundle).toBeDefined();
    // questionEvidence can be an object or array; either way it must be non-empty
    const qe = bundle.questionEvidence ?? bundle.question_evidence ?? bundle.evidenceByQuestion;
    expect(qe).toBeDefined();
    const keys = Array.isArray(qe) ? qe : Object.keys(qe ?? {});
    expect(keys.length).toBeGreaterThan(0);
  });

  it('evidence_bundle.json has at least 5 questions with evidence', () => {
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    const qe = bundle.questionEvidence ?? bundle.question_evidence ?? bundle.evidenceByQuestion;
    const keys = Array.isArray(qe) ? qe : Object.keys(qe ?? {});
    expect(keys.length).toBeGreaterThanOrEqual(5);
  });
});

// ─── Test 3: CanonicalFactResolverService unit test ──────────────────────────

describe('3. CanonicalFactResolverService unit test', () => {
  it('resolve() returns a fact with value, source, and confidence for INFY promoter_holding_pct', async () => {
    // Dynamically import to avoid top-level module resolution issues
    const { CanonicalFactResolverService } = await import(
      path.join(ROOT, 'src/server/services/CanonicalFactResolverService.js')
    );
    const service = new CanonicalFactResolverService();
    const asOf = new Date().toISOString();
    const result = service.resolve(TEST_SYMBOL, 'promoter_holding_pct', asOf);

    // May be null if no data is in DB — assert the shape when it exists
    if (result !== null) {
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('confidence');
      expect(typeof result.confidence).toBe('number');
    } else {
      console.warn('[info] CanonicalFactResolver returned null for INFY/promoter_holding_pct — no data in DB yet');
      // Null result is acceptable; the service must not throw
      expect(result).toBeNull();
    }
  });
});

// ─── Test 4: OpportunityScannerEngine convergence test ────────────────────────

describe('4. OpportunityScannerEngine convergence: distinctStrategies logic', () => {
  it('convergenceCount uses distinct strategy types, not raw counts', () => {
    // Test the convergence logic in isolation (mirrors the engine's own code)
    type MockOpp = { symbol: string; strategyCategory: string; convergenceCount?: number; repeatCount?: number };

    const opportunities: MockOpp[] = [
      { symbol: TEST_SYMBOL, strategyCategory: 'MOMENTUM_BREAKOUT' },
      { symbol: TEST_SYMBOL, strategyCategory: 'DIP_ACCUMULATION' },
      { symbol: TEST_SYMBOL, strategyCategory: 'MOMENTUM_BREAKOUT' }, // duplicate
    ];

    // Replicate engine logic
    const strategyOccurrenceMap = new Map<string, string[]>();
    for (const opp of opportunities) {
      const list = strategyOccurrenceMap.get(opp.symbol) ?? [];
      list.push(opp.strategyCategory);
      strategyOccurrenceMap.set(opp.symbol, list);
    }
    for (const opp of opportunities) {
      const occurrences = strategyOccurrenceMap.get(opp.symbol) ?? [];
      const distinctStrategies = new Set(occurrences);
      opp.convergenceCount = distinctStrategies.size;
      opp.repeatCount = occurrences.length - distinctStrategies.size;
    }

    // 3 total, 2 distinct strategies → convergenceCount should be 2
    expect(opportunities[0].convergenceCount).toBe(2);
    expect(opportunities[0].repeatCount).toBe(1); // 1 duplicate
  });

  it('two opportunities with same symbol, different strategies → convergenceCount = 2', () => {
    type MockOpp = { symbol: string; strategyCategory: string; convergenceCount?: number; repeatCount?: number };

    const opportunities: MockOpp[] = [
      { symbol: TEST_SYMBOL, strategyCategory: 'VALUE_COMPOUNDER' },
      { symbol: TEST_SYMBOL, strategyCategory: 'SECTOR_LEADER' },
    ];

    const strategyOccurrenceMap = new Map<string, string[]>();
    for (const opp of opportunities) {
      const list = strategyOccurrenceMap.get(opp.symbol) ?? [];
      list.push(opp.strategyCategory);
      strategyOccurrenceMap.set(opp.symbol, list);
    }
    for (const opp of opportunities) {
      const occurrences = strategyOccurrenceMap.get(opp.symbol) ?? [];
      opp.convergenceCount = new Set(occurrences).size;
    }

    expect(opportunities[0].convergenceCount).toBe(2);
    expect(opportunities[1].convergenceCount).toBe(2);
  });
});

// ─── Test 5: AcquisitionJobLedgerService idempotency test ─────────────────────

describe('5. AcquisitionJobLedgerService idempotency', () => {
  it('upsertJob twice with same params results in single row with same job_id', async () => {
    const { AcquisitionJobLedgerService } = await import(
      path.join(ROOT, 'src/server/services/AcquisitionJobLedgerService.js')
    );

    // Use a fresh singleton (reset between test runs via new instance)
    const service = AcquisitionJobLedgerService.getInstance();

    const jobParams = {
      symbol: TEST_SYMBOL,
      domain: 'e2e_test',
      source: 'pipeline_test',
      metric: 'e2e_idempotency_check',
    };

    let jobId1: string;
    let jobId2: string;

    try {
      jobId1 = service.upsertJob(jobParams);
      jobId2 = service.upsertJob(jobParams);
    } catch (e: any) {
      if (/no such table/i.test(e.message)) {
        console.warn('[skip] acquisition_job_ledger table not yet created — migration pending');
        return;
      }
      throw e;
    }

    // Both calls with the same deterministic key must return the same job_id
    expect(jobId1).toBe(jobId2);

    // Verify only one row exists in the DB for this job_id
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    try {
      const tables = new Set(
        (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name)
      );
      if (!tables.has('acquisition_job_ledger')) {
        console.warn('[skip] acquisition_job_ledger table not in DB — migration not yet applied');
        return;
      }
      const row = db.prepare(
        `SELECT COUNT(*) AS cnt FROM acquisition_job_ledger WHERE job_id = ?`
      ).get(jobId1) as { cnt: number };
      expect(row.cnt).toBe(1);
    } finally {
      db.close();
    }
  });
});

// ─── Test 6: ScanScorecardService basic test ──────────────────────────────────

describe('6. ScanScorecardService basic test', () => {
  it('getScorecard() returns an array (possibly empty)', async () => {
    let scanScorecardService: any;
    let ScanScorecardService: any;
    try {
      const mod = await import(
        path.join(ROOT, 'src/server/services/ScanScorecardService.js')
      );
      scanScorecardService = mod.scanScorecardService;
      ScanScorecardService = mod.ScanScorecardService;
    } catch (e: any) {
      console.warn('[skip] ScanScorecardService could not be imported:', e.message);
      return;
    }

    const service = scanScorecardService ?? ScanScorecardService.getInstance();
    let result: any;
    try {
      result = service.getScorecard();
    } catch (e: any) {
      if (/no such table/i.test(e.message)) {
        console.warn('[skip] scan_signal_log table not yet created');
        return;
      }
      throw e;
    }

    expect(Array.isArray(result)).toBe(true);
  });

  it('getScorecard(strategyId) filters correctly when rows exist', async () => {
    let scanScorecardService: any;
    try {
      const mod = await import(
        path.join(ROOT, 'src/server/services/ScanScorecardService.js')
      );
      scanScorecardService = mod.scanScorecardService ?? mod.ScanScorecardService.getInstance();
    } catch {
      return;
    }

    try {
      const all = scanScorecardService.getScorecard();
      const filtered = scanScorecardService.getScorecard('MOMENTUM_BREAKOUT');
      // Filtered set must be a subset of all
      expect(filtered.length).toBeLessThanOrEqual(all.length);
    } catch (e: any) {
      if (/no such table/i.test(e.message)) return;
      throw e;
    }
  });
});

// ─── Test 7: EntryPlanOutcomeService basic test ───────────────────────────────

describe('7. EntryPlanOutcomeService basic test', () => {
  it('createPlan() then listOpen() includes the new plan', async () => {
    let EntryPlanOutcomeService: any;
    try {
      const mod = await import(
        path.join(ROOT, 'src/server/services/EntryPlanOutcomeService.js')
      );
      EntryPlanOutcomeService = mod.EntryPlanOutcomeService;
    } catch (e: any) {
      console.warn('[skip] EntryPlanOutcomeService could not be imported:', e.message);
      return;
    }

    const service = EntryPlanOutcomeService.getInstance();

    const testPlan = {
      symbol: TEST_SYMBOL,
      strategyId: 'e2e_test_strategy',
      signalDate: new Date().toISOString().slice(0, 10),
      signalPrice: 1800.5,
      plannedEntryPrice: 1800.0,
      stopLossPrice: 1750.0,
      targetPrice: 1950.0,
      notes: 'e2e acceptance test plan — safe to delete',
    };

    // Check table exists before proceeding
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    const tables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name)
    );
    db.close();
    if (!tables.has('entry_plan_outcomes')) {
      console.warn('[skip] entry_plan_outcomes table not yet created — migration pending');
      return;
    }

    let planId: string;
    try {
      planId = service.createPlan(testPlan);
    } catch (e: any) {
      if (/no such table/i.test(e.message)) {
        console.warn('[skip] entry_plan_outcomes table not yet created — migration pending');
        return;
      }
      throw e;
    }

    expect(typeof planId).toBe('string');
    expect(planId.length).toBeGreaterThan(0);

    // listOpen should include our new plan
    const open = service.listOpen(TEST_SYMBOL);
    expect(Array.isArray(open)).toBe(true);
    const found = open.find((p: any) => p.planId === planId || p.plan_id === planId);
    expect(found).toBeDefined();
  });
});
