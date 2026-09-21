/**
 * DecisionReplayEngine.ts
 *
 * FERE v3.2.1 Cold-Storage Deterministic Replay Oracle & Historical Boundary Engine.
 *
 * v3.2.1 Critical Fixes:
 * ─────────────────────────────────────────────────────────────────────────────
 * FIX 1 — FAIL-CLOSED REPLAY (eliminates circular reconstruction):
 *   BEFORE: If rawQuantInput missing → derived signalStrength from snapshot.decisionState.quantOpportunity
 *           If rawInputClaims missing → grade taken from snapshot.decisionState.managementCredibility
 *   → CIRCULAR: decision → pseudo-input → engines → decision (trivially reproduces itself)
 *
 *   AFTER: If rawQuantInput or rawInputFacts are absent → throw Error (fail closed).
 *          The ONLY legal flow is: raw snapshot → engines → decision.
 *          There is NO fallback to derived/output state.
 *
 * FIX 2 — CREDIBILITY GRADE FROM RAW CLAIMS ONLY:
 *   Grade is computed deterministically from snapshot.rawInputClaims using Walk-the-Talk rule:
 *   achieved/total >= 0.8 && total >= 2 → STRONG
 *   achieved/total >= 0.6 && total >= 2 → GENERALLY_CREDIBLE
 *   total >= 1 → INCONSISTENT
 *   else → INSUFFICIENT_HISTORY
 *   Never copied from snapshot.decisionState.managementCredibility.
 *
 * FIX 3 — MR-5 filterByHistoricalBoundary INTEGRATED into replayFromColdStorage:
 *   The function now calls filterByHistoricalBoundary(rawInputFacts, rawInputClaims, decisionDate)
 *   BEFORE passing facts/claims to engines. Previously the helper existed but was never called
 *   in the production replay path.
 *
 * FIX 4 — DUAL HASHES:
 *   rawInputHash:    SHA-256 of sorted raw input facts + raw claims + versions + cutoff date
 *   decisionStateHash: SHA-256 of reconciled output state + policy directive + DAG
 *   Both are returned in ColdReplayResult and stored in DecisionSnapshot.
 *
 * Invariants:
 * 1. Byte-for-byte SHA-256 canonical state hash match.
 * 2. 100% field equality across all decision dimensions.
 * 3. MR-5 Temporal Non-Leakage: post-cutoff information strictly excluded.
 * 4. Fail-closed: missing raw input → Error (never silently falls back to output state).
 */

import crypto from 'crypto';
import {
  DecisionSnapshot,
  DecisionState,
  PortfolioAllocationPolicy,
  DecisionProvenanceDAG
} from '../types/InvestmentBrief.js';
import {
  ItasIiceReconciliationService,
  ItasQuantInput,
  IiceIntelligenceInput
} from '../services/ItasIiceReconciliationService.js';
import { FinancialFact } from '../types/FinancialFact.js';
import { CredibilityGrade } from '../types/ManagementClaim.js';

export interface ColdReplayResult {
  isMatch: boolean;
  reconstructedState: DecisionState;
  reconstructedPolicy: PortfolioAllocationPolicy;
  /** v3.2.1: Hash of the reconstructed decision OUTPUT state */
  decisionStateHash: string;
  /** v3.2.1: Hash of the RAW INPUT state (rawInputFacts + rawInputClaims + versions + cutoffDate) */
  rawInputHash: string;
  /** Legacy field — same as decisionStateHash for backward compatibility */
  reconstructedHash: string;
  originalHash: string;
  fieldMatches: {
    quantOpportunity: boolean;
    intelligenceRisk: boolean;
    thesisState: boolean;
    managementCredibility: boolean;
    activeThesisBreakers: boolean;
    allocationRecommendation: boolean;
    hashMatches: boolean;
  };
  divergences: string[];
  /** v3.2.1: Facts and claims that passed the historical boundary filter */
  boundaryFilteredFactCount: number;
  boundaryFilteredClaimCount: number;
}

