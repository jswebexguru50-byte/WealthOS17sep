/**
 * IntelligenceFact.ts — Wave 0 Contract Freeze
 *
 * Canonical fact interfaces shared across all WealthOS V2 intelligence engines.
 * Agents MUST import from here rather than defining local equivalents.
 *
 * Constitution invariants encoded here:
 * - C2: Parsed does not mean verified (TruthQuality is explicit)
 * - C5: Level and direction are different (no conflation here)
 * - C7: Every conclusion needs evidence lineage (evidence: EvidenceReference[])
 * - C8: PIT correctness (informationDate, availableAt, asOfDate)
 */

import { EvidenceReference } from './Provenance.js';
import { TruthQuality } from './DataStatus.js';

// ─── Primary Fact ────────────────────────────────────────────────────────────

export interface IntelligenceFact {
  securityId: string;
  metric: string;

  value: number | string | boolean | null;
  unit: string | null;

  periodType: string | null;               // 'ANNUAL' | 'QUARTERLY' | 'TTM' | 'POINT_IN_TIME'
  periodStart?: string | null;             // ISO date
  periodEnd: string | null;                // ISO date

  informationDate: string | null;          // when the info was publicly known
  availableAt: string | null;              // when it entered our system

  scope: 'CONSOLIDATED' | 'STANDALONE' | 'SEGMENT' | null;

  truthQuality: TruthQuality;
  evidence: EvidenceReference[];

  sourcePriority?: number;                 // lower = higher priority source
}

// ─── Derived Fact ─────────────────────────────────────────────────────────────

export type DerivationType =
  | 'GROWTH'              // period-over-period change
  | 'MARGIN'              // ratio expressed as percentage
  | 'ACCELERATION'        // requires ≥2 comparable growth intervals (C6)
  | 'CHANGE'              // general delta
  | 'RATIO'              // arbitrary ratio
  | 'PERCENTILE'          // percentile within distribution
  | 'TREND'              // multi-period directional assessment
  | 'COMMITMENT_OUTCOME'  // management commitment result
  | 'OTHER';

export interface DerivedFact {
  metric: string;

  value: number | string | null;

  derivationType: DerivationType;

  /**
   * The primary source facts used in this derivation.
   * Must have ≥2 facts for GROWTH/ACCELERATION derivations.
   */
  inputs: IntelligenceFact[];

  formula?: string;                        // e.g. "(revenue_t - revenue_t1) / revenue_t1"

  truthQuality: 'DERIVED_VERIFIED' | 'CONFLICTED';

  evidence: EvidenceReference[];
}

// ─── Intelligence Observation ─────────────────────────────────────────────────

export type ObservationCategory =
  | 'BUSINESS'
  | 'FUNDAMENTAL'
  | 'MANAGEMENT'
  | 'VALUATION'
  | 'TECHNICAL'
  | 'MARKET'
  | 'RISK'
  | 'CATALYST';

export type ObservationDirection =
  | 'POSITIVE'
  | 'NEGATIVE'
  | 'MIXED'
  | 'NEUTRAL'
  | 'UNKNOWN';

export type ObservationMateriality = 'HIGH' | 'MEDIUM' | 'LOW';

export interface IntelligenceObservation {
  id: string;

  category: ObservationCategory;
  direction: ObservationDirection;

  headline: string;
  explanation: string;

  materiality: ObservationMateriality;

  evidence: EvidenceReference[];

  affectedDrivers?: string[];              // driverIds this observation relates to

  firstObservedAt?: string;               // ISO timestamp
  latestObservedAt?: string;              // ISO timestamp
}
