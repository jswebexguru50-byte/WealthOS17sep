import * as crypto from 'crypto';

export type AblationType =
  | 'BASELINE'
  | 'BASELINE_PLUS_A'
  | 'BASELINE_PLUS_B'
  | 'BASELINE_PLUS_C'
  | 'BASELINE_PLUS_AB'
  | 'BASELINE_PLUS_AC'
  | 'BASELINE_PLUS_BC'
  | 'BASELINE_PLUS_ABC';

export interface ResearchExperiment {
  experimentId: string;
  hypothesisId: string;
  parentBaselineId: string;
  ablationType: AblationType;
  configurationIds: string[];
  status: 'PREDECLARED' | 'LOCKED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  predeclaredAt: string;
  oosLocked: boolean;
  experimentHash: string;
}

export class ResearchExperimentRegistry {
  private static instance: ResearchExperimentRegistry;
  private experiments: Map<string, ResearchExperiment> = new Map();

  private constructor() {}

  public static getInstance(): ResearchExperimentRegistry {
    if (!ResearchExperimentRegistry.instance) {
      ResearchExperimentRegistry.instance = new ResearchExperimentRegistry();
    }
    return ResearchExperimentRegistry.instance;
  }

  public register(experiment: ResearchExperiment): void {
    if (this.experiments.has(experiment.experimentId)) {
      throw new Error(`STOP_THE_LINE: Duplicate experimentId detected: ${experiment.experimentId}`);
    }
    if (!experiment.hypothesisId) {
      throw new Error(`STOP_THE_LINE: Experiment ${experiment.experimentId} must link to a valid hypothesisId`);
    }
    if (!experiment.parentBaselineId) {
      throw new Error(`STOP_THE_LINE: Experiment ${experiment.experimentId} must declare parentBaselineId`);
    }

    const expContent = JSON.stringify({
      id: experiment.experimentId,
      hypothesisId: experiment.hypothesisId,
      ablation: experiment.ablationType,
      baseline: experiment.parentBaselineId
    });
    experiment.experimentHash = crypto.createHash('sha256').update(expContent).digest('hex');

    this.experiments.set(experiment.experimentId, Object.freeze({ ...experiment }));
  }

  public get(experimentId: string): ResearchExperiment | undefined {
    return this.experiments.get(experimentId);
  }

  public getAll(): ResearchExperiment[] {
    return Array.from(this.experiments.values());
  }

  public lockOOS(experimentId: string): void {
    const exp = this.experiments.get(experimentId);
    if (!exp) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }
    const updated = { ...exp, status: 'LOCKED' as const, oosLocked: true };
    this.experiments.set(experimentId, Object.freeze(updated));
  }

  public clear(): void {
    this.experiments.clear();
  }
}
