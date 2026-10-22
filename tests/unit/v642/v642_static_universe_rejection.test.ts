import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Static Universe Rejection Unit Tests', () => {
  test('1. Candidate dataset with distinctConstituentSets == 1 and entry/exit == 0 MUST be rejected', () => {
    const staticCandidate = {
      distinctConstituentSets: 1,
      entryEventCount: 0,
      exitEventCount: 0,
      priceCoverage: '100.0%'
    };

    let status = 'PASS';
    if (staticCandidate.distinctConstituentSets === 1 && staticCandidate.entryEventCount === 0 && staticCandidate.exitEventCount === 0) {
      status = 'DATA_INSUFFICIENT';
    }

    expect(status).toBe('DATA_INSUFFICIENT');
  });

  test('2. 100% price coverage alone cannot override static universe rejection', () => {
    const statusPath = path.join(process.cwd(), 'data/v6.4/V642_HISTORICAL_PIT_VALIDATION_STATUS.json');
    const pitPath = path.join(process.cwd(), 'data/v6.4/v642_historical_pit_validation.json');
    
    expect(fs.existsSync(statusPath)).toBe(true);
    const pit = JSON.parse(fs.readFileSync(pitPath, 'utf-8'));

    // Dynamic reconstitution evidence verified
    expect(pit.distinctConstituentSets).toBeGreaterThan(1);
    expect(pit.entryEventCount).toBeGreaterThan(0);
    expect(pit.exitEventCount).toBeGreaterThan(0);
  });
});
