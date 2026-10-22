import { DataStatus, FreshnessStatus, TruthQuality } from './DataStatus.js';

export type EvidenceSourceType =
  | 'TRENDLYNE_SNAPSHOT'
  | 'UPSTOX_SNAPSHOT'
  | 'KITE_SNAPSHOT'
  | 'CANONICAL_FACT'
  | 'FERE_FILING'
  | 'XBRL_FILING'
  | 'SHAREHOLDING_FILING'
  | 'DUCKDB_OHLCV'
  | 'SECTOR_SERVICE'
  | 'EXCHANGE_FILING'
  | 'REGULATORY_SAST'
  | 'IDENTITY_REGISTRY'
  | 'TRANSCRIPT'
  | 'ANNUAL_REPORT'
  | 'INVESTOR_PRESENTATION'
  | 'PRESS_RELEASE'
  | 'DERIVED';

export interface EvidenceReference {
  evidenceId: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  timestamp?: string | null;
  pitStatus?: 'PIT_VERIFIED' | 'PIT_INFERRED' | 'PIT_UNKNOWN';
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

/** Maps persisted provider labels to their truthful evidence source type. */
export function evidenceSourceTypeForProvider(provider: string | null | undefined): EvidenceSourceType {
  const normalized = (provider || '').trim().toUpperCase();
  if (normalized.includes('UPSTOX')) return 'UPSTOX_SNAPSHOT';
  if (normalized.includes('KITE') || normalized.includes('ZERODHA')) return 'KITE_SNAPSHOT';
  if (normalized.includes('TRENDLYNE')) return 'TRENDLYNE_SNAPSHOT';
  return 'CANONICAL_FACT';
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
  truthQuality?: TruthQuality;
  securityId: string | null;
  metric: string;
  periodType: string | null;
  periodEnd: string | null;
  informationDate?: string | null;
  availableAt?: string | null;
  scope: string | null;
  provenance: EvidenceReference[];
  freshness: FreshnessStatus;
  missingReason: string | null;
}
