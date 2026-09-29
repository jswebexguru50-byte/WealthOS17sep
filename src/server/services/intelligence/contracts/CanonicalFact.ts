/**
 * CanonicalFact.ts — Constitution Article C4 & C5
 *
 * Universal data contract for all quantitative and operational metrics.
 * Ensures consistent semantics across Revenue, PAT, EBITDA, OPM, ROCE, Debt, Receivables, etc.
 *
 * Point-In-Time (PIT) Semantics:
 * - publishedAt: official/public publication time (when source document was made public)
 * - availableAt: earliest time information was knowable to the market (PIT gate: availableAt <= asOf)
 * - ingestedAt: when WealthOS obtained/recorded it (system provenance only, NOT PIT admissibility)
 */

import { EvidenceRef } from './EvidenceRef.js';
import { EvidenceReference } from './Provenance.js';

export type FactVerificationStatus =
  | 'INGESTED'           // Raw feed value received
  | 'NORMALIZED'         // Cleaned and aligned to schema
  | 'SOURCE_LINKED'      // Linked to source filing/disclosure
  | 'DERIVED_CONFIRMED'  // Derived with all inputs verified
  | 'VERIFIED'           // Validated against primary filing
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
  availableAt: string;                   // Earliest ISO date/timestamp information was knowable (PIT gate: availableAt <= asOf)
  ingestedAt?: string;                   // ISO timestamp when WealthOS recorded it (provenance)
  verificationStatus: FactVerificationStatus;
  derivationFormula?: string | null;     // Formula if derived metric
  inputFactIds?: string[];               // Dependencies if derived metric

  // Convenience aliases for backward compatibility across existing engines & views
  metricKey?: string;
  period?: string;
  evidence?: EvidenceReference[];
  source?: string;
}
