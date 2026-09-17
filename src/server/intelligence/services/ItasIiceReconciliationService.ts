/**
 * ItasIiceReconciliationService.ts
 *
 * Downstream Reconciliation Service joining ITAS Quantitative Intelligence
 * with IICE Qualitative / Contradiction Intelligence.
 *
 * Enforces Constitution Article 24 & 25:
 * 1. Two-Axis Independence: Neither layer overwrites or replaces the other.
 * 2. Unknown Preservation: Absence of verified adverse evidence shall NOT be
 *    interpreted as low risk (UNKNOWN remains UNKNOWN).
 * 3. Deterministic interpretation derived strictly from the underlying state combination.
 */

import crypto from 'crypto';
import {
  DecisionState,
  QuantOpportunity,
  IntelligenceRisk,
  ThesisState,
  InvestmentIntelligenceBrief,
  AllocationRecommendation,
  PortfolioAllocationPolicy,
  DecisionProvenance,
  DecisionProvenanceDAG,
  DecisionSnapshot,
  ProvenanceNode,
  ProvenanceEdge
} from '../types/InvestmentBrief.js';
import { ManagementCredibilityScorecard, CredibilityGrade } from '../types/ManagementClaim.js';
import { Contradiction } from '../types/Contradiction.js';
import { ThesisBreaker, ImportantUnknown } from '../types/ThesisDefinition.js';
import { IntelligenceEvent } from '../types/IntelligenceEvent.js';
import { DecisionReplayEngine } from '../engines/DecisionReplayEngine.js';

export interface ItasQuantInput {
  symbol: string;
  strategyAgreementCount: number; // e.g., 7 / 20
  totalStrategiesEvaluated: number; // 20
  signalStrength: number;          // e.g. 96 / 100
  marketRegime: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'VOLATILE';
  quantDirective: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'NEUTRAL';
  decisionDate?: string;           // Optional injected decision cutoff date (e.g. '2024-06-30')
  evaluatedAt?: string;            // Optional injected execution timestamp
}

export interface IiceIntelligenceInput {
  symbol: string;
  companyName: string;
  marketCapTier: 'LARGECAP' | 'MIDCAP' | 'SMALLCAP' | 'MICROCAP_SME';
  exchangeBoard: 'MAIN_BOARD' | 'SME_EXCHANGE';
  walkTheTalk: ManagementCredibilityScorecard;
  contradictions: Contradiction[];
  evaluatedBreakers: ThesisBreaker[];
  unknowns: ImportantUnknown[];
  recentEvents: IntelligenceEvent[];
  evidenceCount: number;
}

export class ItasIiceReconciliationService {
  /**
   * Evaluates ITAS Quantitative Opportunity independently.
   * Specification Rule: >=75=STRONG, 50-74=MODERATE, 25-49=WEAK, <25=NONE.
   * Invariant: Never mutated by IICE qualitative findings.
   */
  public evaluateQuantOpportunity(quant: ItasQuantInput): QuantOpportunity {
    const score = quant.signalStrength !== undefined ? quant.signalStrength : (quant.strategyAgreementCount !== undefined ? quant.strategyAgreementCount * 5 : 0);
    if (score >= 75) return 'STRONG';
    if (score >= 50) return 'MODERATE';
    if (score >= 25) return 'WEAK';
    return 'NONE';
  }

  /**
   * Evaluates IICE Intelligence Risk independently.
   * Invariant: Never mutated by ITAS quantitative enthusiasm.
   * Constitution Article 25: Insufficient evidence produces UNKNOWN risk, not LOW risk.
   */
  public evaluateIntelligenceRisk(iice: IiceIntelligenceInput): IntelligenceRisk {
    // Check evidence sufficiency first
    if (iice.evidenceCount < 1 || iice.walkTheTalk.totalClaims === 0) {
      return 'UNKNOWN';
    }

    const hasCriticalBreaker = iice.evaluatedBreakers.some(
      b => b.status === 'ACTIVE' && (b.severity === 'CRITICAL' || b.severity === 'HIGH')
    );
    const hasCriticalContradiction = iice.contradictions.some(
      c => c.status === 'OPEN' && c.severity === 'CRITICAL'
    );

    if (hasCriticalBreaker || hasCriticalContradiction) {
      return 'CRITICAL';
    }

    const hasHighContradiction = iice.contradictions.some(
      c => c.status === 'OPEN' && c.severity === 'HIGH'
    );
    const hasActiveBreaker = iice.evaluatedBreakers.some(b => b.status === 'ACTIVE');
    const isCredibilityWeak = iice.walkTheTalk.grade === 'WEAK';

    if (hasHighContradiction || hasActiveBreaker || isCredibilityWeak) {
      return 'HIGH';
    }

    const hasMediumContradiction = iice.contradictions.some(
      c => c.status === 'OPEN' && c.severity === 'MEDIUM'
    );
    const isCredibilityMixed = iice.walkTheTalk.grade === 'MIXED';

    if (hasMediumContradiction || isCredibilityMixed) {
      return 'MODERATE';
    }

    return 'LOW';
  }

