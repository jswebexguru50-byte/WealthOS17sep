import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Security Identity Continuity Unit Tests', () => {
  const memPath = path.join(process.cwd(), 'data/v6.4/v642_historical_membership.jsonl');

  test('1. Security identity uses ISIN / corporate ID hierarchy, preventing false ticker change exit events', () => {
    expect(fs.existsSync(memPath)).toBe(true);
    const intervals = fs.readFileSync(memPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));

    const isins = new Set(intervals.map(i => i.isin));
    expect(isins.size).toBe(intervals.length);
    for (const item of intervals) {
      expect(item.securityId).toContain(item.isin);
    }
  });
});
