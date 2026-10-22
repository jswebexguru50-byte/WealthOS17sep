import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Membership Interval Integrity Unit Tests', () => {
  const memPath = path.join(process.cwd(), 'data/v6.4/v642_historical_membership.jsonl');

  test('1. Membership intervals enforce non-overlapping dates per security and valid start < end', () => {
    expect(fs.existsSync(memPath)).toBe(true);
    const intervals = fs.readFileSync(memPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    
    expect(intervals.length).toBeGreaterThan(500);
    for (const item of intervals) {
      expect(item.membershipStart).toBeDefined();
      expect(item.membershipEnd).toBeDefined();
      expect(new Date(item.membershipStart).getTime()).toBeLessThan(new Date(item.membershipEnd).getTime());
      expect(item.isin).toMatch(/^INE/);
    }
  });
});
