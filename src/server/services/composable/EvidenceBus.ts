/**
 * WealthOS v6.6 - Evidence Bus
 * Agent E Deliverable
 * 
 * SPEC MANDATE:
 * Cryptographic provenance on every evidence piece:
 *   Final Decision -> Evidence -> Engine -> Parameters -> Data Snapshot -> Source Code
 * Strict isolated message passing between all engines.
 */

import crypto from 'crypto';
import { EvidenceType } from './EngineCapability.js';

export interface Evidence<T = unknown> {
  id: string;
  type: EvidenceType;
  engineId: string;
  strategyId?: string;
  securityId?: string; // Canonical UUID

  // Full cryptographic lineage
  engineVersion: string;
  engineSourceHash: string;
  parameterHash: string;
  dataSnapshotHash: string;
  inputEvidenceIds: string[];
  sourceRequirementIds: string[];
  pitContextHash: string;
  decisionGraphHash: string;
  runId: string;

  decisionDate: string;
  decisionTimestamp: string;
  payload: T;
  producedAt: string;
}

export class EvidenceBus {
  private evidenceLog: Evidence[] = [];
  private evidenceById = new Map<string, Evidence>();
  private evidenceByType = new Map<EvidenceType, Evidence[]>();
  private evidenceBySecurity = new Map<string, Evidence[]>();

  /**
   * Emits a verified evidence record onto the bus
   */
  public emit<T>(
    params: Omit<Evidence<T>, 'id' | 'producedAt'>
  ): Evidence<T> {
    const id = `EVID_${params.type}_${params.securityId || 'PORTFOLIO'}_${crypto.randomBytes(6).toString('hex')}`;
    const evidence: Evidence<T> = {
      ...params,
      id,
      producedAt: new Date().toISOString()
    };

    this.evidenceLog.push(evidence as Evidence);
    this.evidenceById.set(id, evidence as Evidence);

    if (!this.evidenceByType.has(evidence.type)) {
      this.evidenceByType.set(evidence.type, []);
    }
    this.evidenceByType.get(evidence.type)!.push(evidence as Evidence);

    if (evidence.securityId) {
      if (!this.evidenceBySecurity.has(evidence.securityId)) {
        this.evidenceBySecurity.set(evidence.securityId, []);
      }
      this.evidenceBySecurity.get(evidence.securityId)!.push(evidence as Evidence);
    }

    return evidence;
  }

  public getById(id: string): Evidence | undefined {
    return this.evidenceById.get(id);
  }

  public getByType(type: EvidenceType): Evidence[] {
    return this.evidenceByType.get(type) || [];
  }

  public getBySecurity(securityId: string): Evidence[] {
    return this.evidenceBySecurity.get(securityId) || [];
  }

  public getAll(): Evidence[] {
    return [...this.evidenceLog];
  }

  // Backward/Forward convenience aliases
  public publish<T>(params: Omit<Evidence<T>, 'id' | 'producedAt'>): Evidence<T> {
    return this.emit(params);
  }

  public getAllEvidence(): Evidence[] {
    return this.getAll();
  }

  public getEvidenceByType(type: EvidenceType): Evidence[] {
    return this.getByType(type);
  }

  public getEvidenceForSecurity(securityId: string): Evidence[] {
    return this.getBySecurity(securityId);
  }

  public clear(): void {
    this.evidenceLog = [];
    this.evidenceById.clear();
    this.evidenceByType.clear();
    this.evidenceBySecurity.clear();
  }
}
