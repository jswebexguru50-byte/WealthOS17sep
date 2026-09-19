import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Source Conflict Handling Unit Tests', () => {
  const confPath = path.join(process.cwd(), 'data/v6.4/v642_membership_source_conflicts.jsonl');

  test('1. Conflicting membership claims across sources are logged and resolved explicitly', () => {
    expect(fs.existsSync(confPath)).toBe(true);
    const conflicts = fs.readFileSync(confPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));

    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    const hdfcConf = conflicts.find(c => c.securityId.includes('HDFC'));
    expect(hdfcConf).toBeDefined();
    expect(hdfcConf.resolved).toBe(true);
    expect(hdfcConf.resolutionBasis).toBeDefined();
  });
});
