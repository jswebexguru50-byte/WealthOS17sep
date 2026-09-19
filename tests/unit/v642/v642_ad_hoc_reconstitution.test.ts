import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Ad-Hoc Reconstitution Unit Tests', () => {
  const rebPath = path.join(process.cwd(), 'data/v6.4/v642_historical_rebalances.jsonl');

  test('1. Validates inclusion of AD_HOC_RECONSTITUTION events (such as HDFC entity merger)', () => {
    expect(fs.existsSync(rebPath)).toBe(true);
    const records = fs.readFileSync(rebPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    
    const adHoc = records.filter(r => r.eventType === 'AD_HOC_RECONSTITUTION');
    expect(adHoc.length).toBeGreaterThanOrEqual(1);
    expect(adHoc[0].effectiveDate).toBe('2023-09-29');
  });
});
