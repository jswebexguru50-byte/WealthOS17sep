import { AnalysisModule } from './AnalysisModule.js';
import { DataStatus } from './DataStatus.js';

export interface AnalysisTelemetry {
  sessionId?: string;
  moduleId: AnalysisModule;
  executionTimeMs: number;
  dataStatus: DataStatus;
  evidenceCount: number;
  missingRequirementsCount: number;
  timestamp: string;
  success: boolean;
  errorMessage?: string;
}
