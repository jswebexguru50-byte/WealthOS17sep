import { DataStatus, FreshnessStatus } from './DataStatus.js';

export type EvidenceSourceType =
  | 'TRENDLYNE_SNAPSHOT'
  | 'CANONICAL_FACT'
  | 'FERE_FILING'
  | 'DUCKDB_OHLCV'
  | 'SECTOR_SERVICE'
  | 'EXCHANGE_FILING'
  | 'REGULATORY_SAST'
  | 'IDENTITY_REGISTRY';

export interface EvidenceReference {
  evidenceId: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  timestamp: string;
  field?: string;
  asOfDate?: string;
  confidence?: number;
  uri?: string;
  notes?: string;
  documentId?: string;
  filingId?: string;
  pageNumber?: number;
  tableId?: string;
}

export interface DataProvenance {
  source: string;
  snapshotId?: string;
  extractedAt: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'DERIVED';
  methodology?: string;
  evidenceRefs?: EvidenceReference[];
}

export interface FactEnvelope<T = any> {
  value: T | null;
  status: DataStatus;
  securityId: string | null;
  metric: string;
  periodType: string | null;
  periodEnd: string | null;
  scope: string | null;
  provenance: EvidenceReference[];
  freshness: FreshnessStatus;
  missingReason: string | null;
}
