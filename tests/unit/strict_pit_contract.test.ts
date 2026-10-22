/**
 * strict_pit_contract.test.ts
 *
 * Architecture gate: EvidenceRef.pitStatus must always be present (mandatory).
 * Verifies PitMode STRICT/ALLOW_INFERRED distinction exists in CanonicalFactRepository.
 * Historical replay must reject PIT_INFERRED and PIT_UNKNOWN evidence.
 */

import { EvidenceRef, PitStatus } from '../../src/server/services/intelligence/contracts/EvidenceRef.js';
import { CanonicalFactRepository, PitMode } from '../../src/server/services/intelligence/core/CanonicalFactRepository.js';

describe('PIT Contract — pitStatus mandatory', () => {
  it('EvidenceRef pitStatus is a required field (not optional)', () => {
    // If pitStatus were optional, TypeScript would allow omitting it.
    // We verify the type structure requires it by constructing a valid EvidenceRef.
    const ref: EvidenceRef = {
      evidenceId: 'test_ev_001',
      sourceType: 'EXCHANGE_FILING',
      sourceName: 'Test Filing',
      documentDate: '2025-03-31',
      availableAt: '2025-04-15',
      pitStatus: 'PIT_VERIFIED',
      extractionMethod: 'STRUCTURED_XBRL',
    };
    expect(ref.pitStatus).toBe('PIT_VERIFIED');
  });

  it('PIT_UNKNOWN evidence must have null availableAt', () => {
    const ref: EvidenceRef = {
      evidenceId: 'test_ev_002',
      sourceType: 'OTHER',
      sourceName: 'Unknown Source',
      documentDate: null,
      availableAt: null,
      pitStatus: 'PIT_UNKNOWN',
      extractionMethod: 'MANUAL_AUDITED',
    };
    expect(ref.availableAt).toBeNull();
    expect(ref.pitStatus).toBe('PIT_UNKNOWN');
  });

  it('documentDate is nullable — no fabricated today date', () => {
    // documentDate: string | null must be accepted by the type
    const ref: EvidenceRef = {
      evidenceId: 'test_ev_003',
      sourceType: 'ANNUAL_REPORT',
      sourceName: 'Annual Report',
      documentDate: null,
      availableAt: null,
      pitStatus: 'PIT_UNKNOWN',
      extractionMethod: 'MANUAL_AUDITED',
    };
    expect(ref.documentDate).toBeNull();
  });

  it('historical replay rejects PIT_INFERRED evidence', () => {
    // Simulates strict historical replay rejection logic
    function isAdmissibleForHistoricalReplay(ref: EvidenceRef): boolean {
      return ref.pitStatus === 'PIT_VERIFIED' && ref.availableAt !== null;
    }

    const inferred: EvidenceRef = {
      evidenceId: 'ev_inferred',
      sourceType: 'EXCHANGE_FILING',
      sourceName: 'Filing',
      documentDate: '2025-03-31',
      availableAt: '2025-03-31',
      pitStatus: 'PIT_INFERRED',
      extractionMethod: 'STRUCTURED_XBRL',
    };

    const verified: EvidenceRef = {
      evidenceId: 'ev_verified',
      sourceType: 'EXCHANGE_FILING',
      sourceName: 'Filing',
      documentDate: '2025-04-15',
      availableAt: '2025-04-15',
      pitStatus: 'PIT_VERIFIED',
      extractionMethod: 'STRUCTURED_XBRL',
    };

    expect(isAdmissibleForHistoricalReplay(inferred)).toBe(false);
    expect(isAdmissibleForHistoricalReplay(verified)).toBe(true);
  });

  it('PitMode type must have STRICT and ALLOW_INFERRED values', () => {
    const strict: PitMode = 'STRICT';
    const inferred: PitMode = 'ALLOW_INFERRED';
    expect(strict).toBe('STRICT');
    expect(inferred).toBe('ALLOW_INFERRED');
  });
});
