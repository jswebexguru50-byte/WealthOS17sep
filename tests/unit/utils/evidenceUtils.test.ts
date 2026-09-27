import { requireEvidence, EvidenceField } from '../../../src/utils/evidenceUtils';
import { describe, it, expect } from 'vitest';

describe('Evidence Contract & requireEvidence guard', () => {
  it('should pass and return value if status is VERIFIED and value is not null', () => {
    const field: EvidenceField<number> = {
      value: 42,
      status: 'VERIFIED',
      provenance: [{
        sourceSystem: 'TEST',
        fetchedAt: new Date().toISOString(),
        observedAt: new Date().toISOString(),
        asOfDate: new Date().toISOString()
      }]
    };
    
    expect(requireEvidence(field, 'test_metric')).toBe(42);
  });

  it('should throw an error if status is not VERIFIED', () => {
    const field: EvidenceField<number> = {
      value: 42,
      status: 'PARTIAL',
      provenance: []
    };
    
    expect(() => requireEvidence(field, 'test_metric')).toThrowError('DECISION_BLOCKED:test_metric:PARTIAL');
  });

  it('should throw an error if value is null even if VERIFIED', () => {
    const field: EvidenceField<number> = {
      value: null,
      status: 'VERIFIED',
      provenance: []
    };
    
    expect(() => requireEvidence(field, 'test_metric')).toThrowError('DECISION_BLOCKED:test_metric:VERIFIED');
  });

  it('should block on missing data statuses like DATA_INSUFFICIENT or SOURCE_UNAVAILABLE', () => {
    const field: EvidenceField<number> = {
      value: null,
      status: 'DATA_INSUFFICIENT',
      provenance: []
    };
    
    expect(() => requireEvidence(field, 'fii_holding')).toThrowError('DECISION_BLOCKED:fii_holding:DATA_INSUFFICIENT');
  });
});
