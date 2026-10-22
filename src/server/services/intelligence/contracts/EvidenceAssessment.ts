import { EvidenceReference } from './Provenance.js';
import { DataStatus } from './DataStatus.js';

export interface ChecklistEvidenceItem {
  id: string;
  question: string;
  answerStatus: 'PASS' | 'FAIL' | 'PARTIAL' | 'DATA_INSUFFICIENT' | 'NOT_APPLICABLE';
  evidenceRefs: EvidenceReference[];
  quantitativeEvidence?: Record<string, any> | null;
  qualitativeEvidence?: string | null;
  confidence: number | null;
  pitStatus: 'VERIFIED' | 'NOT_VERIFIABLE' | 'UNKNOWN';
  missingReason: string | null;
}

export interface EvidenceAssessment {
  category: string;
  score?: number | null;
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'DATA_INSUFFICIENT' | 'NOT_APPLICABLE';
  dataStatus: DataStatus;
  items: ChecklistEvidenceItem[];
  missingEvidenceSummary: string[];
}
