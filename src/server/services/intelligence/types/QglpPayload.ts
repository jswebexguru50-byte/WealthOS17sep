import { EvidenceReference } from '../contracts/Provenance.js';

export type QglpEvidenceStatus =
  | 'SUPPORTED'
  | 'PARTIAL'
  | 'NO_RED_FLAG_DETECTED'
  | 'WARNING'
  | 'DATA_INSUFFICIENT'
  | 'NOT_APPLICABLE';

export interface QglpEvidenceAssessment {
  name: string;
  status: QglpEvidenceStatus;
  observation: string | null;
  evidence: EvidenceReference[];
}

export interface QglpPillar {
  pillarName: 'Quality of Business' | 'Quality of Management' | 'Growth' | 'Longevity' | 'Price' | 'Risk';
  items: QglpEvidenceAssessment[];
  summaryCounts: {
    supported: number;
    partial: number;
    noRedFlagDetected: number;
    warning: number;
    dataInsufficient: number;
    notApplicable: number;
  };
}

import { QglpFourDimensions } from './FundamentalExperienceTypes.js';

export interface QglpPayload {
  qualityOfBusiness: QglpPillar;
  qualityOfManagement: QglpPillar;
  growth: QglpPillar;
  longevity: QglpPillar;
  price: QglpPillar;
  risk: QglpPillar;
  dimensions?: QglpFourDimensions;
  pillars?: QglpPillar[];
  dataAsOf: string | null;
}