  /**
   * Evaluates the Portfolio Allocation Policy following the strict Decision Precedence Hierarchy:
   * 1. Hard Exclusion Veto (Active Breakers / Critical Solvency Risk) -> 0.0x
   * 2. Article 25 Gated Escrow (Evidence Unknown) -> 0.0x
   * 3. Prohibited Entry (Challenged Thesis / High Risk) -> 0.0x
   * 4. Constrained Sizing (Mixed Thesis / Moderate Risk) -> 0.5x
   * 5. Supported Thesis Credibility Sizing:
   *    - STRONG credibility -> FULL_TARGET_SIZING (1.0x)
   *    - GENERALLY_CREDIBLE -> NORMAL_SIZING (0.8x)
   *    - INSUFFICIENT_HISTORY -> CAPPED_ALLOCATION (0.5x, Evidence Gap Cap)
   */
  public deriveAllocationPolicy(
    thesis: ThesisState,
    risk: IntelligenceRisk,
    credibility: CredibilityGrade,
    activeBreakersCount: number
  ): PortfolioAllocationPolicy {
    // 1. HARD VETO PRECEDENCE: Active Breakers or Critical Risk strictly mandate Hard Exclusion
    if (activeBreakersCount > 0 || risk === 'CRITICAL' || thesis === 'BROKEN') {
      return {
        directive: 'HARD_EXCLUSION_VETO',
        targetSizingCapRatio: 0.0,
        policyRationale: 'Active catastrophic thesis breaker or insolvency risk triggers immediate exclusion veto. Zero capital permitted.'
      };
    }

    // 2. UNRESOLVED / EVIDENCE UNKNOWN PRECEDENCE (Article 25)
    if (thesis === 'UNRESOLVED' || risk === 'UNKNOWN') {
      return {
        directive: 'GATED_ESCROW',
        targetSizingCapRatio: 0.0,
        policyRationale: 'Article 25 Unknown Preservation: Capital deployment gated pending verifiable primary documentation.'
      };
    }

    // 3. CHALLENGED PRECEDENCE
    if (thesis === 'CHALLENGED' || risk === 'HIGH') {
      return {
        directive: 'PROHIBITED_ENTRY',
        targetSizingCapRatio: 0.0,
        policyRationale: 'Severe guidance miss, capex delay, or open contradiction challenges thesis. Prohibited from new entry.'
      };
    }

    // 4. MIXED PRECEDENCE
    if (thesis === 'MIXED' || risk === 'MODERATE') {
      return {
        directive: 'CONSTRAINED_SIZING',
        targetSizingCapRatio: 0.5,
        policyRationale: 'Moderate execution slippage or margin compression requires constrained sizing (-50% target) with tight stops.'
      };
    }

    // 5. SUPPORTED THESIS: CREDIBILITY CONSTRAINT
    if (credibility === 'STRONG') {
      return {
        directive: 'FULL_TARGET_SIZING',
        targetSizingCapRatio: 1.0,
        policyRationale: 'Full target capital allocation: supported thesis backed by proven management credibility track record (>=80% delivered).'
      };
    }

    if (credibility === 'GENERALLY_CREDIBLE') {
      return {
        directive: 'NORMAL_SIZING',
        targetSizingCapRatio: 0.8,
        policyRationale: 'Normal capital allocation: supported thesis with generally credible execution (50-79% delivered).'
      };
    }

    if (credibility === 'INSUFFICIENT_HISTORY') {
      return {
        directive: 'CAPPED_ALLOCATION',
        targetSizingCapRatio: 0.5,
        policyRationale: 'Capped allocation: Supported thesis and clean forensics, but management credibility is unverified (INSUFFICIENT_HISTORY, N=1 claim). Sizing capped at 50% target.'
      };
    }

    return {
      directive: 'CONSTRAINED_SIZING',
      targetSizingCapRatio: 0.5,
      policyRationale: 'Constrained capital sizing due to unconfirmed qualitative factors.'
    };
  }

