/**
 * ThesisContracts.ts — Wave 0 Contract Freeze
 *
 * Living Thesis model for WealthOS V2.
 *
 * Key design decisions:
 * - ThesisPillar explicitly separates facts from assumptions (C12, C13)
 * - Thesis history is never silently overwritten (previousThesisHash)
 * - ThesisChange captures what evidence caused the change
 * - No opaque thesis score (C15)
 */

import { EvidenceReference } from './Provenance.js';

// ─── Thesis Pillar ─────────────────────────────────────────────────────────────

export type ThesisPillarStatus =
  | 'SUPPORTED'            // multiple primary/verified facts
  | 'PARTIALLY_SUPPORTED'  // some evidence, not complete
  | 'CHALLENGED'           // contradicting evidence exists
  | 'BROKEN'               // core assumption disproved by evidence
  | 'UNKNOWN';             // insufficient evidence to assess

export interface ThesisPillar {
  pillarId: string;
  title: string;
  proposition: string;                // what this pillar claims

  status: ThesisPillarStatus;

  supportingEvidence: EvidenceReference[];
  contradictingEvidence: EvidenceReference[];

  /**
   * Things we believe but cannot directly verify from available data.
   * Example: "India premium jewellery penetration will continue growing."
   * Distinguishes hypothesis from fact (C12, C13).
   */
  assumptions: string[];

  /** Specific open questions that, if answered, would change pillar status */
  unansweredQuestions: string[];

  explanation: string;                // evidence-grounded narrative
}

// ─── Thesis Change ────────────────────────────────────────────────────────────

export type ThesisChangeType =
  | 'STRENGTHENED'
  | 'WEAKENED'
  | 'UNCHANGED'
  | 'NEW_QUESTION'
  | 'PILLAR_CHALLENGED'
  | 'PILLAR_BROKEN';

export interface ThesisChange {
  changeType: ThesisChangeType;
  affectedPillarId?: string;
  reason: string;
  asOfDate: string;
  evidence: EvidenceReference[];
}

// ─── Full Thesis ──────────────────────────────────────────────────────────────

export interface CompanyThesis {
  thesisId: string;
  securityId: string;
  asOfDate: string;

  summary: string;

  thesisPillars: ThesisPillar[];

  catalysts: Array<{
    title: string;
    explanation: string;
    evidence: EvidenceReference[];
  }>;

  risks: Array<{
    title: string;
    explanation: string;
    evidence: EvidenceReference[];
  }>;

  /**
   * Evidence that actively contradicts the thesis.
   * Required field — not optional.
   */
  disconfirmingEvidence: Array<{
    title: string;
    explanation: string;
    evidence: EvidenceReference[];
  }>;

  unresolvedQuestions: Array<{
    question: string;
    relevance: string;
  }>;

  thesisChanges: ThesisChange[];

  evidence: EvidenceReference[];

  /**
   * Hash of prior thesis state.
   * Used to detect meaningful vs trivial change.
   * Never silently overwrite without recording delta.
   */
  previousThesisHash?: string;
  createdAt: string;
  updatedAt: string;
}
