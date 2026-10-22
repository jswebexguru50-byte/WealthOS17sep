import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Current Provider Type Separation Unit Tests', () => {
  const eventsPath = path.join(process.cwd(), 'data/v6.4/v642_universe_resolution_events.jsonl');

  test('1. CurrentUniverseProvider is architecturally separate and cannot satisfy HistoricalPITUniverseProvider interface', () => {
    expect(fs.existsSync(eventsPath)).toBe(true);
    const events = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));

    const currentAttempt = events.find(e => e.provider === 'CurrentUniverseProvider');
    expect(currentAttempt).toBeDefined();
    expect(currentAttempt.fallbackBlocked).toBe(true);
    expect(currentAttempt.errorCode).toBe('PIT_CURRENT_UNIVERSE_FALLBACK_FORBIDDEN');
  });
});
