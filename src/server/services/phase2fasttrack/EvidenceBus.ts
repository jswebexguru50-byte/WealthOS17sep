import crypto from "crypto";
import { EvidenceEnvelope, AgentAuthorityMatrix } from "./FastTrackTypes";

export class EvidenceBus {
  private ledger: EvidenceEnvelope<any>[] = [];

  constructor(private runId: string) {}

  public publish<T>(
    producer: string,
    evidenceType: string,
    inputHashes: Record<string, string>,
    datasetHash: string,
    payload: T,
    pitValid: boolean,
    provenanceValid: boolean,
    metadata: { decisionDate?: string; securityId?: string; strategyId?: string; [key: string]: unknown } = {}
  ): EvidenceEnvelope<T> {
    
    // Check authority matrix
    const authority = AgentAuthorityMatrix[producer];
    if (authority && !authority.canWrite.includes(evidenceType)) {
        throw new Error(`AUTHORITY_VIOLATION: Agent ${producer} cannot write evidence of type ${evidenceType}`);
    }

    // Generate hash
    const contentToHash = JSON.stringify({
      producer,
      evidenceType,
      inputHashes,
      payload,
      pitValid,
      provenanceValid
    });
    
    const evidenceHash = crypto.createHash('sha256').update(contentToHash).digest('hex');
    const evidenceId = `EV-${this.runId}-${String(this.ledger.length + 1).padStart(6, '0')}`;

    const envelope: EvidenceEnvelope<T> = {
      evidenceId,
      runId: this.runId,
      producer,
      evidenceType,
      inputHashes,
      datasetHash,
      decisionDate: metadata.decisionDate,
      securityId: metadata.securityId,
      strategyId: metadata.strategyId,
      payload: Object.freeze(payload),
      pitValid,
      provenanceValid,
      createdAt: new Date().toISOString(),
      evidenceHash
    };

    this.ledger.push(envelope);
    return envelope;
  }

  public getEvidenceByType<T>(evidenceType: string): EvidenceEnvelope<T>[] {
    return this.ledger.filter(e => e.evidenceType === evidenceType) as EvidenceEnvelope<T>[];
  }

  public getEvidenceByProducer<T>(producer: string): EvidenceEnvelope<T>[] {
    return this.ledger.filter(e => e.producer === producer) as EvidenceEnvelope<T>[];
  }

  public getFullLedger(): EvidenceEnvelope<any>[] {
    return [...this.ledger];
  }
}
