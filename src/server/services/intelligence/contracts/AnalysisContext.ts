import { AnalysisModule } from './AnalysisModule.js';

export interface AnalysisContext {
  securityId: string;
  symbol: string;
  isin?: string;
  asOfDate?: string;
  scanRunId?: string;
  candidateId?: string;
  evidenceSnapshotId?: string;
  requestedModules?: AnalysisModule[];
  strictPit?: boolean;
  evaluationTimestamp?: string;
}
