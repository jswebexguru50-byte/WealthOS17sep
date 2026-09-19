import { StopTheLineError } from './StopTheLineRegistry';

export interface ContaminationContext {
  configurationCreatedAt: string;
  configurationModifiedAt: string;
  runStartedAt: string;
  oosStartedAt: string;
  oosCompletedAt?: string;
  hasDataLineageToOOS?: boolean;
}

export interface ChronologyCheckInput {
  experimentId: string;
  configurationId: string;
  configurationCreatedAt: string;
  configurationModifiedAt: string;
  runStartedAt: string;
  oosStartedAt: string;
}

export interface ChronologyCheckResult {
  isContaminated: boolean;
  status: 'RESEARCH_CONTAMINATION' | 'CLEAN';
  temporalDeltaMs: number;
}

export class ResearchContaminationDetector {
  public checkChronology(input: ChronologyCheckInput): ChronologyCheckResult {
    const modifiedTime = new Date(input.configurationModifiedAt).getTime();
    const oosStartTime = new Date(input.oosStartedAt).getTime();
    const temporalDeltaMs = modifiedTime - oosStartTime;

    if (temporalDeltaMs > 0) {
      return {
        isContaminated: true,
        status: 'RESEARCH_CONTAMINATION',
        temporalDeltaMs
      };
    }

    return {
      isContaminated: false,
      status: 'CLEAN',
      temporalDeltaMs: 0
    };
  }

  public validateContaminationFree(context: ContaminationContext): void {
    const modifiedTime = new Date(context.configurationModifiedAt).getTime();
    const oosStartTime = new Date(context.oosStartedAt).getTime();

    // Configuration cannot be modified after OOS starts
    if (modifiedTime > oosStartTime) {
      throw new StopTheLineError(
        'RESEARCH_CONTAMINATION',
        'Configuration was modified after OOS started'
      );
    }

    // Explicit flag set by data lineage scanners detecting OOS data flowing into configs
    if (context.hasDataLineageToOOS) {
      throw new StopTheLineError(
        'RESEARCH_CONTAMINATION',
        'Data lineage detected OOS results feeding into parameter generator or configuration'
      );
    }
  }
}
