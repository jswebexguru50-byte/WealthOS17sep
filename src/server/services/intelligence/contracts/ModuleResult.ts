import { AnalysisModule } from './AnalysisModule.js';
import { DataStatus } from './DataStatus.js';
import { EvidenceReference } from './Provenance.js';

export interface ModuleResult<T = any> {
  moduleId: AnalysisModule;
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'DATA_INSUFFICIENT' | 'NOT_APPLICABLE' | 'ERROR';
  dataStatus: DataStatus;
  result: T | null;
  evidenceRefs: EvidenceReference[];
  missingRequirements: string[];
  warnings: string[];
  evaluationTimestamp: string;
  dataAsOf: string | null;
  configVersion: string;
  engineVersion: string;
}
