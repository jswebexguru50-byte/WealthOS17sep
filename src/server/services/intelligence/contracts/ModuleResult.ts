import { AnalysisModule } from './AnalysisModule.js';
import { DataStatus } from './DataStatus.js';
import { EvidenceReference } from './Provenance.js';

export type ModuleStatus =
  | 'WORKING'
  | 'PARTIAL'
  | 'DATA_INSUFFICIENT'
  | 'SOURCE_UNAVAILABLE'
  | 'IDENTITY_REVIEW'
  | 'ERROR';

export interface ModuleResult<T = any> {
  moduleId: AnalysisModule;
  status: ModuleStatus | 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
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
