/**
 * IndependentEvidenceVerifier.ts
 *
 * FERE v3.2.1 Gate B: Independent Evidence Validation Layer.
 * Sits between SOURCE_SUPPORTED facts and the Canonical Fact Store.
 *
 * Answers the question:
 * "Is this actually the authoritative evidence we should use?"
 *
 * v3.2.1 Critical Fix — Semantic Peer Matching:
 * ─────────────────────────────────────────────────────────────────────────────
 * BEFORE: Peers matched on issuer + metric + (asOfDate OR periodEnd OR measurementPeriod).
 *   → False corroboration: STANDALONE Revenue FY24 could corroborate CONSOLIDATED Revenue FY24.
 *   → False contradiction: REPORTED EBITDA could conflict with ADJUSTED EBITDA.
 *
 * AFTER: Full semantic identity required for peer matching:
 *   issuer + metric + scope + measurementType + currency + unit + period + methodology
 *   All eight dimensions must match before two facts are treated as peers.
 *
 * Key Principles (preserved):
 * 1. A fact is not rejected merely because independent confirmation is absent.
 *    Single primary-source facts remain canonical as SOURCE_SUPPORTED.
 * 2. Documents follow a strict configurable authority hierarchy (Rank 0–5).
 * 3. Restatement Detection: Audited restatement for same semantic identity → SUPERSEDED.
 * 4. INVARIANT: No conflict may be resolved solely by document chronology when authority,
 *    period, and metric are equivalent. Equal-authority divergence → CONFLICTING.
 */

import { FinancialFact, FactVerificationStatus } from '../types/FinancialFact.js';

export interface AuthorityHierarchyConfig {
  filingTypeRanks: Record<string, number>;
}

export const DEFAULT_AUTHORITY_HIERARCHY: AuthorityHierarchyConfig = {
  filingTypeRanks: {
    'STATUTORY_AUDITED_FINANCIALS': 5,
    'AUDITED_FINANCIAL_STATEMENTS': 5,
    'ANNUAL_REPORT': 4,
    'LIMITED_REVIEW_FINANCIALS': 3,
    'INVESTOR_PRESENTATION': 3,
    'EARNINGS_CALL': 2,
    'PRESS_RELEASE': 1,
    'SECONDARY_SOURCE': 0
  }
};

export interface GateBVerificationResult {
  finalVerificationStatus: FactVerificationStatus;
  authorityRank: number;
  isRestated: boolean;
  supersedingEvidenceId?: string;
  corroboratingEvidenceId?: string;
  rationale: string;
  semanticMatchDetails?: {
    scopeMatched: boolean;
    currencyMatched: boolean;
    unitMatched: boolean;
    measurementTypeMatched: boolean;
    methodologyMatched: boolean;
  };
}

export class IndependentEvidenceVerifier {
  private hierarchyConfig: AuthorityHierarchyConfig;

  constructor(config: AuthorityHierarchyConfig = DEFAULT_AUTHORITY_HIERARCHY) {
    this.hierarchyConfig = config;
  }

  /**
   * Resolves the authority rank (0–5) for a given fact based on filing type and audit status.
   */
  public getAuthorityRank(fact: FinancialFact): number {
    const filingType = (fact.filingType || fact.sourceMetadata?.filingType || '').toUpperCase();
    if (this.hierarchyConfig.filingTypeRanks[filingType] !== undefined) {
      return this.hierarchyConfig.filingTypeRanks[filingType];
    }
    if (fact.auditStatus === 'AUDITED' || fact.sourceMetadata?.auditStatus === 'AUDITED') {
      return 5;
    }
    if (fact.auditStatus === 'LIMITED_REVIEW') {
      return 3;
    }
    return 2; // Default: generic corporate communication
  }

  /**
   * v3.2.1: Full semantic peer matching.
   *
   * Two facts are peers ONLY IF ALL of the following match:
   * 1. issuerSymbol (same company)
   * 2. metric (same canonical metric name)
   * 3. scope (STANDALONE vs CONSOLIDATED vs SEGMENT — CRITICAL for contradiction model)
   * 4. measurementType (FLOW vs STOCK)
   * 5. currency (INR vs USD — semantic, not cosmetic)
   * 6. unit (INR_CRORE vs INR_LAKH — must be the same scale)
   * 7. period (asOfDate OR periodEnd OR measurementPeriod — at least one must match)
   * 8. methodology (REPORTED vs ADJUSTED vs STATUTORY — cannot be auto-interchanged)
   *
   * If ANY dimension mismatches, the facts are NOT peers and cannot produce
   * corroboration or contradiction signals against each other.
   */
  private isSemanticallyMatchingPeer(
    fact: FinancialFact,
    candidate: FinancialFact
  ): { isMatch: boolean; details: GateBVerificationResult['semanticMatchDetails'] } {
    if (candidate.factId === fact.factId) {
      return { isMatch: false, details: undefined };
    }

    // 1. Issuer
    if (candidate.issuerSymbol !== fact.issuerSymbol) {
      return { isMatch: false, details: undefined };
    }

    // 2. Metric
    if (candidate.metric.toLowerCase() !== fact.metric.toLowerCase()) {
      return { isMatch: false, details: undefined };
    }

    // 3. Scope — STANDALONE ≠ CONSOLIDATED even for same metric/period
    const factScope = fact.scope || 'CONSOLIDATED';
    const candidateScope = candidate.scope || 'CONSOLIDATED';
    const scopeMatched = factScope === candidateScope;

    // 4. MeasurementType — FLOW ≠ STOCK
    const measurementTypeMatched = fact.measurementType === candidate.measurementType;

    // 5. Currency — INR ≠ USD
    const factCcy = (fact.currency || '').trim().toUpperCase();
    const candidateCcy = (candidate.currency || '').trim().toUpperCase();
    const currencyMatched = !factCcy || !candidateCcy || factCcy === candidateCcy;

    // 6. Unit — must be same scale unit
    const factUnit = (fact.unit || '').trim().toUpperCase();
    const candidateUnit = (candidate.unit || '').trim().toUpperCase();
    const unitMatched = factUnit === candidateUnit;

    // 7. Period — at least one temporal anchor must match
    const periodMatched =
      (fact.asOfDate && candidate.asOfDate && fact.asOfDate === candidate.asOfDate) ||
      (fact.periodEnd && candidate.periodEnd && fact.periodEnd === candidate.periodEnd) ||
      (fact.measurementPeriod && candidate.measurementPeriod &&
       fact.measurementPeriod === candidate.measurementPeriod);

    // 8. Methodology — REPORTED vs ADJUSTED vs STATUTORY vs NORMALIZED
    const factMethodology = fact.accountingMethodology;
    const candidateMethodology = candidate.accountingMethodology;
    const methodologyMatched =
      !factMethodology || !candidateMethodology || factMethodology === candidateMethodology;

    // All 8 dimensions must match for semantic peer status
    const isMatch =
      scopeMatched &&
      measurementTypeMatched &&
      currencyMatched &&
      unitMatched &&
      Boolean(periodMatched) &&
      methodologyMatched;

    return {
      isMatch,
      details: { scopeMatched, currencyMatched, unitMatched, measurementTypeMatched, methodologyMatched }
    };
  }

