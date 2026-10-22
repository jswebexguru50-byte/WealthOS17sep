import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Historical Source Inventory Unit Tests', () => {
  const invPath = path.join(process.cwd(), 'data/v6.4/v642_membership_source_inventory.json');

  test('1. Inventory classifies sources into TIER_1 to TIER_7', () => {
    expect(fs.existsSync(invPath)).toBe(true);
    const inv = JSON.parse(fs.readFileSync(invPath, 'utf-8'));
    expect(inv.evaluatedSources.length).toBeGreaterThanOrEqual(3);

    const types = inv.evaluatedSources.map((s: any) => s.sourceType);
    expect(types).toContain('TIER_1_OFFICIAL_HISTORICAL_SNAPSHOT');
    expect(types).toContain('TIER_6_CURRENT_ONLY');
  });

  test('2. TIER_6_CURRENT_ONLY is explicitly marked NOT_ELIGIBLE_FOR_HISTORICAL_PIT', () => {
    const inv = JSON.parse(fs.readFileSync(invPath, 'utf-8'));
    const tier6 = inv.evaluatedSources.find((s: any) => s.sourceType === 'TIER_6_CURRENT_ONLY');
    expect(tier6).toBeDefined();
    expect(tier6.authoritativeStatus).toBe('PROHIBITED_FOR_HISTORICAL_PIT_ANCHOR');
  });
});
