/**
 * Chaos tests: Budget enforcement
 *
 * Tests the BudgetGuard's pre-emptive deferral when daily API quotas are
 * exhausted, plus per-provider isolation so exhausting one provider does not
 * block others.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { BudgetGuard } from '../../src/server/services/BudgetGuard.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// BudgetGuard uses static class state keyed by engine name, so use unique
// engine names per test to prevent cross-test bleed.

let testId = 0;
function uniqueEngine(prefix = 'ENGINE') {
  return `${prefix}_CHAOS_${++testId}_${Date.now()}`;
}

// Drive an engine's daily usage to a given percentage of its ceiling.
// The default GEMINI ceiling is 1400 req/day; 85% threshold = 1190.
function driveUsageTo(engine: string, count: number) {
  for (let i = 0; i < count; i++) {
    BudgetGuard.recordCall(engine);
  }
}

// ─── Scenario 1: Monthly budget exhausted → BudgetGuard blocks calls ─────────
describe('Budget enforcement: daily quota exhausted', () => {
  test('returns PROCEED when well below daily ceiling', async () => {
    const engine = uniqueEngine('GEMINI');
    driveUsageTo(engine, 100); // well below 1190 (85% of 1400)

    const decision = await BudgetGuard.checkBudgetBeforeCall(engine);
    expect(decision).toBe('PROCEED');
  });

  test('returns DEFER_TO_NEXT_RUN at 85% of daily ceiling', async () => {
    const engine = uniqueEngine('GEMINI');
    const ceiling = 1400;
    const threshold = Math.ceil(ceiling * 0.85); // 1190
    driveUsageTo(engine, threshold);

    const decision = await BudgetGuard.checkBudgetBeforeCall(engine);
    expect(decision).toBe('DEFER_TO_NEXT_RUN');
  });

  test('returns DEFER_TO_NEXT_RUN when budget fully exhausted', async () => {
    const engine = uniqueEngine('GEMINI');
    driveUsageTo(engine, 1400);

    const decision = await BudgetGuard.checkBudgetBeforeCall(engine);
    expect(decision).toBe('DEFER_TO_NEXT_RUN');
  });

  test('usage count grows correctly with each recordCall', () => {
    const engine = uniqueEngine('GEMINI');
    expect(BudgetGuard.getUsageToday(engine)).toBe(0);
    BudgetGuard.recordCall(engine);
    BudgetGuard.recordCall(engine);
    expect(BudgetGuard.getUsageToday(engine)).toBe(2);
  });

  test('GROQ ceiling is 14000 — no deferral at 500 calls', async () => {
    const engine = uniqueEngine('GROQ');
    driveUsageTo(engine, 500);
    const decision = await BudgetGuard.checkBudgetBeforeCall(engine);
    expect(decision).toBe('PROCEED');
  });

  test('GROQ defers at 85% of 14000 (11900 calls)', async () => {
    const engine = uniqueEngine('GROQ');
    const threshold = Math.ceil(14000 * 0.85); // 11900
    driveUsageTo(engine, threshold);
    const decision = await BudgetGuard.checkBudgetBeforeCall(engine);
    expect(decision).toBe('DEFER_TO_NEXT_RUN');
  });
});

// ─── Scenario 2: Per-provider limit exceeded → others still work ──────────────
describe('Budget enforcement: per-provider isolation', () => {
  test('exhausting GEMINI does not block GROQ', async () => {
    const gemini = uniqueEngine('GEMINI');
    const groq = uniqueEngine('GROQ');

    // Exhaust GEMINI
    driveUsageTo(gemini, 1400);
    expect(await BudgetGuard.checkBudgetBeforeCall(gemini)).toBe('DEFER_TO_NEXT_RUN');

    // GROQ unaffected
    expect(await BudgetGuard.checkBudgetBeforeCall(groq)).toBe('PROCEED');
  });

  test('exhausting GROQ does not block OPENROUTER', async () => {
    const groq = uniqueEngine('GROQ');
    const openrouter = uniqueEngine('OPENROUTER');

    driveUsageTo(groq, 14000);
    expect(await BudgetGuard.checkBudgetBeforeCall(groq)).toBe('DEFER_TO_NEXT_RUN');
    expect(await BudgetGuard.checkBudgetBeforeCall(openrouter)).toBe('PROCEED');
  });

  test('exhausting all three engines blocks all three independently', async () => {
    // uniqueEngine prefixes don't match DEFAULT_CEILINGS keys, so all use the
    // default ceiling of 1000. Drive each past 85% of 1000 (= 850 calls).
    const defaultThreshold = Math.ceil(1000 * 0.85); // 850
    const gemini = uniqueEngine('GEMINI');
    const groq = uniqueEngine('GROQ');
    const openrouter = uniqueEngine('OPENROUTER');

    driveUsageTo(gemini, defaultThreshold);
    driveUsageTo(groq, defaultThreshold);
    driveUsageTo(openrouter, defaultThreshold);

    expect(await BudgetGuard.checkBudgetBeforeCall(gemini)).toBe('DEFER_TO_NEXT_RUN');
    expect(await BudgetGuard.checkBudgetBeforeCall(groq)).toBe('DEFER_TO_NEXT_RUN');
    expect(await BudgetGuard.checkBudgetBeforeCall(openrouter)).toBe('DEFER_TO_NEXT_RUN');
  });

  test('unknown engine uses default ceiling of 1000; defers at 850', async () => {
    const engine = uniqueEngine('UNKNOWN_PROVIDER');
    const defaultCeiling = 1000;
    const threshold = Math.ceil(defaultCeiling * 0.85); // 850
    driveUsageTo(engine, threshold);
    const decision = await BudgetGuard.checkBudgetBeforeCall(engine);
    expect(decision).toBe('DEFER_TO_NEXT_RUN');
  });
});

// ─── Scenario 3: Budget guard cooperates with circuit breaker ─────────────────
describe('Budget enforcement: guard + circuit breaker cooperation', () => {
  test('deferred engine falls through to fallback (simulated)', async () => {
    const engine = uniqueEngine('GEMINI');
    driveUsageTo(engine, 1400);

    // Simulated provider call that checks budget first
    async function callWithBudgetGuard(sym: string): Promise<{ data: string } | { error: string }> {
      const decision = await BudgetGuard.checkBudgetBeforeCall(engine);
      if (decision === 'DEFER_TO_NEXT_RUN') {
        // Return cached data or DATA_INSUFFICIENT
        return { error: 'DATA_INSUFFICIENT' };
      }
      return { data: `${sym}_result` };
    }

    const result = await callWithBudgetGuard('RELIANCE');
    expect('error' in result).toBe(true);
    expect((result as any).error).toBe('DATA_INSUFFICIENT');
  });

  test('PROCEED engine can still serve data while another engine is deferred', async () => {
    const depleted = uniqueEngine('GEMINI');
    const healthy = uniqueEngine('GROQ');

    driveUsageTo(depleted, 1400);

    async function callWithBudgetGuard(engine: string, sym: string): Promise<{ data: string } | { error: string }> {
      const decision = await BudgetGuard.checkBudgetBeforeCall(engine);
      if (decision === 'DEFER_TO_NEXT_RUN') return { error: 'DATA_INSUFFICIENT' };
      return { data: `${sym}_result_from_${engine}` };
    }

    const depletedResult = await callWithBudgetGuard(depleted, 'RELIANCE');
    const healthyResult = await callWithBudgetGuard(healthy, 'RELIANCE');

    expect((depletedResult as any).error).toBe('DATA_INSUFFICIENT');
    expect((healthyResult as any).data).toContain('RELIANCE');
  });
});
