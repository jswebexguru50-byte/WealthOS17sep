/**
 * WealthOS v6.6–v6.7 - Reference Engine Contract
 * External Reference Acceleration Layer
 * 
 * NON-NEGOTIABLE ARCHITECTURAL PRINCIPLE:
 * External Reference Engines (PKScreener, Fenix) serve as reference, parity, and discovery accelerators.
 * They NEVER possess direct authority to create executable trades or size positions.
 * Role: REFERENCE_VALIDATOR
 * Invariants:
 * - canGenerateTrade = false
 * - canSizePosition = false
 * - canAuthorizeExecution = false
 * - canOverrideRisk = false
 * - canOverrideCapitalProtection = false
 */

export type ReferenceResultStatus =
  | 'MATCH'
  | 'MISMATCH'
  | 'REFERENCE_ONLY'
  | 'WEALTHOS_ONLY'
  | 'DATA_INSUFFICIENT'
  | 'UNSUPPORTED'
  | 'ERROR';

export interface ReferenceObservation {
  featureId: string;
  value: unknown;
  asOfDate: string;
  availableAt?: string;
  calculationHash?: string;
}

export interface ReferenceDiscrepancy {
  featureId: string;
  wealthOSValue: unknown;
  referenceValue: unknown;
  discrepancyType:
    | 'VALUE'
    | 'DATE'
    | 'DATA'
    | 'PARAMETER'
    | 'DEFINITION'
    | 'CORPORATE_ACTION'
    | 'IDENTITY';
  materiality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  explanation: string;
}

export interface ReferenceProvenance {
  source: string;
  sourceVersion: string;
  sourceHash?: string;
  inputHash: string;
  outputHash: string;
  pitContextHash: string;
  dataSnapshotHash: string;
  generatedAt: string;
}

export interface ReferenceEvaluationRequest {
  securityId: string;
  symbol: string;
  decisionDate: string; // YYYY-MM-DD
  decisionTimestamp: string; // ISO in Asia/Kolkata
  pitContextHash: string;
  dataSnapshotHash: string;
  featureIds: string[];
  inputEvidenceIds: string[];
  runId: string;
}

export interface ReferenceEvaluationResult {
  referenceId: string;
  status: ReferenceResultStatus;
  observations: ReferenceObservation[];
  discrepancies: ReferenceDiscrepancy[];
  provenance: ReferenceProvenance;
}

export interface ReferenceEngineContract {
  referenceId: string;
  provider: string;
  providerVersion: string;
  implementationHash?: string;
  capabilityIds: string[];
  role: 'REFERENCE_VALIDATOR';

  evaluate(request: ReferenceEvaluationRequest): Promise<ReferenceEvaluationResult>;
}