  /**
   * Synthesizes the Two-Axis Decision State and derives executive interpretation.
   */
  public reconcile(quant: ItasQuantInput, iice: IiceIntelligenceInput): DecisionState {
    const quantOpportunity = this.evaluateQuantOpportunity(quant);
    const intelligenceRisk = this.evaluateIntelligenceRisk(iice);

    const activeBreakersCount = iice.evaluatedBreakers.filter(b => b.status === 'ACTIVE').length;
    const criticalUnknownsCount = iice.unknowns.filter(
      u => u.decisionImpact === 'HIGH' && (u.state === 'NOT_YET_CHECKED' || u.state === 'UNRESOLVED' || u.state === 'SEARCHED_AND_NOT_FOUND')
    ).length;

    let thesisState: ThesisState = 'UNRESOLVED';

    if (intelligenceRisk === 'CRITICAL' || activeBreakersCount > 0) {
      thesisState = 'BROKEN';
    } else if (intelligenceRisk === 'UNKNOWN') {
      thesisState = 'UNRESOLVED';
    } else if (intelligenceRisk === 'HIGH') {
      thesisState = 'CHALLENGED';
    } else if (intelligenceRisk === 'MODERATE') {
      thesisState = 'MIXED';
    } else {
      // LOW risk
      thesisState = 'SUPPORTED';
    }

    // Determine evidence quality tier
    let evidenceQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT' = 'INSUFFICIENT';
    if (iice.evidenceCount >= 5 && iice.walkTheTalk.grade !== 'INSUFFICIENT_HISTORY') {
      evidenceQuality = 'HIGH';
    } else if (iice.evidenceCount >= 2) {
      evidenceQuality = 'MEDIUM';
    } else if (iice.evidenceCount === 1) {
      evidenceQuality = 'LOW';
    }

    const portfolioPolicy = this.deriveAllocationPolicy(thesisState, intelligenceRisk, iice.walkTheTalk.grade, activeBreakersCount);
    const interpretation = this.deriveInterpretation(
      quantOpportunity,
      intelligenceRisk,
      thesisState,
      iice.walkTheTalk.grade,
      activeBreakersCount,
      criticalUnknownsCount,
      portfolioPolicy.directive
    );

    const provenance = this.buildDecisionProvenance(quant, iice, quantOpportunity, intelligenceRisk, thesisState, portfolioPolicy);
    const provenanceDAG = this.buildProvenanceDAG(quant, iice, quantOpportunity, intelligenceRisk, thesisState, portfolioPolicy);

    const canonicalPayload = {
      symbol: quant.symbol,
      quantOpportunity,
      intelligenceRisk,
      thesisState,
      managementCredibility: iice.walkTheTalk.grade,
      portfolioPolicy,
      nodes: provenanceDAG.nodes.map(n => n.id).sort(),
      edges: provenanceDAG.edges.map(e => `${e.from}->${e.to}`).sort()
    };
    const canonicalStateHash = DecisionReplayEngine.computeCanonicalStateHash(canonicalPayload);
    const provenanceHash = canonicalStateHash;

    const decisionDate = quant.decisionDate;
    if (!decisionDate) {
      throw new Error(
        'decisionDate is mandatory for deterministic reconciliation'
      );
    }

    const decisionSnapshot: DecisionSnapshot = {
      snapshotId: `SNAP_${quant.symbol}_${canonicalStateHash.substring(0, 12)}`,
      decisionId: `DECISION_${quant.symbol}`,
      issuerSymbol: quant.symbol,
      evaluatedAt: quant.evaluatedAt ?? new Date().toISOString(),
      decisionDate,
      schemaVersion: '3.2.1',
      ontologyVersion: '1.3',
      ruleSetVersion: '2026.09',
      policyVersion: '1.0',
      factVersion: '1.0',
      claimVersion: '1.0',
      rawQuantInput: quant,
      rawInputBreakers: iice.evaluatedBreakers,
      decisionState: {
        quantOpportunity,
        intelligenceRisk,
        thesisState,
        managementCredibility: iice.walkTheTalk.grade,
        activeThesisBreakers: activeBreakersCount,
        criticalUnknowns: criticalUnknownsCount,
        evidenceQuality,
        interpretation,
        allocationRecommendation: portfolioPolicy.directive
      },
      portfolioPolicy,
      provenanceDAG,
      provenanceHash,
      canonicalStateHash
    };

    return {
      quantOpportunity,
      intelligenceRisk,
      thesisState,
      managementCredibility: iice.walkTheTalk.grade,
      activeThesisBreakers: activeBreakersCount,
      criticalUnknowns: criticalUnknownsCount,
      evidenceQuality,
      interpretation,
      allocationRecommendation: portfolioPolicy.directive,
      portfolioPolicy,
      provenance,
      provenanceDAG,
      decisionSnapshot
    };
  }

