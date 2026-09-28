/**
 * ContradictionContracts.ts — Wave 0 Contract Freeze
 *
 * Contradiction model for WealthOS V2.
 *
 * Key design decisions:
 * - 6 high-value patterns ONLY (not 10+ noisy ones)
 * - Contradiction lifecycle: OPEN → EXPLAINED → RESOLVED → NO_LONGER_APPLICABLE
 * - No automatic misconduct inference — surface inconsistency for investigation
 * - Contradictions are never fabricated for test coverage
 */

import { EvidenceReference } from './Provenance.js';

// ─── 6 Canonical Contradiction Patterns ──────────────────────────────────────

/**
 * Start with these 6. Add more only based on real observed companies.
 */
export type ContradictionPatternId =
  | 'GUIDANCE_VS_ACTUAL'        // management guidance vs actual outcome
  | 'PAT_VS_CFO'               // PAT improving, CFO declining
  | 'GROWTH_VS_WORKING_CAPITAL' // revenue growth + receivable days expansion
  | 'DELEVERAGING_CLAIM_VS_DEBT' // says deleveraging, net debt rising
  | 'CAPACITY_VS_UTILISATION'   // capex/capacity expansion + falling utilisation
  | 'DEMAND_NARRATIVE_VS_KPI';  // demand claim + declining order book or volumes

export type ContradictionSeverity = 'MATERIAL' | 'WATCH' | 'MINOR';

/**
 * Lifecycle of a contradiction — investment history.
 *
 * OPEN: detected and unresolved
 * EXPLAINED: management has given context (e.g. "working capital timing"); not yet confirmed
 * RESOLVED: subsequent evidence shows contradiction no longer exists
 * NO_LONGER_APPLICABLE: metric no longer relevant (e.g. company restructured)
 */
export type ContradictionStatus =
  | 'OPEN'
  | 'EXPLAINED'
  | 'RESOLVED'
  | 'NO_LONGER_APPLICABLE';

// ─── Contradiction Record ─────────────────────────────────────────────────────

export interface Contradiction {
  contradictionId: string;
  patternId: ContradictionPatternId;

  /** Plain-language description of each side */
  observationA: string;
  observationB: string;

  severity: ContradictionSeverity;
  status: ContradictionStatus;

  explanation: string;

  /**
   * Multiple possible interpretations — not auto-selected.
   * User investigates; WealthOS surfaces.
   */
  possibleInterpretations: string[];

  evidence: EvidenceReference[];

  firstDetectedAt: string;   // ISO timestamp
  lastObservedAt: string;    // ISO timestamp

  /** If status = RESOLVED or EXPLAINED */
  resolvedAt?: string;
  resolutionNote?: string;
}

// ─── Engine Output ────────────────────────────────────────────────────────────

export interface ContradictionResult {
  securityId: string;
  symbol: string;
  contradictions: Contradiction[];
  openCount: number;
  materialCount: number;
  evaluatedAt: string;
  patternsChecked: ContradictionPatternId[];
}
