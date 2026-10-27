import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('non-MCP waterfall contract', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/fundamental/run_non_mcp_waterfall.ts'), 'utf8');

  it('orders statutory, broker, promotion, and coverage phases', () => {
    expect(source.indexOf("phase('exchange_xbrl_mca'")).toBeGreaterThan(-1);
    expect(source.indexOf("phase('upstox_fundamentals'")).toBeGreaterThan(source.indexOf("phase('exchange_xbrl_mca'"));
    expect(source.indexOf("phase('cached_artifact_promotion'")).toBeGreaterThan(source.indexOf("phase('upstox_fundamentals'"));
    expect(source.indexOf("phase('coverage_ledger'")).toBeGreaterThan(source.indexOf("phase('cached_artifact_promotion'"));
  });

  it('hard-disables MCP for every child phase and supports resumability', () => {
    expect(source).toContain('MCP_DISABLED: \'1\'');
    expect(source).toContain("checkpoint.phases[name]?.status === 'SUCCESS'");
    expect(source).toContain("process.argv.includes('--dry-run')");
  });

  it('runs canonical promotion verification before coverage', () => {
    expect(source.indexOf("phase('promotion_verification'")).toBeGreaterThan(source.indexOf("phase('cached_artifact_promotion'"));
    expect(source.indexOf("phase('coverage_ledger'")).toBeGreaterThan(source.indexOf("phase('promotion_verification'"));
  });
});
