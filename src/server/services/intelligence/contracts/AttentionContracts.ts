/**
 * AttentionContracts.ts — Wave 0 Contract Freeze
 *
 * Attention Engine model for WealthOS V2.
 *
 * Key design decisions:
 * - AttentionItem uses reason chains (explainable), NOT numeric scores (C15)
 * - Signals are named and typed — never opaque
 * - Questions are generated from detected patterns, not generic LLM prompts
 * - QuestionIntent is deterministic; LLM provides wording only
 */

import { EvidenceReference } from './Provenance.js';

// ─── Attention Signals ────────────────────────────────────────────────────────

export type AttentionSignal =
  | 'MATERIAL_FUNDAMENTAL_CHANGE'
  | 'MANAGEMENT_COMMITMENT_MISSED'
  | 'MANAGEMENT_COMMITMENT_DUE'
  | 'NEW_CONTRADICTION'
  | 'THESIS_WEAKENED'
  | 'THESIS_STRENGTHENED'
  | 'VALUATION_EXTREME'
  | 'TECHNICAL_INFLECTION'
  | 'NEW_FERE_WARNING'
  | 'IMPORTANT_DATA_GAP';

export type AttentionMateriality = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * CORRECT usage:
 * {
 *   headline: "Management missed revenue commitment",
 *   reasonChain: [
 *     "Guided 15-18% revenue growth",
 *     "Actual: 9.3%",
 *     "Revenue is a PRIMARY business driver",
 *     "Thesis pillar 'Market share growth' is now challenged"
 *   ],
 *   materiality: 'HIGH'
 * }
 *
 * WRONG usage:
 * { attentionScore: 83.72 }   // FORBIDDEN by C15
 */
export interface AttentionItem {
  itemId: string;
  signal: AttentionSignal;

  headline: string;

  /** Transparent chain of reasoning behind priority — never a score */
  reasonChain: string[];

  materiality: AttentionMateriality;
  category: string;

  /** Evidence IDs supporting this attention signal */
  relatedEvidenceIds: string[];

  detectedAt: string;
}

export interface AttentionResult {
  securityId: string;
  symbol: string;
  items: AttentionItem[];         // sorted by materiality (HIGH first)
  highCount: number;
  evaluatedAt: string;
}

// ─── Question Engine ──────────────────────────────────────────────────────────

/**
 * Question generation is deterministic-first:
 *
 * Step 1: Pattern detection (deterministic code) → QuestionIntent
 * Step 2: LLM wording → final question text
 *
 * EXAMPLE:
 * Pattern: CFO/PAT divergence + receivable increase
 * Intent: INVESTIGATE_CASH_CONVERSION
 * Wording: "Why has cash conversion weakened despite PAT growth?
 *            How much is attributable to receivables?"
 */
export type QuestionIntent =
  | 'INVESTIGATE_CASH_CONVERSION'
  | 'INVESTIGATE_CAPEX_RETURNS'
  | 'INVESTIGATE_MANAGEMENT_COMMITMENT'
  | 'INVESTIGATE_MARGIN_SUSTAINABILITY'
  | 'INVESTIGATE_DEBT_TRAJECTORY'
  | 'INVESTIGATE_DEMAND_INDICATORS'
  | 'INVESTIGATE_VALUATION_PREMIUM'
  | 'INVESTIGATE_COMPETITOR_IMPACT'
  | 'INVESTIGATE_REGULATORY_EXPOSURE'
  | 'INVESTIGATE_WORKING_CAPITAL'
  | 'OTHER';

export interface InvestigationQuestion {
  questionId: string;

  intent: QuestionIntent;

  /** Generated from evidence patterns — not generic */
  question: string;

  /** Evidence that triggered this question */
  triggerEvidence: EvidenceReference[];

  /** Related driver IDs */
  relatedDriverIds?: string[];

  priority: AttentionMateriality;
  generatedAt: string;
}
