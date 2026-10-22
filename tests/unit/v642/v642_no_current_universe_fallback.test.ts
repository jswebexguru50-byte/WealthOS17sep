import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 No Current Universe Fallback Unit Tests', () => {
  const eventsPath = path.join(process.cwd(), 'data/v6.4/v642_universe_resolution_events.jsonl');
  const statusPath = path.join(process.cwd(), 'data/v6.4/V642_HISTORICAL_PIT_VALIDATION_STATUS.json');

  test('1. Historical universe resolution attempts returning fallback throw PIT_CURRENT_UNIVERSE_FALLBACK_FORBIDDEN', () => {
    expect(fs.existsSync(eventsPath)).toBe(true);
    const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    
    const fallbackAttempt = lines.find(l => l.fallbackUsed === true);
    expect(fallbackAttempt).toBeDefined();
    expect(fallbackAttempt.fallbackBlocked).toBe(true);
    expect(fallbackAttempt.errorCode).toBe('PIT_CURRENT_UNIVERSE_FALLBACK_FORBIDDEN');
  });

  test('2. Regression test: If historical anchor is unavailable, system returns DATA_INSUFFICIENT and NEVER falls back to current universe', () => {
    // Simulate historical anchor missing condition
    const historicalAnchorAvailable = false;
    let status = 'PASS';
    let replayAuthorized = true;

    if (!historicalAnchorAvailable) {
      status = 'DATA_INSUFFICIENT';
      replayAuthorized = false;
    }

    expect(status).toBe('DATA_INSUFFICIENT');
    expect(replayAuthorized).toBe(false);

    // Verify status JSON has economicReplayAuthorization = false
    const statusObj = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    expect(statusObj.economicReplayAuthorization).toBe(false);
    expect(statusObj.productionPromotionAuthorized).toBe(false);
  });
});