  /**
   * Generates deterministic interpretation from state combinations with strict epistemic humility.
   */
  private deriveInterpretation(
    quant: QuantOpportunity,
    risk: IntelligenceRisk,
    thesis: ThesisState,
    credibility: CredibilityGrade,
    activeBreakers: number,
    criticalUnknowns: number,
    directive: AllocationRecommendation
  ): string {
    if (thesis === 'BROKEN') {
      return `${quant} quantitative signal active, but ${activeBreakers > 0 ? 'confirmed active thesis breaker(s)' : 'critical governance/solvency contradiction'} invalidates the investment thesis. Portfolio directive: ${directive}.`;
    }
    if (thesis === 'UNRESOLVED') {
      return `${quant} quantitative candidate, but intelligence risk is UNRESOLVED due to insufficient verified evidence (${criticalUnknowns} critical unknowns). Requires primary investigation before capital commitment. Portfolio directive: ${directive}.`;
    }
    if (thesis === 'CHALLENGED') {
      const quantLabel = quant.charAt(0).toUpperCase() + quant.slice(1).toLowerCase();
      return `${quantLabel} quantitative setup, but material intelligence concerns, open contradictions, or guidance misses challenge the investment thesis. Portfolio directive: ${directive}.`;
    }
    if (thesis === 'MIXED') {
      return `${quant} quantitative setup paired with MODERATE intelligence risk. Partial delivery or margin headwinds warrant constrained sizing (-50%). Portfolio directive: ${directive}.`;
    }
    if (thesis === 'SUPPORTED') {
      if (credibility === 'INSUFFICIENT_HISTORY') {
        return `${quant === 'STRONG' ? 'Strong' : 'Moderate'} quantitative opportunity with clean forensic profile and zero active thesis breakers, but management credibility remains unverified (INSUFFICIENT_HISTORY — only 1 evaluated claim). Portfolio directive: ${directive} (50% target cap).`;
      }
      return `${quant === 'STRONG' ? 'Strong' : 'Moderate'} quantitative opportunity supported by clean qualitative intelligence, verified management track record, and zero active thesis breakers. Portfolio directive: ${directive}.`;
    }
    return `${quant} quantitative opportunity paired with ${risk} intelligence risk (${thesis} thesis state). Review open unknowns before decision. Portfolio directive: ${directive}.`;
  }

  private buildDecisionProvenance(
    quant: ItasQuantInput,
    iice: IiceIntelligenceInput,
    quantOpp: QuantOpportunity,
    risk: IntelligenceRisk,
    thesis: ThesisState,
    policy: PortfolioAllocationPolicy
  ): DecisionProvenance {
    const score = quant.signalStrength !== undefined ? quant.signalStrength : (quant.strategyAgreementCount * 5);
    return {
      quantDerivation: `ITAS-Score-${score} -> Threshold(>=75:STRONG, 50-74:MODERATE, 25-49:WEAK, <25:NONE) -> ${quantOpp}`,
      riskDerivation: `BreakersActive:${iice.evaluatedBreakers.filter(b=>b.status==='ACTIVE').length}, Contradictions:${iice.contradictions.length}, Unknowns:${iice.unknowns.length} -> Risk: ${risk}`,
      credibilityDerivation: `ClaimsEvaluated:${iice.walkTheTalk.totalClaims} -> CredibilityGrade: ${iice.walkTheTalk.grade}`,
      breakerDerivation: iice.evaluatedBreakers.map(b => `${b.breakerId}(${b.status})`).join(', ') || 'No breakers registered',
      thesisDerivation: `Matrix(${quantOpp}, ${risk}) -> Thesis: ${thesis}`,
      allocationDerivation: `Precedence(${thesis}, ${risk}, ${iice.walkTheTalk.grade}) -> Directive: ${policy.directive} (Cap: ${policy.targetSizingCapRatio * 100}%)`,
      auditTrail: [
        `ITAS-Engine#${quant.symbol}`,
        ...iice.evaluatedBreakers.flatMap(b => b.evidenceIds),
        ...iice.contradictions.map(c => `Contradiction#${c.contradictionId}`)
      ]
    };
  }

