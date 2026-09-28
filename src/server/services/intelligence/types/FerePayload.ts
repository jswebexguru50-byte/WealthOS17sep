import { EvidenceReference } from '../contracts/Provenance.js';

export interface FereWarning {
  id: string;
  category: string;
  severity: 'INFO' | 'WATCH' | 'MATERIAL';
  title: string;
  observation: string;
  supportingFacts: EvidenceReference[];
  status: 'SUPPORTED' | 'PARTIAL' | 'DATA_INSUFFICIENT';
}

export interface FereFilingDocument {
  sourceUrl?: string;
  sha256?: string;
  filingDate?: string;
  filingType?: string;
  periodEnd?: string;
  scope?: string;
}

export interface AuditorObservation {
  period: string;
  auditorName?: string;
  opinion: string;
  hasQualification: boolean;
  evidence: EvidenceReference[];
}

export interface FerePayload {
  availableFilings: FereFilingDocument[];
  verifiedFactCount: number;
  warnings: FereWarning[];
  auditorObservations: AuditorObservation[];
  claimEvidenceDivergences: Array<{
    claimText: string;
    divergenceType: string;
    evidenceObservation: string;
    severity: 'INFO' | 'WATCH' | 'MATERIAL';
  }>;
  dataAsOf: string | null;
}
