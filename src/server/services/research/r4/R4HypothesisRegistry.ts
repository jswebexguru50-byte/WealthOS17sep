import * as crypto from 'crypto';

export type CandidateType = 'FILTER' | 'CONFIRMATION' | 'SCORER' | 'CONTEXT' | 'RISK_CONTROL' | 'NEW_STRATEGY';
export type HypothesisStatus = 'PREDECLARED' | 'RUNNING' | 'SUPPORTED' | 'UNSUPPORTED' | 'INCONCLUSIVE' | 'BLOCKED';

export interface R4Hypothesis {
  hypothesisId: string;
  hypothesisFamilyId: string;
  title: string;
  description: string;
  rationale: string;
  candidateType: CandidateType;
  existingStrategyIds: string[];
  marketUniverseId: string;
  timeframe: string[];
  parameters: Record<string, unknown>;
  parameterGrid: Record<string, unknown[]>;
  expectedMechanism: string;
  falsificationCriteria: string[];
  primaryMetric: string;
  secondaryMetrics: string[];
  predeclaredAt: string;
  configurationHash: string;
  dataSnapshotHash: string;
  status: HypothesisStatus;
}

export interface R4Experiment {
  experimentId: string;
  hypothesisId: string;
  configurationId: string;
  candidateFamily: string;
  candidateType: CandidateType;
  mode: 'MODE_A_FILTER' | 'MODE_B_CONFIRMATION' | 'MODE_C_SCORE';
  parameters: Record<string, unknown>;
  status: 'PREDECLARED' | 'EXECUTED' | 'AUDITED';
}

export class R4HypothesisRegistry {
  private hypotheses: Map<string, R4Hypothesis> = new Map();
  private experiments: Map<string, R4Experiment> = new Map();
  private isLocked: boolean = false;

  public registerHypothesis(h: R4Hypothesis): void {
    if (this.isLocked) {
      throw new Error(`STOP_THE_LINE: Cannot register hypothesis ${h.hypothesisId} after registry lock.`);
    }
    const hash = crypto.createHash('sha256').update(JSON.stringify(h.parameters) + JSON.stringify(h.parameterGrid)).digest('hex');
    h.configurationHash = hash;
    this.hypotheses.set(h.hypothesisId, h);
  }

  public registerExperiment(exp: R4Experiment): void {
    if (this.isLocked) {
      throw new Error(`STOP_THE_LINE: Cannot register experiment ${exp.experimentId} after registry lock.`);
    }
    this.experiments.set(exp.experimentId, exp);
  }

  public lockRegistry(): void {
    this.isLocked = true;
  }

  public getHypothesis(id: string): R4Hypothesis | undefined {
    return this.hypotheses.get(id);
  }

  public getAllHypotheses(): R4Hypothesis[] {
    return Array.from(this.hypotheses.values());
  }

  public getAllExperiments(): R4Experiment[] {
    return Array.from(this.experiments.values());
  }

  public getFamilyExperiments(familyId: string): R4Experiment[] {
    return Array.from(this.experiments.values()).filter(e => e.candidateFamily === familyId);
  }
}
