export type AgentPhase =
  | 'NOT_STARTED'
  | 'DISCOVERY'
  | 'SOURCE_AUDIT'
  | 'IMPLEMENTATION'
  | 'EXECUTION'
  | 'WAITING'
  | 'BLOCKED'
  | 'RE_AUDIT_REQUIRED'
  | 'COMPLETE';

export interface AgentStatus {
  agentId: string;
  program: 'S1101R2';
  phase: AgentPhase;
  startedAt: string;
  updatedAt: string;
  percentComplete: number;
  currentTask: string;
  completedTasks: string[];
  nextTasks: string[];
  testsPassed: number;
  testsFailed: number;
  testsBlocked: number;
  evidenceCount: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  dataGaps: number;
  acquisitionsRequested: number;
  acquisitionsCompleted: number;
  currentDatasetHash: string;
  currentDatasetVersion: string;
  lastEvidenceId: string | null;
  lastArtifact: string | null;
  blockers: string[];
  conflicts: string[];
  result: 'UNKNOWN' | 'PASS' | 'PASS_WITH_LIMITATION' | 'FAIL' | 'BLOCKED';
  heartbeat: {
    sequence: number;
    timestamp: string;
  };
}

export interface EvidenceRecord {
  evidenceId: string;
  agentId: string;
  category:
    | 'SOURCE_CODE'
    | 'DATA'
    | 'PIT'
    | 'IDENTITY'
    | 'CORPORATE_ACTION'
    | 'TIMESTAMP'
    | 'REPLAY'
    | 'DATABASE'
    | 'RED_TEAM'
    | 'GOVERNANCE';
  claim: string;
  observedValue: unknown;
  expectedValue: unknown;
  status: 'PASS' | 'PASS_WITH_LIMITATION' | 'FAIL' | 'BLOCKED';
  sourceFiles: string[];
  sourceHashes: string[];
  artifactPath: string;
  artifactHash: string;
  datasetHash: string;
  reproducible: boolean;
  timestamp: string;
}

export interface ConflictRecord {
  conflictId: string;
  type: string;
  agents: string[];
  claimA: string;
  claimB: string;
  evidenceA?: string;
  evidenceB?: string;
  status: 'OPEN' | 'EVIDENCE_REQUESTED' | 'REPRODUCED' | 'RESOLVED' | 'UNRESOLVED';
  resolution?: string;
  resolutionEvidence?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface ApprovedDataSource {
  sourceId: string;
  tier: 0 | 1 | 2 | 3 | 4;
  authority: string;
  domains: string[];
  supportsHistorical: boolean;
  supportsPIT: boolean;
  acquisitionMethod: string;
  allowed: boolean;
}

export interface ChainOfCustodyRecord {
  acquisitionId: string;
  sourceId: string;
  sourceTier: number;
  requestedAt: string;
  acquiredAt: string;
  rawByteHash: string;
  parsedByteHash: string;
  canonicalCandidateHash: string;
  datasetVersion: string;
  schemaValidation: 'PASS' | 'FAIL';
  identityValidation: 'PASS' | 'FAIL';
  corporateActionValidation: 'PASS' | 'FAIL';
  timestampValidation: 'PASS' | 'FAIL';
  pitValidation: 'PASS' | 'FAIL';
  reconciliation: 'PASS' | 'FAIL';
  canonicalEligible: boolean;
}

export interface DatasetVersion {
  datasetVersionId: string;
  datasetHash: string;
  sourceManifestHash: string;
  frozenControlHash: string;
  codeHash: string;
  configurationHash: string;
  createdAt: string;
  parentDatasetVersionId?: string;
  changedDomains: string[];
}

export interface ArtifactManifestEntry {
  path: string;
  fileSize: number;
  sha256: string;
  createdAt: string;
  datasetHash: string;
  runId: string;
  producerAgent: string;
  status: 'PASS' | 'FAIL' | 'LIMITATION';
}

export type S1101R2FinalStatus =
  | 'S1101R2_VERIFIED'
  | 'S1101R2_VERIFIED_WITH_LIMITATIONS'
  | 'S1101R2_NOT_VERIFIED'
  | 'S1101R2_BLOCKED';

export interface GovernanceInput {
  frozenControlsFailed: boolean;
  liveFirewallFailed: boolean;
  canonicalUnexpectedWrites: number;
  cleanRoomDependencyViolation: boolean;
  unresolvedCriticalConflicts: number;
  contaminationViolations: number;
  requiredCurrentDataMissing: boolean;
  materialHistoricalCoverageGap: boolean;
  materialUnresolvedNonCriticalLimitation: boolean;
}
