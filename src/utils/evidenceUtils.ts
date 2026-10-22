export type DataStatus =
  | 'VERIFIED'
  | 'PARTIAL'
  | 'STALE'
  | 'DATA_INSUFFICIENT'
  | 'SOURCE_UNAVAILABLE'
  | 'IDENTITY_REVIEW'
  | 'BLOCKED';

export interface Provenance {
  sourceSystem: string;
  sourceUrl?: string;
  sourceDocumentId?: string;
  sourceHash?: string;
  observedAt: string | null;
  fetchedAt: string;
  asOfDate: string | null;
  methodologyVersion?: string;
}

export interface EvidenceField<T> {
  value: T | null;
  status: DataStatus;
  provenance: Provenance[];
  missingReason?: string;
}

export function requireEvidence<T>(
  field: EvidenceField<T>,
  requiredFor: string,
): T {
  if (field.status !== 'VERIFIED' || field.value === null) {
    throw new Error(`DECISION_BLOCKED:${requiredFor}:${field.status}`);
  }
  return field.value;
}
