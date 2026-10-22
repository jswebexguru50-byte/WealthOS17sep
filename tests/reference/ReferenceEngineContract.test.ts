import { describe, it, expect } from 'vitest';
import { ReferenceCapabilityRegistry } from '../../src/server/services/reference/ReferenceCapabilityRegistry.js';
import { ReferenceVersionRegistry } from '../../src/server/services/reference/ReferenceVersionRegistry.js';
import { PKSCREENER_POLICY, FENIX_POLICY } from '../../src/server/services/reference/ReferenceSourcePolicy.js';

describe('Reference Engine Contract & Policies', () => {
  it('enforces non-negotiable policy: trade authorization is strictly prohibited for external references', () => {
    expect(PKSCREENER_POLICY.allowedForTradeAuthorization).toBe(false);
    expect(FENIX_POLICY.allowedForTradeAuthorization).toBe(false);
    expect(PKSCREENER_POLICY.allowedForEconomicValidation).toBe(false);
  });

  it('verifies PKScreener pinned version and MIT license', () => {
    const version = ReferenceVersionRegistry.getInstance().assertVersionPinned('PKSCREENER');
    expect(version.version).toBe('0.45.20240315');
    expect(version.license).toBe('MIT');
    expect(version.legalReviewRequired).toBe(false);
  });

  it('verifies Fenix pinned version and GPLv3 license requirement', () => {
    const version = ReferenceVersionRegistry.getInstance().assertVersionPinned('FENIX');
    expect(version.version).toBe('1.2.0');
    expect(version.license).toBe('GPLv3');
    expect(version.legalReviewRequired).toBe(true);
  });

  it('verifies all 14 PKScreener reference capabilities are candidateOnly = true', () => {
    const caps = ReferenceCapabilityRegistry.getInstance().getAll();
    expect(caps.length).toBeGreaterThanOrEqual(14);
    for (const c of caps) {
      expect(c.candidateOnly).toBe(true);
    }
  });
});
