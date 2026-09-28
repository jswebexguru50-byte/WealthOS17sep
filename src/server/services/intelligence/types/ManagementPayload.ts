import { EvidenceReference } from '../contracts/Provenance.js';

export interface ManagementCommitment {
  id: string;
  category: string; // Revenue, Margins, Capex, Capacity, Utilisation, Debt, Working Capital, Orders, Product Launch, Geographic Expansion
  statementDate: string;
  sourceDocument: EvidenceReference;
  statement: string;
  targetMetric: string | null;
  targetValue: number | string | null;
  targetPeriod: string | null;
  actualValue: number | string | null;
  status: 'DELIVERED' | 'PARTIAL' | 'MISSED' | 'PENDING' | 'NOT_VERIFIABLE';
  actualEvidence: EvidenceReference[];
}

export interface ManagementPayload {
  commitments: ManagementCommitment[];
  deliveredCount: number;
  pendingCount: number;
  missedCount: number;
  notVerifiableCount: number;
  dataAsOf: string | null;
}
