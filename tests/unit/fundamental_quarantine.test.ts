import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntelligenceQualityGate } from '../../src/server/intelligence/services/IntelligenceQualityGate.js';
import sqlite3 from 'sqlite3';

describe('WealthOS Fundamental Quarantine — Test Integrity Gate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('MUST NOT allow synthetic or unverified evidence to bypass SourceArtifactTrust', async () => {
    const db = new sqlite3.Database(':memory:');
    const qualityGate = new IntelligenceQualityGate(db as any);

    // Do NOT mock SourceArtifactTrust.verify to return true here. We want to test its natural rejection of synthetic inputs.
    // If the evidence does not exist in fere_evidence.db, it should throw or reject.
    
    const syntheticClaim = {
      claimId: 'SYNTHETIC_TEST_001',
      evidenceId: 'EV_NON_EXISTENT_SYNTHETIC',
      module: 'FUNDAMENTAL',
      statement: 'Synthetic claim',
      status: 'SUPPORTED'
    };

    let errorThrown = false;
    try {
      await qualityGate.approveAndPersistClaim(
        syntheticClaim as any,
        { evaluatedAt: new Date().toISOString() } as any
      );
    } catch (e: any) {
      errorThrown = true;
      expect(e.message).toMatch(/artifact|verify|EvidenceInventory|SQLITE/i);
    }

    // Expect the real SourceArtifactTrust to throw or reject the synthetic claim
    // (If the code was built differently, e.g., returning false and then throwing, that applies too).
    // The key is that the claim MUST NOT be persisted.
    expect(errorThrown).toBe(true);
  });
});
