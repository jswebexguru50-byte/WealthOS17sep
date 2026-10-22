import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 HDFC Corporate Action vs Index Membership Separation Tests', () => {
  const valPath = path.join(process.cwd(), 'data/v6.4/v642_historical_pit_validation.json');

  test('1. Disentangles corporate action identity fields from index membership fields', () => {
    expect(fs.existsSync(valPath)).toBe(true);
    const val = JSON.parse(fs.readFileSync(valPath, 'utf-8'));
    const hdfc = val.hdfcAdHocMergerEvent;

    expect(hdfc).toBeDefined();

    // Corporate Action Identity Event
    expect(hdfc.corporateActionDate).toBe('2023-07-13');
    expect(hdfc.transferorSecurityId).toBe('SEC_INE001A01036_HDFC_OLD');
    expect(hdfc.transfereeSecurityId).toBe('SEC_INE040A01034_HDFCBANK');

    // Index Membership Reconstitution Event
    expect(hdfc.indexAnnouncementDate).toBe('2023-08-21');
    expect(hdfc.indexEffectiveDate).toBe('2023-09-29');
    expect(hdfc.indexEntrySecurityId).toBe('SEC_INE0J0S01010_JIOFIN');
    expect(hdfc.indexExitSecurityId).toBe('SEC_INE001A01036_HDFC_OLD');
    expect(hdfc.membershipBefore).toBe('PRESENT_IN_NIFTY500');
    expect(hdfc.membershipAfter).toBe('REPLACED_BY_JIOFIN');

    // Assert that Corporate Action Event is NOT equal to Index Membership Event
    expect(hdfc.corporateActionDate).not.toBe(hdfc.indexEffectiveDate);
    expect(hdfc.transfereeSecurityId).not.toBe(hdfc.indexEntrySecurityId);
  });
});
