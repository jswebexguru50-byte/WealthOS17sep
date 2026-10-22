import crypto from 'crypto';

export interface ResearchExperiment {
  experimentId: string;
  hypothesisFamilyId: string;
  configurationId: string;
  configurationName: string;
  strategyIds: string[];
  engineIds: string[];
  universeId: string;
  dataSnapshotHash: string;
  configurationHash: string;
  predeclaredAt: string;
  status: 'PREDECLARED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
  oosLocked: boolean;
}

export type ExperimentDefinition = ResearchExperiment;

export interface ContaminationCheckResult {
  isContaminated: boolean;
  violation?: string;
  configurationCreatedAt: string;
  oosStartedAt: string;
}

export class ExperimentRegistry {
  private static instance: ExperimentRegistry;
  private experiments: Map<string, ResearchExperiment> = new Map();

  public static getInstance(): ExperimentRegistry {
    if (!ExperimentRegistry.instance) {
      ExperimentRegistry.instance = new ExperimentRegistry();
      ExperimentRegistry.instance.initializePredeclaredConfigurations();
    }
    return ExperimentRegistry.instance;
  }

  private initializePredeclaredConfigurations() {
    const predeclared = [
      { id: 'C01', name: 'Technical Baseline', family: 'FAMILY_TECHNICAL_STRATEGIES', engines: ['TECHNICAL'] },
      { id: 'C02', name: 'Technical + Momentum', family: 'FAMILY_COMPOSABLE_CONFIGS', engines: ['TECHNICAL', 'MOMENTUM'] },
      { id: 'C03', name: 'Technical + Sector Rotation', family: 'FAMILY_COMPOSABLE_CONFIGS', engines: ['TECHNICAL', 'SECTOR'] },
      { id: 'C04', name: 'Technical + Smart Money', family: 'FAMILY_COMPOSABLE_CONFIGS', engines: ['TECHNICAL', 'SMART_MONEY'] },
      { id: 'C05', name: 'Technical + Fundamental Alpha', family: 'FAMILY_COMPOSABLE_CONFIGS', engines: ['TECHNICAL', 'FUNDAMENTAL'] },
      { id: 'C06', name: 'Technical + Valuation & MoS', family: 'FAMILY_COMPOSABLE_CONFIGS', engines: ['TECHNICAL', 'VALUATION'] },
      { id: 'C07', name: 'Technical + FERE Forensic', family: 'FAMILY_COMPOSABLE_CONFIGS', engines: ['TECHNICAL', 'FERE'] },
      { id: 'C08', name: 'Fundamental + Valuation + FERE', family: 'FAMILY_COMPOSABLE_CONFIGS', engines: ['FUNDAMENTAL', 'VALUATION', 'FERE'] },
      { id: 'C09', name: 'Momentum + Sector + Smart Money', family: 'FAMILY_COMPOSABLE_CONFIGS', engines: ['MOMENTUM', 'SECTOR', 'SMART_MONEY'] },
      { id: 'C10', name: 'Quality + Fundamental + Valuation + Momentum + Smart Money', family: 'FAMILY_COMPOSABLE_CONFIGS', engines: ['FERE', 'QGLP', 'FUNDAMENTAL', 'VALUATION', 'MOMENTUM', 'SMART_MONEY'] },
      { id: 'C11', name: 'C10 + Pure Technical Integration', family: 'FAMILY_COMPOSABLE_CONFIGS', engines: ['FERE', 'QGLP', 'FUNDAMENTAL', 'VALUATION', 'MOMENTUM', 'SMART_MONEY', 'TECHNICAL'] },
      { id: 'C12', name: 'C11 + Multi-Dimensional Portfolio Risk Overlay', family: 'FAMILY_COMPOSABLE_CONFIGS', engines: ['FERE', 'QGLP', 'FUNDAMENTAL', 'VALUATION', 'MOMENTUM', 'SMART_MONEY', 'TECHNICAL', 'PORTFOLIO_RISK'] }
    ];

    for (const c of predeclared) {
      const configHash = crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');
      this.experiments.set(c.id, {
        experimentId: `EXP_${c.id}_${configHash.slice(0, 8)}`,
        hypothesisFamilyId: c.family,
        configurationId: c.id,
        configurationName: c.name,
        strategyIds: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'],
        engineIds: c.engines,
        universeId: 'NIFTY500_PIT_2020_2026',
        dataSnapshotHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        configurationHash: configHash,
        predeclaredAt: '2026-09-17T18:00:00.000Z',
        status: 'PREDECLARED',
        oosLocked: true
      });
    }
  }

  public getExperiment(configurationId: string): ResearchExperiment | undefined {
    return this.experiments.get(configurationId);
  }

  public predeclareExperiment(
    configurationId: string,
    hypothesisFamilyId: string,
    predeclaredAt: string,
    configurationHash: string
  ): void {
    this.experiments.set(configurationId, {
      experimentId: `EXP_${configurationId}_${configurationHash.slice(0, 8)}`,
      hypothesisFamilyId,
      configurationId,
      configurationName: configurationId,
      strategyIds: ['S1', 'S2'],
      engineIds: ['TECHNICAL'],
      universeId: 'NIFTY500_PIT_2020_2026',
      dataSnapshotHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      configurationHash,
      predeclaredAt,
      status: 'PREDECLARED',
      oosLocked: true
    });
  }

  public getAllExperiments(): ResearchExperiment[] {
    return Array.from(this.experiments.values());
  }

  public assertNoContamination(
    configurationCreatedAt: string,
    oosStartedAt: string
  ): ContaminationCheckResult {
    const configTime = new Date(configurationCreatedAt).getTime();
    const oosTime = new Date(oosStartedAt).getTime();

    if (configTime >= oosTime) {
      return {
        isContaminated: true,
        violation: `CONTAMINATION_VIOLATION: Configuration created at ${configurationCreatedAt} after OOS window started at ${oosStartedAt}`,
        configurationCreatedAt,
        oosStartedAt
      };
    }

    return {
      isContaminated: false,
      configurationCreatedAt,
      oosStartedAt
    };
  }
}
