import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('canonical consumer audit script', () => {
  it('passes with no unapproved analytical provider calls', () => {
    const output = execFileSync('node', ['scripts/audit/canonical_consumer_audit.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const report = JSON.parse(output);
    expect(report.status).toBe('PASS');
    expect(report.violations).toBe(0);
  });
});
