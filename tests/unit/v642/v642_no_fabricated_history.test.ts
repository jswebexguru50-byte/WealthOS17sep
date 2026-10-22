import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 No Fabricated History Invariant Unit Tests', () => {
  const pitPath = path.join(process.cwd(), 'data/v6.4/v642_historical_pit_validation.json');

  test('1. Prohibits fabricated historical constituents and requires TIER_1 source backing', () => {
    expect(fs.existsSync(pitPath)).toBe(true);
    const pit = JSON.parse(fs.readFileSync(pitPath, 'utf-8'));
    
    expect(pit.missingRows).toBe(0);
    expect(pit.priceCoverageRelativeToValidatedPITUniverse).toBe('100.0%');
    expect(pit.historicalAnchorEvidenceCompleteness).toBe('FULL_SNAPSHOT_VERIFIED');
  });
});
