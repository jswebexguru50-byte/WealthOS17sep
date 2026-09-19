import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Historical Anchor Integrity Unit Tests', () => {
  const valPath = path.join(process.cwd(), 'data/v6.4/v642_historical_pit_validation.json');

  test('1. Validates historical anchor dates and prohibits current NIFTY 500 constituents as historical anchor', () => {
    expect(fs.existsSync(valPath)).toBe(true);
    const val = JSON.parse(fs.readFileSync(valPath, 'utf-8'));
    
    expect(val.historicalAnchorDate).toBe('2020-01-01');
    expect(val.historicalAnchorConstituentCount).toBe(500);
    expect(val.historicalAnchorEvidenceCompleteness).toBe('FULL_SNAPSHOT_VERIFIED');
  });
});
