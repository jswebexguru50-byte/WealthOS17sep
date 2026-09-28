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
  // V2: ACHIEVED_LATE added — timing matters for management credibility assessment
  status: 'DELIVERED' | 'ACHIEVED' | 'ACHIEVED_LATE' | 'PARTIALLY_ACHIEVED' | 'PARTIAL' | 'MISSED' | 'PENDING' | 'NOT_YET_DUE' | 'NOT_VERIFIABLE';
  actualEvidence: EvidenceReference[];
}

export interface ManagementPayload {
  commitments: ManagementCommitment[];
  deliveredCount: number;
  pendingCount: number;
  missedCount: number;
  notVerifiableCount: number;
  dataAsOf: string | null;
  // V2 additions (optional — backward-compatible with V1 consumers)
  deliveryHistory?: {
    total: number;
    achieved: number;
    achievedLate: number;
    partiallyAchieved: number;
    missed: number;
    deferred: number;
    notYetDue: number;
    notVerifiable: number;
    descriptiveLabel: string;
  } | null;
  narrativeChanges?: Array<{
    fromDate: string;
    toDate: string;
    topic: string;
    fromStatement: string;
    toStatement: string;
    shift: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  }> | null;
}