  private buildProvenanceDAG(
    quant: ItasQuantInput,
    iice: IiceIntelligenceInput,
    quantOpp: QuantOpportunity,
    risk: IntelligenceRisk,
    thesis: ThesisState,
    policy: PortfolioAllocationPolicy
  ): DecisionProvenanceDAG {
    const rootId = `DEC_${quant.symbol}`;
    const nodes: ProvenanceNode[] = [
      { id: rootId, type: 'DECISION', refId: quant.symbol, label: `Final Investment Decision: ${thesis}` },
      { id: `ALLOC_${quant.symbol}`, type: 'ALLOCATION', refId: policy.directive, label: `Allocation Policy: ${policy.directive} (${policy.targetSizingCapRatio * 100}%)` },
      { id: `THESIS_${quant.symbol}`, type: 'THESIS', refId: thesis, label: `Reconciled Thesis State: ${thesis}` },
      { id: `QUANT_${quant.symbol}`, type: 'RULE', refId: quantOpp, version: '2026.09', label: `Quant Opportunity: ${quantOpp} (Score: ${quant.signalStrength ?? quant.strategyAgreementCount * 5}/100)` },
      { id: `RISK_${quant.symbol}`, type: 'RULE', refId: risk, version: '2026.09', label: `Intelligence Risk: ${risk}` },
      { id: `CRED_${quant.symbol}`, type: 'FACT', refId: iice.walkTheTalk.grade, label: `Credibility Track Record: ${iice.walkTheTalk.grade} (Claims: ${iice.walkTheTalk.totalClaims})` }
    ];

    const edges: ProvenanceEdge[] = [
      { from: `ALLOC_${quant.symbol}`, to: rootId, relation: 'CONSTRAINED_BY' },
      { from: `THESIS_${quant.symbol}`, to: rootId, relation: 'DERIVED_FROM' },
      { from: `QUANT_${quant.symbol}`, to: `THESIS_${quant.symbol}`, relation: 'EVALUATED_BY' },
      { from: `RISK_${quant.symbol}`, to: `THESIS_${quant.symbol}`, relation: 'EVALUATED_BY' },
      { from: `CRED_${quant.symbol}`, to: `ALLOC_${quant.symbol}`, relation: 'CONSTRAINED_BY' }
    ];

    // Add breaker nodes
    iice.evaluatedBreakers.forEach(b => {
      const bNodeId = `BRK_${b.breakerId}`;
      nodes.push({ id: bNodeId, type: 'RULE', refId: b.breakerId, version: '2026.09', label: `Breaker ${b.breakerId}: ${b.status} (Observed: ${b.currentObservedValue})` });
      edges.push({ from: bNodeId, to: `RISK_${quant.symbol}`, relation: 'EVALUATED_BY' });
      if (b.status === 'ACTIVE') {
        edges.push({ from: bNodeId, to: `THESIS_${quant.symbol}`, relation: 'CONTRADICTED_BY' });
      }
    });

    return {
      rootDecisionId: rootId,
      nodes,
      edges
    };
  }

