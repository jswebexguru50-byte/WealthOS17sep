import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FeatureFlags, FLAG } from '../../src/server/services/FeatureFlags.js';

describe('FeatureFlags', () => {
  let ff: FeatureFlags;

  beforeEach(() => {
    // Reset singleton state between tests
    ff = FeatureFlags.getInstance();
    ff.reset();
    // Clean up any env vars we set
    delete process.env[`FLAG_${FLAG.V2_FACTS_ENABLED}`];
    delete process.env[`FLAG_${FLAG.BUDGET_ENFORCER_ACTIVE}`];
    delete process.env[`FLAG_${FLAG.USE_BATCH_FUNDAMENTALS}`];
  });

  afterEach(() => {
    ff.reset();
    delete process.env[`FLAG_${FLAG.V2_FACTS_ENABLED}`];
    delete process.env[`FLAG_${FLAG.BUDGET_ENFORCER_ACTIVE}`];
    delete process.env[`FLAG_${FLAG.USE_BATCH_FUNDAMENTALS}`];
  });

  it('1. isEnabled returns default true for V2_FACTS_ENABLED', () => {
    expect(ff.isEnabled(FLAG.V2_FACTS_ENABLED)).toBe(true);
  });

  it('2. isEnabled returns false for BUDGET_ENFORCER_ACTIVE (default off)', () => {
    expect(ff.isEnabled(FLAG.BUDGET_ENFORCER_ACTIVE)).toBe(false);
  });

  it('3. set(flag, false) overrides to false', () => {
    ff.set(FLAG.V2_FACTS_ENABLED, false);
    expect(ff.isEnabled(FLAG.V2_FACTS_ENABLED)).toBe(false);
  });

  it('4. set(flag, true) overrides to true', () => {
    ff.set(FLAG.BUDGET_ENFORCER_ACTIVE, true);
    expect(ff.isEnabled(FLAG.BUDGET_ENFORCER_ACTIVE)).toBe(true);
  });

  it('5. reset(flag) clears override, returns to default', () => {
    ff.set(FLAG.V2_FACTS_ENABLED, false);
    ff.reset(FLAG.V2_FACTS_ENABLED);
    expect(ff.isEnabled(FLAG.V2_FACTS_ENABLED)).toBe(true);
  });

  it('6. reset() clears all overrides', () => {
    ff.set(FLAG.V2_FACTS_ENABLED, false);
    ff.set(FLAG.BUDGET_ENFORCER_ACTIVE, true);
    ff.reset();
    expect(ff.isEnabled(FLAG.V2_FACTS_ENABLED)).toBe(true);
    expect(ff.isEnabled(FLAG.BUDGET_ENFORCER_ACTIVE)).toBe(false);
  });

  it('7. env var FLAG_X=true enables flag', () => {
    process.env[`FLAG_${FLAG.BUDGET_ENFORCER_ACTIVE}`] = 'true';
    expect(ff.isEnabled(FLAG.BUDGET_ENFORCER_ACTIVE)).toBe(true);
  });

  it('8. env var FLAG_X=false disables flag', () => {
    process.env[`FLAG_${FLAG.V2_FACTS_ENABLED}`] = 'false';
    expect(ff.isEnabled(FLAG.V2_FACTS_ENABLED)).toBe(false);
  });

  it('9. snapshot() returns all 6 flags as booleans', () => {
    const snap = ff.snapshot();
    expect(Object.keys(snap)).toHaveLength(6);
    for (const val of Object.values(snap)) {
      expect(typeof val).toBe('boolean');
    }
    expect(snap[FLAG.V2_FACTS_ENABLED]).toBe(true);
    expect(snap[FLAG.BUDGET_ENFORCER_ACTIVE]).toBe(false);
  });

  it('10. singleton pattern — same instance returned', () => {
    const a = FeatureFlags.getInstance();
    const b = FeatureFlags.getInstance();
    expect(a).toBe(b);
  });
});
