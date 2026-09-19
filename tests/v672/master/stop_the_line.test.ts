import { describe, it, expect } from 'vitest';
import { assertNoStopTheLine, StopTheLineError, StopTrigger } from '../../../src/server/services/audit/StopTheLine.js';

describe('V672 Track K — Stop-The-Line Fatal Halt Tests', () => {
  it('throws StopTheLineError immediately when any fatal trigger is present', () => {
    const trigger: StopTrigger = {
      code: 'PIT_FAILURE',
      severity: 'FATAL_HALT',
      detectedAt: new Date().toISOString(),
      sourceModule: 'TEST_SUITE',
      details: 'Test trigger assertion.'
    };

    expect(() => assertNoStopTheLine([trigger])).toThrowError(StopTheLineError);
  });

  it('passes cleanly when zero fatal triggers are present', () => {
    expect(() => assertNoStopTheLine([])).not.toThrow();
  });
});
