import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('cached artifact promotion contract', () => {
  it('is local-only, resumable, and never invokes MCP', () => {
    const source = fs.readFileSync('scripts/fere/promote_cached_artifacts_batch.mjs', 'utf8');
    expect(source).toContain("mcp:'disabled'");
    expect(source).toContain("status:'already_covered'");
    expect(source).toContain("status:'no_cached_artifact'");
    expect(source).toContain("minFacts=Math.max(1,Number(arg('--min-facts','29'))||29)");
    expect(source).toContain('sourceDocumentId');
    expect(source).not.toMatch(/mcp__|playwright|browser/i);
  });

  it('does not retry partial canonical coverage as a promotion failure', () => {
    const verify = fs.readFileSync('scripts/fundamental/verify_non_mcp_promotion.ts', 'utf8');
    const gaps = fs.readFileSync('scripts/fundamental/build_promotion_gap_manifest.ts', 'utf8');
    expect(verify).toContain("facts > 0 ? 'PROMOTED_PARTIAL' : 'NOT_PROMOTED'");
    expect(verify).toContain("r.status === 'NOT_PROMOTED'");
    expect(gaps).toContain("r.status === 'NOT_PROMOTED'");
  });
});
