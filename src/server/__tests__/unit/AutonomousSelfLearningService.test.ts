import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AutonomousSelfLearningService } from '../../services/AutonomousSelfLearningService.js';
import { setDbMockHooks } from '../../database.js';

describe('Unit: AutonomousSelfLearningService', () => {
  let service: AutonomousSelfLearningService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = AutonomousSelfLearningService.getInstance();
  });

  afterEach(() => {
    setDbMockHooks({});
  });

  // U-SL-01
  it('U-SL-01: initializeBaselineRules is idempotent and calling twice does not duplicate rows', async () => {
    const executedQueries: string[] = [];
    setDbMockHooks({
      dbRun: async (sql) => {
        executedQueries.push(sql);
        return { changes: 1 };
      }
    });

    await service.initializeBaselineRules();
    expect(executedQueries.length).toBe(5); // 5 baseline rules

    // Calling a second time should execute INSERT OR IGNORE statements safely
    await service.initializeBaselineRules();
    expect(executedQueries.length).toBe(10);
    for (const q of executedQueries) {
      expect(q.toUpperCase()).toContain('INSERT OR IGNORE');
    }
  });

  // U-SL-02
  it('U-SL-02: Decay weight calculation for a 10-day event matches exp(-lambda * 10) ~= 0.59 within 0.01 tolerance', async () => {
    const calculated = service.calculateDecayWeight(10);
    expect(Math.abs(calculated - 0.5945)).toBeLessThan(0.01);

    // Mock 6 failure records occurring 10 days ago (weighted sum = 6 * 0.5945 = 3.567 >= 3.5 trigger)
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    const mockObs = Array.from({ length: 6 }, (_, i) => ({
      learned_at: tenDaysAgo,
      pnl_pct: -4.0,
      post_mortem_id: 100 + i
    }));

    let capturedParams: any[] | null = null;
    setDbMockHooks({
      dbAll: async () => mockObs,
      dbGet: async () => ({
        id: 1,
        rule_name: 'min_volume_surge_ratio',
        baseline_threshold: 1.20,
        current_threshold: 1.20,
        status: 'ACTIVE'
      }),
      dbRun: async (sql, params) => {
        if (sql.includes('INSERT INTO SelfLearningMutationLog')) {
          capturedParams = params;
        }
        return { changes: 1 };
      }
    });

    await service.recordFailureObservation({
      category: 'VOLUME_EXHAUSTION_TRAP',
      symbol: 'TEST',
      timeframe: 'SWING',
      postMortemId: 99,
      pnlPct: -4.5
    });

    expect(capturedParams).not.toBeNull();
    // decay_weight is param index 6, total decayed weight logged is ~3.57
    const loggedWeight = capturedParams![6];
    expect(loggedWeight).toBeGreaterThanOrEqual(3.5);
  });

  // U-SL-03
  it('U-SL-03: MIN_SAMPLE_SIZE enforcement - less than 5 events results in no mutation logged', async () => {
    let mutationInserted = false;
    setDbMockHooks({
      dbAll: async () => [
        { learned_at: new Date().toISOString(), pnl_pct: -3.0 },
        { learned_at: new Date().toISOString(), pnl_pct: -2.5 },
        { learned_at: new Date().toISOString(), pnl_pct: -4.0 }
      ],
      dbRun: async (sql) => {
        if (sql.includes('INSERT INTO SelfLearningMutationLog')) {
          mutationInserted = true;
        }
        return { changes: 1 };
      }
    });

    await service.recordFailureObservation({
      category: 'VOLUME_EXHAUSTION_TRAP',
      symbol: 'TATASTEEL',
      timeframe: 'DAILY',
      postMortemId: 55,
      pnlPct: -3.2
    });

    expect(mutationInserted).toBe(false);
  });

  // U-SL-04
  it('U-SL-04: Rule rollback API updates status to ROLLED_BACK and records updatedAt', async () => {
    const existingRule = {
      id: 2,
      rule_name: 'require_positive_sector_flow',
      baseline_threshold: 0.0,
      current_threshold: 1.0,
      status: 'CANARY_TESTING',
      created_at: '2026-09-01T00:00:00.000Z'
    };

    const runCalls: { sql: string; params: any[] }[] = [];
    setDbMockHooks({
      dbGet: async () => existingRule,
      dbRun: async (sql, params) => {
        runCalls.push({ sql, params });
        return { changes: 1 };
      }
    });

    const success = await service.rollbackRule(2, 'Canary test win rate degraded');

    expect(success).toBe(true);
    expect(runCalls.length).toBe(2);

    // First call updates AutonomousSelfLearningRules
    const updateCall = runCalls[0];
    expect(updateCall.sql).toContain("status = 'ROLLED_BACK'");
    expect(updateCall.sql).toContain('updated_at = ?');
    expect(new Date(updateCall.params[0]).getTime()).toBeGreaterThan(new Date(existingRule.created_at).getTime());
    expect(updateCall.params[1]).toBe(2); // ruleId
  });

  // U-SL-05
  it('U-SL-05: Invalid rule ID for rollback returns false and does not modify DB', async () => {
    let dbRunCalled = false;
    setDbMockHooks({
      dbGet: async () => null, // Rule not found
      dbRun: async () => { dbRunCalled = true; return { changes: 0 }; }
    });

    const success = await service.rollbackRule(99999, 'Invalid rule rollback attempt');

    expect(success).toBe(false);
    expect(dbRunCalled).toBe(false);
  });
});
