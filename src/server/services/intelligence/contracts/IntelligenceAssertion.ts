/**
 * IntelligenceAssertion.ts — Constitution Article C2 & C3
 *
 * Core unit of analytical discourse in WealthOS.
 * Enforces separation of observation from interpretation and strict support levels.
 */

import { EvidenceRef } from './EvidenceRef.js';

export type StatementKind =
  | 'FACT'              // Directly witnessed in primary source
  | 'DERIVED_FACT'      // Computed mathematically from verifiable facts
  | 'MANAGEMENT_CLAIM'  // Attributed claim by corporate management
  | 'INTERPRETATION'    // Analytical inference strictly based on facts
  | 'HYPOTHESIS'        // Candidate thesis awaiting future empirical validation
  | 'UNKNOWN';          // Explicitly acknowledged gap in evidence

export type AssertionSupport =
  | 'DIRECT'            // Backed directly by verbatim primary evidence
  | 'DERIVED'           // Calculated via documented mathematical formula
  | 'CORROBORATED'      // Confirmed across multiple independent sources
  | 'WEAK'              // Single unconfirmed or low-priority source
  | 'UNSUPPORTED';      // No evidence link (MUST NEVER ENTER SYNTHESIS)

export type AssertionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface IntelligenceAssertion {
  id: string;
  text: string;
  kind: StatementKind;
  evidenceRefs: EvidenceRef[];
  confidence: AssertionConfidence;
  support: AssertionSupport;
  limitations: string[];
  asOfDate: string;     // ISO timestamp or YYYY-MM-DD
  propositions?: string[];
  metricKey?: string;
  metricValue?: number | string | boolean | null;
}
