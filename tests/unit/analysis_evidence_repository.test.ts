import { describe, expect, it } from 'vitest';
import {
  ALL_ANALYSIS_MODULES,
  AnalysisModule,
  DataStatus,
  FactEnvelope,
  EvidenceReference,
} from '../../src/server/services/intelligence/contracts/index.js';
import { SecurityIdentityRegistry } from '../../src/server/services/dataAcquisition/SecurityIdentityRegistry.js';
import { AnalysisEvidenceRepository } from '../../src/server/services/intelligence/AnalysisEvidenceRepository.js';

describe('Canonical Analysis Contracts & Evidence Repository', () => {
  it('exposes all 12 canonical analysis modules without forced sequence', () => {
    expect(ALL_ANALYSIS_MODULES).toHaveLength(12);
    expect(ALL_ANALYSIS_MODULES).toContain('TECHNICAL');
    expect(ALL_ANALYSIS_MODULES).toContain('FUNDAMENTAL');
    expect(ALL_ANALYSIS_MODULES).toContain('FERE');
    expect(ALL_ANALYSIS_MODULES).toContain('QGLP');
    expect(ALL_ANALYSIS_MODULES).toContain('MANAGEMENT');
    expect(ALL_ANALYSIS_MODULES).toContain('BUSINESS_INFLECTION');
    expect(ALL_ANALYSIS_MODULES).toContain('VALUATION');
    expect(ALL_ANALYSIS_MODULES).toContain('SMART_MONEY');
    expect(ALL_ANALYSIS_MODULES).toContain('MARKET_CONTEXT');
    expect(ALL_ANALYSIS_MODULES).toContain('CATALYST');
    expect(ALL_ANALYSIS_MODULES).toContain('RISK');
    expect(ALL_ANALYSIS_MODULES).toContain('PORTFOLIO');
  });

  describe('SecurityIdentityRegistry fail-closed behavior', () => {
    const registry = SecurityIdentityRegistry.getInstance();

    it('returns IDENTITY_REVIEW for unmapped identifiers without synthesizing SEC_symbol_NSE', () => {
      const resolution = registry.resolveSecurityId('TOTALLY_FICTIONAL_TICKER_XYZ');
      expect(resolution.status).toBe('IDENTITY_REVIEW');
      if (resolution.status === 'IDENTITY_REVIEW') {
        expect(resolution.identifier).toBe('TOTALLY_FICTIONAL_TICKER_XYZ');
        expect(resolution.reason).toContain('No authoritative');
      }
    });

    it('registers and resolves canonical security records using genuine ISIN or Master ID', () => {
      registry.registerIdentity({
        securityId: 'INE002A01018',
        isin: 'INE002A01018',
        nseSymbol: 'RELIANCE_TEST',
        bseCode: '500325',
        exchange: 'NSE',
        segment: 'NSE',
        instrumentType: 'EQUITY',
        validFrom: '2000-01-01',
        validTo: null,
        status: 'ACTIVE',
        verifiedAt: '2026-09-28T00:00:00Z',
      });

      const resolution = registry.resolveSecurityId('RELIANCE_TEST');
      expect(resolution.status).toBe('VERIFIED');
      if (resolution.status === 'VERIFIED') {
        expect(resolution.securityId).toBe('INE002A01018');
        expect(resolution.securityId).not.toContain('SEC_');
      }
    });
  });

  describe('AnalysisEvidenceRepository contract invariants', () => {
    const repository = AnalysisEvidenceRepository.getInstance();

    it('returns fail-closed IDENTITY_REVIEW envelope when querying unmapped securities', async () => {
      const envelope = await repository.getFact('NON_EXISTENT_SECURITY_123', 'ROCE');
      expect(envelope.status).toBe('IDENTITY_REVIEW');
      expect(envelope.value).toBeNull();
      expect(envelope.provenance).toHaveLength(0);
      expect(envelope.missingReason).toContain('unmapped');
    });

    it('returns DATA_INSUFFICIENT envelope with null value when metric is absent (no synthetic fallbacks)', async () => {
      // Register a test security
      SecurityIdentityRegistry.getInstance().registerIdentity({
        securityId: 'TEST_SEC_ID_999',
        isin: 'INE999999999',
        nseSymbol: 'TESTSYM999',
        bseCode: null,
        exchange: 'NSE',
        segment: 'NSE',
        instrumentType: 'EQUITY',
        validFrom: '2020-01-01',
        validTo: null,
        status: 'ACTIVE',
        verifiedAt: '2026-09-28T00:00:00Z',
      });

      const envelope = await repository.getFact('TESTSYM999', 'ABSENT_CANONICAL_METRIC');
      expect(envelope.status).toBe('DATA_INSUFFICIENT');
      expect(envelope.value).toBeNull();
      expect(envelope.missingReason).toContain('No canonical fact or snapshot registered');
    });

    it('returns SOURCE_UNAVAILABLE when querying sector momentum with unavailable index data', async () => {
      const result = await repository.getSectorMomentum('TESTSYM999', 'NON_EXISTENT_SECTOR_FOOBAR');
      expect(result.status).toBe('SOURCE_UNAVAILABLE');
      expect(result.snapshot?.status).toBe('UNAVAILABLE');
    });
  });
});
