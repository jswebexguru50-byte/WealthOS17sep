/**
 * src/server/services/phase2fasttrack/CP21VerificationEvidence.ts
 *
 * Formal evidence contracts for CP2.1 Independent Verifier.
 * The verifier requires physical artifact references and computes all predicates independently.
 */

export interface ArtifactReference {
  path: string;
  expectedSha256?: string;
  exactBytes?: number;
  exactRecords?: number;
}

export interface CP21VerificationEvidence {
  repositorySha: string;
  canonicalLedger: ArtifactReference;
  frozenControls: ArtifactReference[];
  researchSnapshot: ArtifactReference;
  dependencyGraph: ArtifactReference;
  auditLedger: ArtifactReference;
  replayManifest?: ArtifactReference;
  cleanRoomManifest?: ArtifactReference;
}

export interface CP21VerificationResult {
  deliveryDecision:
    | 'IMPLEMENTED_AND_VERIFIED'
    | 'IMPLEMENTED_WITH_LIMITATIONS'
    | 'FAILED';

  cp21Authorization: false;

  predicates: {
    canonicalLedgerImmutable: boolean;
    canonicalPopulationValid: boolean;
    canonicalIdentityPreserved: boolean;
    enrichmentOneToOne: boolean;
    frozenControlsValid: boolean;
    pitIntegrityValid: boolean;
    calendarIntegrityValid: boolean;
    provenanceValid: boolean;
    deterministicOutcomeValid: boolean;
    noSyntheticEvidence: boolean;
    dependencyIsolationValid: boolean;
    adversarialReplayValid: boolean;
    cleanRoomValid: boolean;
  };

  evidenceHashes: Record<string, string>;
  failures: string[];
}
