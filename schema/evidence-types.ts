/**
 * Evidence schema — Phase 1 scope.
 *
 * Exactly 7 concepts. Do not add an 8th without a sign-off entry in
 * IMPLEMENTATION_PLAN.md (see AGENT_CONSTITUTION.md, Rule 3).
 *
 * Core rule encoded throughout: a field is either evidence-backed
 * (VERIFIED / CORROBORATED / DERIVED) or explicitly null
 * (MISSING / NOT_APPLICABLE). There is no in-between "probably fine" state.
 */

// ---------------------------------------------------------------------------
// 1. Evidence status — the only vocabulary allowed for "how sure are we"
// ---------------------------------------------------------------------------

export type EvidenceStatus =
  | "VERIFIED"        // primary source, citation-verified as EXACT or MINOR match
  | "CORROBORATED"     // 2+ independent sources agree within tolerance
  | "DERIVED"          // computed from other VERIFIED/CORROBORATED facts
  | "UNVERIFIED"       // extracted but not yet through citation verification
  | "CONFLICTED"        // sources disagree beyond tolerance, or verifier flagged MAJOR/FABRICATED
  | "MISSING"          // searched, nothing found — value MUST be null
  | "NOT_APPLICABLE";  // field genuinely doesn't apply to this company

// ---------------------------------------------------------------------------
// 2. Documents — canonical record for any source document
// ---------------------------------------------------------------------------

export type DocumentSourceType =
  | "NSE"
  | "BSE"
  | "COMPANY_IR"
  | "ANNUAL_REPORT"
  | "INVESTOR_PRESENTATION"
  | "CONCALL"
  | "CREDIT_RATING";
  // NOT included yet (parked): MCA, GOVERNMENT, INDUSTRY, NEWS —
  // add only when the phase that uses them is active.

export interface DocumentRecord {
  documentId: string;          // stable id, e.g. sha256-derived
  scripId: string;
  source: DocumentSourceType;
  documentType: string;        // e.g. "annual_report", "mda_section"
  period?: string;              // e.g. "FY2026"
  publishedAt?: string;         // ISO date, from the filing itself
  sourceUrl: string;
  sha256: string;
  retrievedAt: string;          // ISO datetime
  parserVersion: string;        // bump whenever extraction logic changes
  pageCount?: number;
  ocrUsed: boolean;
}

// ---------------------------------------------------------------------------
// 3. Evidence spans — a pointer into a document, not a copy of its content
// ---------------------------------------------------------------------------

export interface EvidenceSpan {
  evidenceId: string;
  documentId: string;
  page?: number;
  section?: string;
  quotedText: string;           // the exact span the extractor claims supports the value
  extractionMethod: "DETERMINISTIC" | "LLM" | "DERIVED";
}

// ---------------------------------------------------------------------------
// 4. Forensic assertions — the actual field values
// ---------------------------------------------------------------------------

export interface ForensicAssertion<T = unknown> {
  assertionId: string;
  scripId: string;
  field: string;                 // must be one of the Phase-1 fixed field list
  value: T | null;
  unit?: string;
  period?: string;
  status: EvidenceStatus;
  evidenceIds: string[];         // empty ONLY if status is MISSING or NOT_APPLICABLE
  confidence: number | null;     // null if status is MISSING; see confidence caps below
  sourceCount: number;
  extractionMethod: "DETERMINISTIC" | "LLM" | "DERIVED";
  methodologyVersion: string;    // ties back to the extractor version that produced this
  createdAt: string;
}

/**
 * Confidence caps — never let a number imply more certainty than the
 * evidence actually supports. Enforced in pipeline/quality-gate.cjs.
 */
export const CONFIDENCE_CAPS: Record<string, number> = {
  LLM_SINGLE_SOURCE: 0.70,
  PRIMARY_PLUS_NARRATIVE: 0.85,
  PRIMARY_PLUS_INDEPENDENT_CORROBORATION: 0.95,
  // Never 1.00 for anything externally sourced.
};

// ---------------------------------------------------------------------------
// 5. Evidence inventory — discovery results, per scrip per source type
// ---------------------------------------------------------------------------

export type DiscoveryResult = "FOUND" | "CONFIRMED_ABSENT" | "SEARCH_FAILED" | "NOT_YET_CHECKED";

export interface EvidenceInventoryRow {
  scripId: string;
  sourceType: DocumentSourceType;
  result: DiscoveryResult;
  checkedAt: string | null;      // null only if result is NOT_YET_CHECKED
  documentId?: string;           // set if result is FOUND
  discoveryMethod: string;       // e.g. "bsescraper.get_corporate_ann_keywords"
}

// ---------------------------------------------------------------------------
// 6. Citation verification — graded, not binary
// ---------------------------------------------------------------------------

export type CitationMatchLabel =
  | "EXACT"
  | "MINOR_MISMATCH"
  | "MAJOR_MISMATCH"
  | "UNVERIFIABLE"
  | "FABRICATED";

export interface CitationVerification {
  evidenceId: string;
  label: CitationMatchLabel;
  similarityScore: number;       // 0-1, from string-similarity
  verifiedAt: string;
  verifierVersion: string;
}

// ---------------------------------------------------------------------------
// 7. Source registry — static authority weight per source type
// ---------------------------------------------------------------------------

export interface SourceRegistryEntry {
  sourceType: DocumentSourceType;
  authorityWeight: number;       // 0-1, used only for reconciliation tie-breaking
  requiresIndependentCorroboration: boolean;
}

export const SOURCE_REGISTRY: SourceRegistryEntry[] = [
  { sourceType: "NSE", authorityWeight: 0.98, requiresIndependentCorroboration: false },
  { sourceType: "BSE", authorityWeight: 0.98, requiresIndependentCorroboration: false },
  { sourceType: "ANNUAL_REPORT", authorityWeight: 0.90, requiresIndependentCorroboration: false },
  { sourceType: "CONCALL", authorityWeight: 0.85, requiresIndependentCorroboration: false },
  { sourceType: "INVESTOR_PRESENTATION", authorityWeight: 0.80, requiresIndependentCorroboration: true },
  { sourceType: "CREDIT_RATING", authorityWeight: 0.85, requiresIndependentCorroboration: false },
  { sourceType: "COMPANY_IR", authorityWeight: 0.75, requiresIndependentCorroboration: true },
];
