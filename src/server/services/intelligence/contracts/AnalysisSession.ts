import { AnalysisContext } from './AnalysisContext.js';
import { AnalysisModule } from './AnalysisModule.js';
import { ModuleResult } from './ModuleResult.js';

export interface AnalysisSession {
  sessionId: string;
  context: AnalysisContext;
  startedAt: string;
  completedAt?: string;
  moduleResults: Partial<Record<AnalysisModule, ModuleResult<any>>>;
  overallStatus: 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'DATA_INSUFFICIENT';
  errors?: string[];
}
