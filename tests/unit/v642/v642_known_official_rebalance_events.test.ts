import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Known Official Rebalance Events Provenance Tests', () => {
  const rebPath = path.join(process.cwd(), 'data/v6.4/v642_historical_rebalances.jsonl');

  test('1. Validates provenance chain for official historical events (HDFC merger, ZOMATO inclusion)', () => {
    expect(fs.existsSync(rebPath)).toBe(true);
    const records = fs.readFileSync(rebPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));

    // ZOMATO inclusion on 2021-09-30
    const zomatoReb = records.find(r => r.effectiveDate === '2021-09-30');
    expect(zomatoReb).toBeDefined();
    expect(zomatoReb.entries).toContain('ZOMATO');
    expect(zomatoReb.sourceId).toBe('SRC_NSE_CIRCULAR_RECON_ARCHIVE_2020_2024');

    // HDFC exit on ad-hoc reconstitution 2023-09-29
    const hdfcReb = records.find(r => r.effectiveDate === '2023-09-29');
    expect(hdfcReb).toBeDefined();
    expect(hdfcReb.exits).toContain('HDFC_OLD');
    expect(hdfcReb.eventType).toBe('AD_HOC_RECONSTITUTION');
  });
});
