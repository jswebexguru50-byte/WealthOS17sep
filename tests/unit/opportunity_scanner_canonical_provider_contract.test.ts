import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('OpportunityScanner canonical acquisition contract', () => {
  it('does not bypass the shared fundamental provider with a direct Screener call', () => {
    const source = fs.readFileSync('src/server/services/OpportunityScannerEngine.ts', 'utf8');
    expect(source).toContain('BatchFundamentalProvider.getInstance().get(symbol)');
    expect(source).not.toContain("ScreenerService.getInstance().fetchScreenerData(symbol)");
  });
});
