import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('cached artifact promotion contract', () => {
  it('is local-only, resumable, and never invokes MCP', () => {
    const source = fs.readFileSync('scripts/fere/promote_cached_artifacts_batch.mjs', 'utf8');
    expect(source).toContain("mcp:'disabled'");
    expect(source).toContain("status:'already_covered'");
    expect(source).toContain("status:'no_cached_artifact'");
    expect(source).toContain('sourceDocumentId');
    expect(source).not.toMatch(/mcp__|playwright|browser/i);
  });
});