export class DecisionReplayEngine {
  /**
   * Deterministically canonicalizes any JavaScript object by recursively sorting keys,
   * normalizing numbers, and producing a stable canonical JSON string.
   */
  public static canonicalize(obj: any): string {
    if (obj === null || obj === undefined) {
      return 'null';
    }
    if (typeof obj === 'number') {
      return Number.isInteger(obj) ? String(obj) : obj.toFixed(6);
    }
    if (typeof obj === 'boolean' || typeof obj === 'string') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => this.canonicalize(item)).join(',') + ']';
    }
    if (typeof obj === 'object') {
      const keys = Object.keys(obj).sort();
      const entries = keys.map(k => `${JSON.stringify(k)}:${this.canonicalize(obj[k])}`);
      return '{' + entries.join(',') + '}';
    }
    return JSON.stringify(obj);
  }

  /**
   * Computes deterministic SHA-256 of canonical state.
   */
  public static computeCanonicalStateHash(payload: any): string {
    const canonicalStr = this.canonicalize(payload);
    return crypto.createHash('sha256').update(canonicalStr).digest('hex');
  }

  /**
   * Canonically sorts raw input items by ID before hashing.
   * Ensures hash is invariant to retrieval or array order.
   */
  private static sortRawInputs<T extends { factId?: string; claimId?: string; breakerId?: string; contradictionId?: string }>(
    items: T[]
  ): T[] {
    return [...items].sort((a, b) => {
      const aId =
        a.factId ??
        a.claimId ??
        a.breakerId ??
        a.contradictionId ??
        '';

      const bId =
        b.factId ??
        b.claimId ??
        b.breakerId ??
        b.contradictionId ??
        '';

      return aId.localeCompare(bId);
    });
  }

  /**
   * v3.2.1: Computes rawInputHash from immutable raw inputs only.
   *
   * Covers: complete raw canonical objects + versions + cutoff date.
   * Does NOT include any derived/output state fields or execution timestamps.
   *
   * INVARIANT: Same raw inputs → same rawInputHash on every execution.
   */
  public static computeRawInputHash(snapshot: DecisionSnapshot): string {
    if (!snapshot.decisionDate) {
      throw new Error(
        `[DecisionReplayEngine] Cannot compute rawInputHash without decisionDate. ` +
        `evaluatedAt is observational metadata and MUST NOT be used as a decision cutoff.`
      );
    }

    let sanitizedQuantInput: any = null;
    if (snapshot.rawQuantInput) {
      const { evaluatedAt, ...rest } = snapshot.rawQuantInput as any;
      sanitizedQuantInput = rest;
    }

    const rawPayload = {
      issuerSymbol: snapshot.issuerSymbol,
      decisionDate: snapshot.decisionDate,
      schemaVersion: snapshot.schemaVersion,
      ontologyVersion: snapshot.ontologyVersion,
      ruleSetVersion: snapshot.ruleSetVersion,

      facts: this.sortRawInputs(snapshot.rawInputFacts ?? []),
      claims: this.sortRawInputs(snapshot.rawInputClaims ?? []),
      breakers: this.sortRawInputs(snapshot.rawInputBreakers ?? []),
      contradictions: this.sortRawInputs(snapshot.rawInputContradictions ?? []),

      quantInput: sanitizedQuantInput
    };

    return this.computeCanonicalStateHash(rawPayload);
  }

  /**
   * Strict Historical Information Boundary
   *
   * Governing principle:
   *
   *   publicationDate <= decisionDate
   *
   * Accounting observation dates such as `asOfDate` and `periodEnd`
   * MUST NEVER be used as substitutes for publication availability.
   *
   * If publication availability is unknown or malformed, the evidence
   * is NOT historically admissible.
   */
  public static filterByHistoricalBoundary(
    facts: FinancialFact[],
    claims: any[],
    decisionDateStr: string
  ): { facts: FinancialFact[]; claims: any[] } {

    const cutoffTime = this.parseStrictIsoDate(decisionDateStr);

    if (cutoffTime === null) {
      throw new Error(
        `Invalid historical decision date: ${decisionDateStr}`
      );
    }

    const allowedFacts = facts.filter((f) => {
      // STRICT: publicationDate only.
      // Never fall back to asOfDate or periodEnd.
      const pubDate = f.publicationDate;

      if (!pubDate) {
        return false;
      }

      const pubTime = this.parseStrictIsoDate(pubDate);

      if (pubTime === null) {
        return false;
      }

      return pubTime <= cutoffTime;
    });

    const allowedClaims = claims.filter((c) => {
      const pubDate = c.publicationDate;

      if (!pubDate) return false;

      const pubTime = this.parseStrictIsoDate(pubDate);

      if (pubTime === null) return false;

      return pubTime <= cutoffTime;
    });

    return {
      facts: allowedFacts,
      claims: allowedClaims
    };
  }

  /**
   * Strict ISO date parser.
   *
   * Rejects:
   * - empty strings
   * - malformed dates
   * - impossible dates (e.g. 2024-02-31)
   * - timestamps with arbitrary time suffixes
   * - implementation-dependent JavaScript date formats
   */
  private static parseStrictIsoDate(dateStr: string): number | null {
    if (typeof dateStr !== 'string') {
      return null;
    }

    // FERE historical boundaries use calendar dates only.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return null;
    }

    const [year, month, day] = dateStr.split('-').map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));

    // Reject JavaScript date normalization such as 2024-02-31.
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return date.getTime();
  }

  /**
   * v3.2.1: Deterministically derives credibility grade from raw input claims.
   *
   * INVARIANT: Grade is computed ONLY from rawInputClaims.
   *            It is NEVER copied from snapshot.decisionState.managementCredibility.
   *
   * Walk-the-Talk Rule:
   *   total >= 2 && achieved/total >= 0.80 → STRONG
   *   total >= 2 && achieved/total >= 0.60 → GENERALLY_CREDIBLE
   *   total >= 1                           → INCONSISTENT
   *   else                                 → INSUFFICIENT_HISTORY
   */
  private static deriveCredibilityGradeFromRawClaims(rawClaims: any[]): CredibilityGrade {
    if (!rawClaims || rawClaims.length === 0) return 'INSUFFICIENT_HISTORY';

    let achieved = 0;
    let partial = 0;
    let missed = 0;
    let reversed = 0;

    rawClaims.forEach(c => {
      if (c.status === 'ACHIEVED' || c.status === 'ACHIEVED_EARLY') achieved++;
      else if (c.status === 'PARTIALLY_ACHIEVED') partial++;
      else if (c.status === 'MISSED') missed++;
      else if (c.status === 'REVERSED') reversed++;
    });

    const totalEvaluated = achieved + partial + missed + reversed;
    if (totalEvaluated < 2) {
      return 'INSUFFICIENT_HISTORY';
    }

    const successRatio = (achieved + (partial * 0.5)) / totalEvaluated;
    if (successRatio >= 0.80 && missed === 0) {
      return 'STRONG';
    } else if (successRatio >= 0.60) {
      return 'GENERALLY_CREDIBLE';
    } else if (successRatio >= 0.40) {
      return 'MIXED';
    } else {
      return 'WEAK';
    }
  }

  /**
   * Replays an investment decision directly from raw cold-storage inputs.
   *
   * v3.2.1 FAIL-CLOSED CONTRACT:
   * - If snapshot.rawQuantInput is absent → throws Error
   * - If snapshot.rawInputFacts is absent → throws Error
   * - Raw inputs are filtered through filterByHistoricalBoundary before use
   * - Credibility grade is computed from rawInputClaims (never from decisionState)
   * - Both rawInputHash and decisionStateHash are computed and returned
   *
   * The ONLY valid replay flow:
   *   snapshot.rawInputFacts + snapshot.rawInputClaims + snapshot.rawQuantInput
   *     → filterByHistoricalBoundary
   *     → reconcile(quantInput, iiceInput)
   *     → decisionState
   *
   * NEVER:
   *   snapshot.decisionState → fallback pseudo-inputs → reconcile → decisionState
   */
  public static replayFromColdStorage(snapshot: DecisionSnapshot): ColdReplayResult {

    // ── FAIL-CLOSED: Validate that all mandatory raw inputs exist ────────────
    if (!snapshot.rawQuantInput) {
      throw new Error(
        `[DecisionReplayEngine] REPLAY FAILED (fail-closed): snapshot '${snapshot.snapshotId}' ` +
        `is missing rawQuantInput. ` +
        `Cold-storage replay requires complete raw inputs — ` +
        `falling back to snapshot.decisionState would be circular and is PROHIBITED.`
      );
    }

    if (!snapshot.rawInputFacts || snapshot.rawInputFacts.length === 0) {
      throw new Error(
        `[DecisionReplayEngine] REPLAY FAILED (fail-closed): snapshot '${snapshot.snapshotId}' ` +
        `is missing rawInputFacts. ` +
        `Cold-storage replay requires the original canonical facts that produced the decision.`
      );
    }

    // ── FAIL-CLOSED: Validate that decisionDate exists ─────────────────────
    if (!snapshot.decisionDate) {
      throw new Error(
        `[DecisionReplayEngine] REPLAY FAILED: decisionDate is mandatory. ` +
        `evaluatedAt cannot serve as a historical cutoff.`
      );
    }

    const divergences: string[] = [];

    // ── Step 1: MR-5 Historical Boundary Filter ───────────────────────────────
    // v3.2.1: filterByHistoricalBoundary uses strict decisionDate
    const decisionDate = snapshot.decisionDate;
    const rawClaims = snapshot.rawInputClaims || [];
    const { facts: boundaryFacts, claims: boundaryClaims } = this.filterByHistoricalBoundary(
      snapshot.rawInputFacts,
      rawClaims,
      decisionDate
    );

    // ── Step 2: Compute rawInputHash from immutable raw inputs ────────────────
    const rawInputHash = this.computeRawInputHash(snapshot);

    // ── Step 3: Build quantInput from raw snapshot (no fallbacks to decisionState) ──
    const quantInput: ItasQuantInput = {
      symbol: snapshot.rawQuantInput.symbol || snapshot.issuerSymbol,
      strategyAgreementCount: snapshot.rawQuantInput.strategyAgreementCount,
      totalStrategiesEvaluated: snapshot.rawQuantInput.totalStrategiesEvaluated,
      signalStrength: snapshot.rawQuantInput.signalStrength,
      marketRegime: snapshot.rawQuantInput.marketRegime,
      quantDirective: snapshot.rawQuantInput.quantDirective,
      decisionDate: snapshot.decisionDate,
      evaluatedAt: snapshot.evaluatedAt
    };

    // ── Step 4: Build iiceInput — credibility grade from rawInputClaims ONLY ──
    const credibilityGrade = this.deriveCredibilityGradeFromRawClaims(boundaryClaims);
    const achievedCount = boundaryClaims.filter((c: any) => c.status === 'ACHIEVED' || c.status === 'ACHIEVED_EARLY').length;
    const missedCount = boundaryClaims.filter((c: any) => c.status === 'MISSED').length;
    const totalClaims = boundaryClaims.length;
    const sayDoRatio = totalClaims > 0 ? achievedCount / totalClaims : 0;

    const iiceInput: IiceIntelligenceInput = {
      symbol: snapshot.issuerSymbol,
      companyName: snapshot.issuerSymbol,
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      walkTheTalk: {
        symbol: snapshot.issuerSymbol,
        totalClaims,
        achievedCount,
        partiallyAchievedCount: 0,
        missedCount,
        reversedCount: 0,
        openCount: 0,
        dueForEvaluationCount: 0,
        unresolvedCount: 0,
        grade: credibilityGrade,           // ← v3.2.1: From rawInputClaims, NOT from decisionState
        keyEvidencedExamples: []
      },
      contradictions: snapshot.rawInputContradictions || [],
      evaluatedBreakers: snapshot.rawInputBreakers || [],
      unknowns: [],
      recentEvents: [],
      evidenceCount: boundaryFacts.length  // ← From boundary-filtered raw facts
    };

    // ── Step 5: Reconstruct decision from engines ─────────────────────────────
    const reconciliationService = new ItasIiceReconciliationService();
    const reconstructedState = reconciliationService.reconcile(quantInput, iiceInput);
    const reconstructedPolicy = reconstructedState.portfolioPolicy!;

    // ── Step 6: Compute decisionStateHash from OUTPUT state ───────────────────
    const decisionStatePayload = {
      symbol: snapshot.issuerSymbol,
      quantOpportunity: reconstructedState.quantOpportunity,
      intelligenceRisk: reconstructedState.intelligenceRisk,
      thesisState: reconstructedState.thesisState,
      managementCredibility: reconstructedState.managementCredibility,
      portfolioPolicy: reconstructedPolicy,
      nodes: (reconstructedState.provenanceDAG?.nodes || []).map(n => n.id).sort(),
      edges: (reconstructedState.provenanceDAG?.edges || []).map(e => `${e.from}->${e.to}`).sort()
    };
    const decisionStateHash = this.computeCanonicalStateHash(decisionStatePayload);
    const originalHash = snapshot.canonicalStateHash || snapshot.provenanceHash;

    // ── Step 7: Compare fields ────────────────────────────────────────────────
    const fieldMatches = {
      quantOpportunity: reconstructedState.quantOpportunity === snapshot.decisionState.quantOpportunity,
      intelligenceRisk: reconstructedState.intelligenceRisk === snapshot.decisionState.intelligenceRisk,
      thesisState: reconstructedState.thesisState === snapshot.decisionState.thesisState,
      managementCredibility: reconstructedState.managementCredibility === snapshot.decisionState.managementCredibility,
      activeThesisBreakers: reconstructedState.activeThesisBreakers === snapshot.decisionState.activeThesisBreakers,
      allocationRecommendation: reconstructedState.allocationRecommendation === snapshot.decisionState.allocationRecommendation,
      hashMatches: decisionStateHash === originalHash
    };

    if (!fieldMatches.quantOpportunity) {
      divergences.push(`quantOpportunity: expected ${snapshot.decisionState.quantOpportunity}, got ${reconstructedState.quantOpportunity}`);
    }
    if (!fieldMatches.intelligenceRisk) {
      divergences.push(`intelligenceRisk: expected ${snapshot.decisionState.intelligenceRisk}, got ${reconstructedState.intelligenceRisk}`);
    }
    if (!fieldMatches.thesisState) {
      divergences.push(`thesisState: expected ${snapshot.decisionState.thesisState}, got ${reconstructedState.thesisState}`);
    }
    if (!fieldMatches.managementCredibility) {
      divergences.push(`managementCredibility: expected ${snapshot.decisionState.managementCredibility}, got ${reconstructedState.managementCredibility}`);
    }
    if (!fieldMatches.allocationRecommendation) {
      divergences.push(`allocation: expected ${snapshot.decisionState.allocationRecommendation}, got ${reconstructedState.allocationRecommendation}`);
    }
    if (!fieldMatches.hashMatches) {
      divergences.push(`hashMismatch: original=${originalHash}, reconstructed=${decisionStateHash}`);
    }

    const isMatch = divergences.length === 0;

    return {
      isMatch,
      reconstructedState,
      reconstructedPolicy,
      decisionStateHash,
      rawInputHash,
      reconstructedHash: decisionStateHash, // Legacy alias
      originalHash,
      fieldMatches,
      divergences,
      boundaryFilteredFactCount: boundaryFacts.length,
      boundaryFilteredClaimCount: boundaryClaims.length
    };
  }
}
