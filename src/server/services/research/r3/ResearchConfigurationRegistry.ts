import * as crypto from 'crypto';

export interface ResearchConfiguration {
  configurationId: string;
  experimentId: string;
  hypothesisId: string;
  parameters: Record<string, unknown>;
  parameterSource: 'ESTABLISHED_METHOD' | 'TRAINING_ONLY_OPTIMIZATION';
  status: 'PREDECLARED' | 'LOCKED' | 'RUNNING' | 'COMPLETED';
  createdAt: string;
  configurationHash: string;
  oosLocked: boolean;
}

export class ResearchConfigurationRegistry {
  private static instance: ResearchConfigurationRegistry;
  private configurations: Map<string, ResearchConfiguration> = new Map();

  private constructor() {}

  public static getInstance(): ResearchConfigurationRegistry {
    if (!ResearchConfigurationRegistry.instance) {
      ResearchConfigurationRegistry.instance = new ResearchConfigurationRegistry();
    }
    return ResearchConfigurationRegistry.instance;
  }

  public register(config: ResearchConfiguration): void {
    if (this.configurations.has(config.configurationId)) {
      throw new Error(`STOP_THE_LINE: Duplicate configurationId detected: ${config.configurationId}`);
    }
    if (!config.experimentId) {
      throw new Error(`STOP_THE_LINE: Configuration ${config.configurationId} must link to experimentId`);
    }
    if (!config.parameterSource || config.parameterSource === ('OBSERVED_FROM_OOS' as any)) {
      throw new Error(`STOP_THE_LINE: Invalid parameterSource for ${config.configurationId}. Cannot be OBSERVED_FROM_OOS`);
    }

    const cfgContent = JSON.stringify({
      id: config.configurationId,
      expId: config.experimentId,
      params: config.parameters,
      src: config.parameterSource
    });
    config.configurationHash = crypto.createHash('sha256').update(cfgContent).digest('hex');

    this.configurations.set(config.configurationId, Object.freeze({ ...config }));
  }

  public get(configurationId: string): ResearchConfiguration | undefined {
    return this.configurations.get(configurationId);
  }

  public getAll(): ResearchConfiguration[] {
    return Array.from(this.configurations.values());
  }

  public lockOOS(configurationId: string): void {
    const cfg = this.configurations.get(configurationId);
    if (!cfg) {
      throw new Error(`Configuration not found: ${configurationId}`);
    }
    const updated = { ...cfg, status: 'LOCKED' as const, oosLocked: true };
    this.configurations.set(configurationId, Object.freeze(updated));
  }

  public clear(): void {
    this.configurations.clear();
  }
}
