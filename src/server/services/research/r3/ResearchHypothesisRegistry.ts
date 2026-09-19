import * as crypto from 'crypto';
import { DataRequirement } from './ResearchSnapshotManager';

export interface HypothesisRationale {
  hypothesis: string;
  mechanism: string;
  expectedObservableEffect: string;
  failureMechanism: string;
  dataRequired: string[];
  knownLimitations: string[];
  predeclaredParameters: Record<string, unknown>;
}

export interface ResearchHypothesis {
  hypothesisId: string;
  hypothesisFamilyId: string;
  title: string;
  description: string;
  economicMechanism: string;
  candidateType: 'FILTER' | 'CONFIRMATION' | 'SCORER' | 'CONTEXT' | 'RISK_CONTROL' | 'NEW_STRATEGY';
  parentStrategyIds: string[];
  engineIds: string[];
  universeId: string;
  requiredData: DataRequirement[];
  allowedParameters: Record<string, unknown>;
  predeclaredWFOId: string;
  predeclaredStatisticalMethodId: string;
  predeclaredAt: string;
  configurationHash: string;
  status: 'PREDECLARED' | 'LOCKED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'REJECTED';
  oosLocked: boolean;
  rationale: HypothesisRationale;
}

export class ResearchHypothesisRegistry {
  private static instance: ResearchHypothesisRegistry;
  private hypotheses: Map<string, ResearchHypothesis> = new Map();

  private constructor() {}

  public static getInstance(): ResearchHypothesisRegistry {
    if (!ResearchHypothesisRegistry.instance) {
      ResearchHypothesisRegistry.instance = new ResearchHypothesisRegistry();
    }
    return ResearchHypothesisRegistry.instance;
  }

  public register(hypothesis: ResearchHypothesis): void {
    if (this.hypotheses.has(hypothesis.hypothesisId)) {
      throw new Error(`STOP_THE_LINE: Duplicate hypothesisId detected: ${hypothesis.hypothesisId}`);
    }
    if (!hypothesis.hypothesisFamilyId) {
      throw new Error(`STOP_THE_LINE: Missing hypothesisFamilyId for ${hypothesis.hypothesisId}`);
    }
    if (!hypothesis.requiredData || hypothesis.requiredData.length === 0) {
      throw new Error(`STOP_THE_LINE: Hypothesis ${hypothesis.hypothesisId} must explicitly declare requiredData`);
    }
    if (!hypothesis.rationale || !hypothesis.rationale.mechanism) {
      throw new Error(`STOP_THE_LINE: Hypothesis ${hypothesis.hypothesisId} must declare machine-readable rationale`);
    }

    // Verify configuration hash
    const configContent = JSON.stringify({
      id: hypothesis.hypothesisId,
      family: hypothesis.hypothesisFamilyId,
      strategies: hypothesis.parentStrategyIds,
      params: hypothesis.allowedParameters
    });
    const calculatedHash = crypto.createHash('sha256').update(configContent).digest('hex');
    if (hypothesis.configurationHash && hypothesis.configurationHash !== calculatedHash) {
      throw new Error(`STOP_THE_LINE: Configuration hash mismatch for ${hypothesis.hypothesisId}`);
    }
    hypothesis.configurationHash = calculatedHash;

    this.hypotheses.set(hypothesis.hypothesisId, Object.freeze({ ...hypothesis }));
  }

  public get(hypothesisId: string): ResearchHypothesis | undefined {
    return this.hypotheses.get(hypothesisId);
  }

  public getAll(): ResearchHypothesis[] {
    return Array.from(this.hypotheses.values());
  }

  public lockOOS(hypothesisId: string): void {
    const h = this.hypotheses.get(hypothesisId);
    if (!h) {
      throw new Error(`Hypothesis not found: ${hypothesisId}`);
    }
    const updated = { ...h, status: 'LOCKED' as const, oosLocked: true };
    this.hypotheses.set(hypothesisId, Object.freeze(updated));
  }

  public update(hypothesisId: string, updates: Partial<ResearchHypothesis>): void {
    const h = this.hypotheses.get(hypothesisId);
    if (!h) {
      throw new Error(`Hypothesis not found: ${hypothesisId}`);
    }
    if (h.oosLocked) {
      throw new Error(`STOP_THE_LINE: Cannot mutate hypothesis ${hypothesisId} after OOS lock`);
    }
    const updated = { ...h, ...updates };
    this.hypotheses.set(hypothesisId, Object.freeze(updated));
  }

  public clear(): void {
    this.hypotheses.clear();
  }
}
