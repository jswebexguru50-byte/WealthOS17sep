import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Complete Snapshot vs Change Evidence Unit Tests', () => {
  const invPath = path.join(process.cwd(), 'data/v6.4/v642_membership_source_inventory.json');

  test('1. Distinguishes FULL_SNAPSHOT_AND_TRANSITION_CHAINS from partial change evidence', () => {
    expect(fs.existsSync(invPath)).toBe(true);
    const inv = JSON.parse(fs.readFileSync(invPath, 'utf-8'));
    
    const tier1 = inv.evaluatedSources.find((s: any) => s.sourceType === 'TIER_1_OFFICIAL_HISTORICAL_SNAPSHOT');
    expect(tier1).toBeDefined();
    expect(tier1.coverage).toContain('FULL_SNAPSHOT_AND_TRANSITION_CHAINS');
  });
});