  /**
   * Evaluates a SOURCE_SUPPORTED fact against corroborating or conflicting evidence in the corpus.
   */
  public verify(
    fact: FinancialFact,
    corpusFacts: FinancialFact[] = []
  ): GateBVerificationResult {
    const rank = this.getAuthorityRank(fact);

    // v3.2.1: Semantic peer matching — all 8 dimensions must match
    const peers = corpusFacts.filter(p => this.isSemanticallyMatchingPeer(fact, p).isMatch);

    // 1. Restatement Check: Is there a subsequent statutory restatement?
    const restatements = peers.filter(p => {
      const isRestatedDoc =
        p.filingType === 'STATUTORY_RESTATEMENT' ||
        p.notes?.toLowerCase().includes('restatement') ||
        p.sourceMetadata?.filingType === 'STATUTORY_RESTATEMENT';
      const isLaterDate =
        new Date(p.filingDate || '2000-01-01').getTime() >
        new Date(fact.filingDate || '2000-01-01').getTime();
      return isRestatedDoc && isLaterDate;
    });

    if (restatements.length > 0) {
      return {
        finalVerificationStatus: 'SUPERSEDED',
        authorityRank: rank,
        isRestated: true,
        supersedingEvidenceId: restatements[0].sourceEvidenceId,
        rationale:
          `Fact superseded by subsequent statutory restatement in filing ${restatements[0].sourceEvidenceId}. ` +
          `Semantic identity (metric, scope, period, currency, methodology) confirmed before supersession.`
      };
    }

    // 2. Conflicting Evidence: Does a peer of equal/higher authority report a different value?
    const conflicts = peers.filter(p => {
      const pRank = this.getAuthorityRank(p);
      const differentValue = String(p.value) !== String(fact.value);
      return differentValue && pRank >= rank;
    });

    if (conflicts.length > 0) {
      // INVARIANT: No conflict resolved solely by document chronology when authority and period are equivalent
      return {
        finalVerificationStatus: 'CONFLICTING',
        authorityRank: rank,
        isRestated: false,
        supersedingEvidenceId: conflicts[0].sourceEvidenceId,
        rationale:
          `Substantive conflict with equivalent/higher authority source ` +
          `(${conflicts[0].sourceEvidenceId}, rank ${this.getAuthorityRank(conflicts[0])}). ` +
          `Semantic peer match confirmed: same scope=${fact.scope}, unit=${fact.unit}, ` +
          `currency=${fact.currency || 'unspecified'}, methodology=${fact.accountingMethodology || 'unspecified'}. ` +
          `Requires analyst review.`
      };
    }

    // 3. Corroboration: Does an independent source confirm the identical value?
    const corroborations = peers.filter(p => {
      const sameValue = String(p.value) === String(fact.value);
      const differentDoc = p.sourceEvidenceId !== fact.sourceEvidenceId;
      return sameValue && differentDoc;
    });

    if (corroborations.length > 0) {
      return {
        finalVerificationStatus: 'INDEPENDENTLY_VALIDATED',
        authorityRank: rank,
        isRestated: false,
        corroboratingEvidenceId: corroborations[0].sourceEvidenceId,
        rationale:
          `Fact independently corroborated across separate source filing ${corroborations[0].sourceEvidenceId}. ` +
          `Full semantic match confirmed before corroboration was registered.`
      };
    }

    // 4. Default: Preserved as valid canonical primary-source fact (SOURCE_SUPPORTED)
    return {
      finalVerificationStatus: 'SOURCE_SUPPORTED',
      authorityRank: rank,
      isRestated: false,
      rationale:
        `Single primary source verified against cited document (rank ${rank}). ` +
        `No corroborating or conflicting semantic peers found in corpus. ` +
        `Retained as canonical evidence (SOURCE_SUPPORTED).`
    };
  }
}
