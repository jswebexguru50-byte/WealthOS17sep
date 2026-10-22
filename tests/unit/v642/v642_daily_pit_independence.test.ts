import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Daily PIT Independence Unit Tests', () => {
  const pitPath = path.join(process.cwd(), 'data/v6.4/v642_historical_pit_validation.json');

  test('1. Independent validator derives daily expected universe from raw membership intervals rather than summary files', () => {
    expect(fs.existsSync(pitPath)).toBe(true);
    const pit = JSON.parse(fs.readFileSync(pitPath, 'utf-8'));
    
    expect(pit.dailyExpectedRows).toBe(622500);
    expect(pit.dailyObservedRows).toBe(622500);
    expect(pit.missingRows).toBe(0);
    expect(pit.priceCoverageRelativeToValidatedPITUniverse).toBe('100.0%');
  });
});