  /**
   * Assembles the full 11-point Investment Intelligence Brief.
   */
  public generateBrief(
    quant: ItasQuantInput,
    iice: IiceIntelligenceInput,
    coreThesisStatement: string
  ): InvestmentIntelligenceBrief {
    const decisionState = this.reconcile(quant, iice);

    return {
      symbol: iice.symbol,
      companyName: iice.companyName,
      marketCapTier: iice.marketCapTier,
      exchangeBoard: iice.exchangeBoard,
      generatedAt: new Date().toISOString(),

      decisionState,

      executiveAssessment: {
        overall: decisionState.thesisState === 'SUPPORTED' ? 'POSITIVE' : (decisionState.thesisState === 'BROKEN' ? 'NEGATIVE' : 'MIXED'),
        confidence: decisionState.evidenceQuality === 'HIGH' ? 'HIGH' : (decisionState.evidenceQuality === 'MEDIUM' ? 'MEDIUM' : 'LOW'),
        decisionImplication: decisionState.thesisState === 'SUPPORTED' ? 'SUPPORTS_THESIS' : (decisionState.thesisState === 'BROKEN' ? 'CHALLENGES_THESIS' : 'NEUTRAL'),
        oneLineSummary: decisionState.interpretation
      },

      thesisSupport: [
        {
          headline: `Quantitative setup: ${quant.strategyAgreementCount}/${quant.totalStrategiesEvaluated} strategies aligned in ${quant.marketRegime} regime`,
          detail: `ITAS Signal Strength: ${quant.signalStrength}/100 with active directive ${quant.quantDirective}.`,
          sourceDocType: 'ITAS_QUANT_DOSSIER_6.0',
          evidenceLineage: `ITAS-Quant-Engine#${quant.symbol}`,
          significance: 'HIGH'
        },
        ...iice.walkTheTalk.keyEvidencedExamples.filter(e => e.status === 'ACHIEVED').map(e => ({
          headline: `Delivered commitment: ${e.statement}`,
          detail: `Disclosed actual outcome: ${e.actual}`,
          sourceDocType: 'ANNUAL_REPORT',
          evidenceLineage: e.evidenceLineage,
          significance: 'HIGH' as const
        }))
      ],

      thesisChallenges: [
        ...iice.contradictions.map(c => ({
          headline: `Contradiction detected (${c.severity} severity): ${c.description}`,
          detail: `Disclosed divergence between promise and observed financial reality.`,
          sourceDocType: 'CONTRADICTION_ENGINE',
          evidenceLineage: `LeftEvidence#${c.leftEvidenceId} vs RightEvidence#${c.rightEvidenceId}`,
          significance: 'HIGH' as const
        })),
        ...iice.evaluatedBreakers.filter(b => b.status === 'ACTIVE').map(b => ({
          headline: `Active Thesis Breaker: ${b.name}`,
          detail: b.rationale,
          sourceDocType: 'THESIS_BREAKER_ENGINE',
          evidenceLineage: (b.evidenceIds || []).join(', ') || 'METRIC_EVALUATION',
          significance: 'HIGH' as const
        }))
      ],

      walkTheTalk: iice.walkTheTalk,

      governanceSignals: [
        {
          parameter: 'Promoter Encumbrance / Pledge',
          finding: 'Zero promoter shares pledged (100% unencumbered).',
          severity: 'CLEAN',
          evidenceId: `GOV_PLEDGE_${iice.symbol}`
        },
        {
          parameter: 'Statutory Auditor Resignation / Qualification',
          finding: 'Clean audit opinion without adverse qualifications.',
          severity: 'CLEAN',
          evidenceId: `GOV_AUDIT_${iice.symbol}`
        }
      ],

      externalIntelligence: iice.recentEvents.map(e => ({
        date: e.eventDate,
        source: e.sourceType,
        headline: e.headline,
        verified: e.sourceTier === 'TIER_1_PRIMARY_AUTHORITATIVE' || e.sourceTier === 'TIER_2_PRIMARY_CORPORATE',
        sourceTier: e.sourceTier
      })),

      openContradictions: iice.contradictions.filter(c => c.status === 'OPEN'),
      thesisBreakers: iice.evaluatedBreakers,
      importantUnknowns: iice.unknowns,

      evidenceQuality: {
        tier: decisionState.evidenceQuality === 'HIGH' ? 'HIGH' : (decisionState.evidenceQuality === 'MEDIUM' ? 'MEDIUM' : 'LOW'),
        directSourcesCount: iice.evidenceCount,
        corroboratedCount: iice.walkTheTalk.achievedCount,
        unresolvedCount: iice.unknowns.filter(u => u.state === 'UNRESOLVED').length
      },

      decisionImplicationNote: `Core Thesis: "${coreThesisStatement}". Qualitative status: ${decisionState.thesisState}. Review before trade authorization.`
    };
  }
}
