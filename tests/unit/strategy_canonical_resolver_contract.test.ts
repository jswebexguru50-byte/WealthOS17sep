import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { STRATEGY_FUNDAMENTAL_RULES } from '../../src/server/services/StrategyFundamentalFilterService.js';

describe('strategy canonical migration contract', () => {
  it('preserves the seven strategy fundamental thresholds', () => {
    expect(STRATEGY_FUNDAMENTAL_RULES).toEqual({
      promoterMinimumPct: 66.6,
      roceMinimumPct: 35,
      roeMinimumPct: 25,
      profitableQuarterCount: 8,
      cashFlowToOperatingProfitMinimum: 0.5,
    });
  });

  it('requires the shared canonical resolver in the active strategy service', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/server/services/StrategyFundamentalFilterService.ts'), 'utf8');
    expect(source).toContain("CanonicalFactResolverService");
    expect(source).toContain('canonicalResolver.resolveMany');
  });
});
