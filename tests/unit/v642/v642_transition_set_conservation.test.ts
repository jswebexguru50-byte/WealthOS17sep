import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Transition Set Conservation Invariants Unit Tests', () => {
  const rebPath = path.join(process.cwd(), 'data/v6.4/v642_historical_rebalances.jsonl');

  test('1. Validates previousSetHash, entrySetHash, exitSetHash, and newSetHash for every rebalance', () => {
    expect(fs.existsSync(rebPath)).toBe(true);
    const records = fs.readFileSync(rebPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));

    for (const reb of records) {
      expect(reb.previousSetHash).toBeDefined();
      expect(reb.entrySetHash).toBeDefined();
      expect(reb.exitSetHash).toBeDefined();
      expect(reb.newSetHash).toBeDefined();
      expect(reb.setConservationPassed).toBe(true);
    }
  });
});
