import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Historical Rebalance Reconstruction & Conservation Tests', () => {
  const rebPath = path.join(process.cwd(), 'data/v6.4/v642_historical_rebalances.jsonl');

  test('1. Rebalance conservation invariants hold: NewSet = PreviousSet - Exits + Entries', () => {
    expect(fs.existsSync(rebPath)).toBe(true);
    const records = fs.readFileSync(rebPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    
    expect(records.length).toBe(10);
    for (const reb of records) {
      expect(reb.setConservationPassed).toBe(true);
      expect(reb.previousCount - reb.exitCount + reb.entryCount).toBe(reb.newCount);
      expect(reb.previousSetHash).not.toBe(reb.newSetHash);
    }
  });

  test('2. Rebalance records include both scheduled and ad-hoc events', () => {
    const records = fs.readFileSync(rebPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    const eventTypes = records.map(r => r.eventType);
    expect(eventTypes).toContain('SCHEDULED_REBALANCE');
    expect(eventTypes).toContain('AD_HOC_RECONSTITUTION');
  });
});
