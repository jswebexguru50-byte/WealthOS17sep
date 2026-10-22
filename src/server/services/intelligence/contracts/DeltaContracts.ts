/**
 * DeltaContracts.ts — Wave 0 Contract Freeze
 *
 * Delta Intelligence model for WealthOS V2.
 *
 * Key design decisions:
 * - 4 comparison types: QOQ, YOY, LAST_ANALYSIS, THESIS_BASELINE
 * - Metric-aware materiality thresholds (not universal % rule)
 * - Delta is driven by business driver relevance + thesis relevance
 * - Snapshot persistence is state-change-driven, NOT request-driven
 */

import { EvidenceReference } from './Provenance.js';

// ─── Delta Types ──────────────────────────────────────────────────────────────

export type DeltaDirection = 'IMPROVED' | 'DETERIORATED' | 'CHANGED' | 'UNCHANGED';
export type DeltaMateriality = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Multiple comparison types answer different investment questions:
 * QOQ: "Did this quarter improve vs last?"
 * YOY: "How does this year compare to last year?"
 * LAST_ANALYSIS: "What changed since I last looked?"
 * THESIS_BASELINE: "Has the thesis foundation shifted?"
 */
export type DeltaComparisonType =
  | 'QOQ'
  | 'YOY'
  | 'LAST_ANALYSIS'
  | 'THESIS_BASELINE';

export type DeltaCategory =
  | 'FUNDAMENTALS'
  | 'OPERATING_KPIs'
  | 'MANAGEMENT'
  | 'VALUATION'
  | 'FERE'
  | 'TECHNICAL'
  | 'MARKET'
  | 'THESIS';

// ─── Materiality Rules (metric-aware) ─────────────────────────────────────────

/**
 * Controls what constitutes a material change for a given metric.
 *
 * EXAMPLES:
 * { metric: 'ebitda_margin_pct', basisPointThreshold: 100 }
 *   → <100bps change = LOW; 100-200 = MEDIUM; >200 = HIGH
 *
 * { metric: 'revenue_growth_yoy', percentageThreshold: 0.03 }
 *   → <3% change in growth rate = LOW materiality
 *
 * { metric: 'gnpa_pct', basisPointThreshold: 25 }
 *   → For banks: 25bps GNPA move is already meaningful
 */
export interface MaterialityRule {
  metric: string;
  percentageThreshold?: number;   // change in metric value as fraction
  absoluteThreshold?: number;     // absolute units
  basisPointThreshold?: number;   // for margin/rate metrics (1 bp = 0.01%)
  highMultiplier?: number;        // e.g. 2x the threshold = HIGH (default 2)
}

export const DEFAULT_MATERIALITY_RULES: MaterialityRule[] = [
  // Margins
  { metric: 'ebitda_margin_pct', basisPointThreshold: 100, highMultiplier: 2 },
  { metric: 'pat_margin_pct', basisPointThreshold: 50, highMultiplier: 2 },
  { metric: 'nim_pct', basisPointThreshold: 10, highMultiplier: 2.5 },
  // Growth metrics
  { metric: 'revenue_growth_yoy', percentageThreshold: 0.03 },
  { metric: 'loan_growth_yoy', percentageThreshold: 0.03 },
  { metric: 'aum_growth_yoy', percentageThreshold: 0.04 },
  // Balance sheet
  { metric: 'net_debt_cr', percentageThreshold: 0.10 },
  { metric: 'gnpa_pct', basisPointThreshold: 25, highMultiplier: 3 },
  { metric: 'nnpa_pct', basisPointThreshold: 15, highMultiplier: 3 },
  // Returns
  { metric: 'roce_pct', basisPointThreshold: 100 },
  { metric: 'roe_pct', basisPointThreshold: 100 },
];

// ─── Delta Record ─────────────────────────────────────────────────────────────

export interface IntelligenceDelta {
  deltaId: string;

  category: DeltaCategory;
  comparisonType: DeltaComparisonType;

  item: string;                         // e.g. 'EBITDA Margin'
  metric?: string;                      // canonical metric key if applicable

  previousState: string | number | null;
  currentState: string | number | null;

  direction: DeltaDirection;
  materiality: DeltaMateriality;

  explanation: string;                  // human-readable: why this is material

  /** Does this delta affect a PRIMARY business driver or thesis pillar? */
  affectsThesis: boolean;
  affectedDriverIds?: string[];

  evidence: EvidenceReference[];
}

// ─── Snapshot (persisted only on material state change) ───────────────────────

/**
 * Snapshot persistence rules:
 * 1. NOT saved on every GET request
 * 2. Saved when analytical state materially changes (compare contentHash)
 * 3. Saved on explicit analysis refresh
 * 4. GET endpoint reads latest snapshot (read-only)
 */
export interface CompanyIntelligenceSnapshot {
  securityId: string;
  symbol: string;
  asOfDate: string;

  /** Hash of key analytical metrics — used to detect meaningful state change */
  contentHash: string;

  fundamentalState: Record<string, any> | null;
  managementState: Record<string, any> | null;
  valuationState: Record<string, any> | null;
  businessDriverState: Record<string, any> | null;
  technicalState: Record<string, any> | null;

  createdAt: string;
}
