/**
 * CanonicalFact.ts — Constitution Article C4 & C5
 *
 * Universal data contract for all quantitative and operational metrics.
 * Ensures consistent semantics across Revenue, PAT, EBITDA, OPM, ROCE, Debt, Receivables, etc.
 */

import { EvidenceRef } from './EvidenceRef.js';

export type FactVerificationStatus =
  | 'VERIFIED'           // Validated against primary filing
  | 'DERIVED_CONFIRMED'  // Derived with all inputs verified
  | 'AUDITED'            // Independent statutory auditor verified
  | 'PROVISIONAL'        // Company release prior to full note audit
  | 'UNVERIFIED'         // Raw feed value not yet independently checked
  | 'CONFLICTED';        // Providers disagree on value

export interface CanonicalFact {
  factId: string;
  securityId: string;
  isin: string;
  metric: string;                        // Standardized metric key (e.g. 'REVENUE', 'PAT', 'ROCE')
  value: number | string | boolean | null;
  unit: string | null;                   // e.g. 'INR_CR', 'PERCENT', 'RATIO', 'DAYS'
  currency: string | null;               // e.g. 'INR', 'USD'
  scale: string | null;                  // e.g. 'CRORE', 'LAKH', 'MILLION', 'UNIT'
  periodType: 'ANNUAL' | 'QUARTERLY' | 'TTM' | 'POINT_IN_TIME';
  periodStart?: string | null;           // ISO date
  periodEnd: string | null;              // ISO date
  fiscalYear?: number | null;            // e.g. 2026
  fiscalQuarter?: number | null;         // 1, 2, 3, or 4
  consolidatedOrStandalone: 'CONSOLIDATED' | 'STANDALONE' | 'SEGMENT';
  sourceId: string;                      // Identifier of data feed or document
  evidenceRef?: EvidenceRef | null;
  publishedAt: string;                   // ISO date when officially published
  availableAt: string;                   // ISO timestamp when ingested (PIT gate)
  verificationStatus: FactVerificationStatus;
  derivationFormula?: string | null;     // Formula if derived metric
  inputFactIds?: string[];               // Dependencies if derived metric
}
