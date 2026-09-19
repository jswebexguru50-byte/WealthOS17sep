/**
 * WealthOS v6.6–v6.7 - Reference Evidence Adapter
 * External Reference Acceleration Layer
 * 
 * Ingests ReferenceEvaluationResult and emits REFERENCE_VALIDATOR evidence onto EvidenceBus.
 * Invariant: Never authorizes execution or sizes positions.
 */

import { EvidenceBus } from '../composable/EvidenceBus.js';
import { PITContext } from '../composable/PITContext.js';
import { ReferenceEvaluationResult } from './ReferenceEngineContract.js';

export class ReferenceEvidenceAdapter {
  public static publishReferenceEvidence(
    bus: EvidenceBus,
    context: PITContext,
    result: ReferenceEvaluationResult,
    securityId: string
  ): void {
    bus.emit({
      type: 'TECHNICAL_SIGNAL', // Routed into technical cluster under REFERENCE_VALIDATOR role
      engineId: `REF_${result.referenceId}`,
      securityId,
      engineVersion: result.provenance.sourceVersion,
      engineSourceHash: result.provenance.sourceHash || 'EXTERNAL_REF_HASH',
      parameterHash: 'REF_DEFAULT_PARAMS',
      dataSnapshotHash: result.provenance.dataSnapshotHash,
      inputEvidenceIds: [],
      sourceRequirementIds: ['REQ_REF_DATA'],
      pitContextHash: context.contextHash,
      decisionGraphHash: 'GRAPH_REF_V66',
      runId: `RUN_REF_${context.decisionDate}`,
      decisionDate: context.decisionDate,
      decisionTimestamp: context.decisionTimestamp,
      payload: {
        referenceId: result.referenceId,
        status: result.status,
        observations: result.observations,
        discrepancies: result.discrepancies,
        isReferenceOnly: true,
        canAuthorizeTrade: false, // HARD ENFORCEMENT
        passed: result.status === 'MATCH'
      }
    });
  }
}
