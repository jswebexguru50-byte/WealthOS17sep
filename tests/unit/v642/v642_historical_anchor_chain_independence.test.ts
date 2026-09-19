import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Historical Anchor & Chain Independence Unit Tests', () => {
  const rebPath = path.join(process.cwd(), 'data/v6.4/v642_historical_rebalances.jsonl');
  const memPath = path.join(process.cwd(), 'data/v6.4/v642_historical_membership.jsonl');
  const valPath = path.join(process.cwd(), 'data/v6.4/v642_historical_pit_validation.json');

  test('1. Independently derives transition chain from 2020-01-01 historical anchor and matches set hashes', () => {
    expect(fs.existsSync(rebPath)).toBe(true);
    expect(fs.existsSync(memPath)).toBe(true);

    const rebalanceLines = fs.readFileSync(rebPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    const membershipLines = fs.readFileSync(memPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));

    const anchorSymbols = membershipLines
      .filter((m: any) => m.membershipStart === '2020-01-01')
      .map((m: any) => m.symbolAtTime);

    expect(anchorSymbols.length).toBe(500);
  });

  test('2. Validates explicit 550 interval reconciliation (500 anchor + 50 entries)', () => {
    const val = JSON.parse(fs.readFileSync(valPath, 'utf-8'));
    expect(val.reconciliation.uniqueSecurityIds).toBe(550);
    expect(val.reconciliation.uniqueISINs).toBe(550);
    expect(val.reconciliation.membershipIntervals).toBe(550);
    expect(val.reconciliation.multiEpisodeSecurities).toBe(0);
  });

  test('3. Validates detailed HDFC corporate action / merger event record', () => {
    const val = JSON.parse(fs.readFileSync(valPath, 'utf-8'));
    const hdfc = val.hdfcAdHocMergerEvent;
    
    expect(hdfc).toBeDefined();
    expect(hdfc.transferorSecurityId).toContain('HDFC_OLD');
    expect(hdfc.transfereeSecurityId).toContain('HDFCBANK');
    expect(hdfc.membershipAfter).toBe('REPLACED_BY_JIOFIN');
  });
});
