/**
 * ManagementContracts.ts — Wave 0 Contract Freeze
 *
 * Management Walk-the-Talk commitment model.
 *
 * Key design decisions vs V1:
 * - ACHIEVED_LATE added (timing matters for management credibility)
 * - CommitmentMetricMapping layer: language → canonical metric (prevents ad-hoc string logic)
 * - Semantic evaluators per CommitmentType (no universal ≥50% rule)
 * - Longitudinal credibility is counts/narrative, NOT a score
 */

import { EvidenceReference } from './Provenance.js';

// ─── Commitment Taxonomy ──────────────────────────────────────────────────────

export type CommitmentType =
  | 'NUMERIC_TARGET'    // "We expect revenue of ₹100cr"
  | 'RANGE'            // "EBITDA margins of 17–19%"
  | 'DIRECTIONAL'      // "We expect margins to improve"
  | 'TIMELINE'         // "Plant commissioned by Q3 FY26"
  | 'PROJECT'          // "Capacity expansion to 200kt"
  | 'CAPITAL_ALLOCATION' // "Capex of ₹500cr over 2 years"
  | 'OTHER';

/**
 * ACHIEVED_LATE: target met but after the committed deadline.
 * This distinction matters enormously for credibility assessment.
 */
export type CommitmentStatus =
  | 'NOT_YET_DUE'
  | 'ACHIEVED'
  | 'ACHIEVED_LATE'       // ← NEW: met target but missed deadline
  | 'PARTIALLY_ACHIEVED'
  | 'MISSED'
  | 'DEFERRED'            // management explicitly pushed the deadline
  | 'WITHDRAWN'           // commitment cancelled
  | 'SUPERSEDED'          // replaced by a newer commitment
  | 'NOT_VERIFIABLE';     // no canonical data available to assess

// ─── Metric Mapping Layer (critical — resolves language to canonical metric) ──

/**
 * Maps management language to a canonical metric and comparison semantics.
 *
 * EXAMPLES:
 * "mid-teens revenue growth" →
 *   { extractedMetric: 'revenue growth', canonicalMetric: 'revenue_growth_yoy',
 *     comparisonType: 'RANGE', targetMin: 13, targetMax: 19, confidence: 'MEDIUM' }
 *
 * "net debt free by FY27" →
 *   { extractedMetric: 'net debt', canonicalMetric: 'net_debt_cr',
 *     comparisonType: 'MAXIMUM', confidence: 'HIGH' }
 */
export interface CommitmentMetricMapping {
  extractedMetric: string;           // raw language from commitment
  canonicalMetric: string | null;    // metric key in verified_xbrl_fact or company_facts
  comparisonType:
    | 'GROWTH'                       // growth rate comparison
    | 'LEVEL'                        // absolute value comparison
    | 'RANGE'                        // value must fall within range
    | 'MAXIMUM'                      // value must be ≤ threshold (e.g. net debt)
    | 'MINIMUM'                      // value must be ≥ threshold (e.g. ROCE)
    | 'DATE'                         // timeline/completion date
    | 'DIRECTIONAL';                 // any improvement from baseline
  targetMin?: number | null;
  targetMax?: number | null;
  targetDate?: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ─── Full Commitment Record ───────────────────────────────────────────────────

export interface ManagementCommitment {
  commitmentId: string;
  securityId: string;

  statementDate: string;             // ISO date of original statement
  speaker?: string;                  // e.g. "MD & CEO"
  source: EvidenceReference;         // transcript, press release, annual report

  originalStatement: string;        // verbatim quote

  category: string;                 // e.g. 'REVENUE', 'MARGIN', 'CAPEX', 'CAPACITY'

  /** Resolved metric mapping — null if extraction failed */
  metricMapping: CommitmentMetricMapping | null;

  commitmentType: CommitmentType;

  targetValue?: number | null;
  targetMin?: number | null;
  targetMax?: number | null;
  targetUnit?: string | null;

  /** ISO period end, e.g. '2026-03-31' */
  targetPeriod?: string | null;

  baselineValue?: number | null;     // value at time of commitment

  status: CommitmentStatus;
  actualValue?: number | null;

  actualEvidence: EvidenceReference[];

  evaluationExplanation?: string;   // human-readable evaluation rationale
}

// ─── Longitudinal Credibility History (NOT a score) ──────────────────────────

export interface CommitmentCategorySummary {
  category: string;
  achieved: number;
  achievedLate: number;
  partiallyAchieved: number;
  missed: number;
  deferred: number;
  notYetDue: number;
  notVerifiable: number;
  total: number;
}

/**
 * Descriptive label example:
 * "10 of 16 evaluable commitments achieved — 2 achieved late, 1 missed, 3 not verifiable"
 */
export interface ManagementDeliveryHistory {
  securityId: string;
  symbol: string;
  totalEvaluated: number;
  achieved: number;
  achievedLate: number;
  partiallyAchieved: number;
  missed: number;
  deferred: number;
  notYetDue: number;
  notVerifiable: number;
  /** Per-category breakdown e.g. REVENUE: 3/4 achieved */
  byCategory: CommitmentCategorySummary[];
  /** Example narrative: NOT a score */
  descriptiveLabel: string;
}

// ─── Narrative Change ─────────────────────────────────────────────────────────

export type NarrativeShift = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export interface ManagementNarrativeChange {
  fromDate: string;
  toDate: string;
  topic: string;
  fromStatement: string;
  toStatement: string;
  shift: NarrativeShift;
  significance: 'HIGH' | 'MEDIUM' | 'LOW';
}
