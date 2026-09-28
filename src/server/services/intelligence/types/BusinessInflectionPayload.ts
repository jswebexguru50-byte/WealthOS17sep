import { EvidenceReference } from '../contracts/Provenance.js';

export interface InflectionItem {
  id: string;
  type: 'POSITIVE_INFLECTION' | 'NEGATIVE_INFLECTION' | 'WATCH_ITEM';
  category: 'FUNDAMENTAL' | 'TECHNICAL' | 'MANAGEMENT' | 'MARKET';
  headline: string;
  detail: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  sourceModule: string;
  evidence: EvidenceReference[];
}

export interface BusinessInflectionPayload {
  whyInteresting: InflectionItem[]; // max 5 items
  whatNeedsAttention: InflectionItem[]; // max 5 items
  dataAsOf: string | null;
}
