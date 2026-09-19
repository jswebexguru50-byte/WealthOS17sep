import { describe, it, expect } from 'vitest';
import { ProvenanceEvidenceValidator } from '../../../src/server/services/audit/ProvenanceEvidenceValidator.js';

describe('V672 Track D — Data Provenance Completeness Tests', () => {
  const validator = new ProvenanceEvidenceValidator();

  it('validates complete lineage across all 10 canonical market domains', () => {
    const canonical = validator.generateCanonicalProvenance();
    const result = validator.validateProvenance(canonical);
    expect(result.valid).toBe(true);
    expect(result.status).toBe('PASS');
    expect(result.missingDomains.length).toBe(0);
    expect(result.recordsValidated).toBe(10);
  });

  it('rejects partial dataset manifests as PROVENANCE_INCOMPLETE', () => {
    const canonical = validator.generateCanonicalProvenance();
    const truncated = canonical.slice(0, 7); // Missing 3 domains
    const result = validator.validateProvenance(truncated);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('PROVENANCE_INCOMPLETE');
    expect(result.missingDomains.length).toBe(3);
  });
});
