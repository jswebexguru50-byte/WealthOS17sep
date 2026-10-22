/**
 * InvestmentBrief.ts
 *
 * Layer 6 Output model: The 11-point Investment Intelligence Brief (FR-12).
 * Features the two-axis decision model (Quant Opportunity vs Intelligence Risk vs Thesis State)
 * and derived executive interpretation (Constitution Article 24 & 25).
 */

import { ManagementCredibilityScorecard, CredibilityGrade } from './ManagementClaim.js';
import { Contradiction } from './Contradiction.js';
import { ThesisBreaker, ImportantUnknown } from './ThesisDefinition.js';
import { FinancialFact } from './FinancialFact.js';
import { DerivedFact } from './DerivedFact.js';

export type QuantOpportunity = 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
export type IntelligenceRisk = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
export type ThesisState =
  | 'SUPPORTED'
  | 'MIXED'
  | 'CHALLENGED'
  | 'BROKEN'
  | 'UNRESOLVED'
  | 'EVALUATION_UNRESOLVED';

export type AllocationRecommendation =
  | 'FULL_TARGET_SIZING'     // Strong Quant + Low Risk + Strong Credibility
  | 'NORMAL_SIZING'          // Strong Quant + Low Risk + Generally Credible
  | 'CAPPED_ALLOCATION'      // Supported Thesis + INSUFFICIENT_HISTORY (-50% Sizing Cap)
  | 'CONSTRAINED_SIZING'     // Mixed Thesis (-50% Allocation, Tight Trailing Stops)
  | 'PROHIBITED_ENTRY'       // Challenged Thesis (Risk Overwhelms Alpha)
  | 'HARD_EXCLUSION_VETO'    // Broken Thesis (Active Breaker / Severe Contradiction)
  | 'GATED_ESCROW';          // Unresolved Thesis (Article 25: Thin Disclosures)

export interface ProvenanceNode {
  id: string;
  type: 'DECISION' | 'ALLOCATION' | 'THESIS' | 'RULE' | 'FACT' | 'CLAIM' | 'EVIDENCE' | 'DOCUMENT';
  refId: string;
  version?: string; // e.g. "2026.09" for versioned rules
  label: string;
}

export interface ProvenanceEdge {
  from: string;
  to: string;
  relation: 'DERIVED_FROM' | 'SUPPORTED_BY' | 'EVALUATED_BY' | 'CONSTRAINED_BY' | 'CONTRADICTED_BY';
}

export interface DecisionProvenanceDAG {
  rootDecisionId: string;
  nodes: ProvenanceNode[];
  edges: ProvenanceEdge[];
}

export interface PortfolioAllocationPolicy {
  directive: AllocationRecommendation;
  targetSizingCapRatio: number; // e.g. 1.0 (Full), 0.8 (Normal), 0.5 (Capped), 0.0 (Veto)
  policyRationale: string;
  policyVersion?: string; // "1.0"
}

export interface DecisionSnapshot {
  snapshotId: string;
  decisionId: string;
  issuerSymbol: string;
  evaluatedAt: string;
  decisionDate?: string;   // Historical cutoff date for information boundary filtering
  schemaVersion: string;   // "3.2"
  ontologyVersion: string; // "1.2"
  ruleSetVersion: string;  // "2026.09"
  policyVersion: string;   // "1.0"
  factVersion: string;
  claimVersion: string;

  // Genuine Replay State: Full Canonical Raw Input State for Cold-Storage Reconstruction
  rawInputFacts?: FinancialFact[];
  rawInputClaims?: any[];
  rawInputBreakers?: ThesisBreaker[];
  rawInputContradictions?: Contradiction[];
  rawQuantInput?: any;
  rawDerivedFacts?: DerivedFact[];

  // Reconstructed Outputs
  decisionState: DecisionState;
  portfolioPolicy: PortfolioAllocationPolicy;
  provenanceDAG: DecisionProvenanceDAG;
  provenanceHash: string;         // Legacy alias for canonicalStateHash
  canonicalStateHash: string;     // Cryptographic SHA-256 hash of canonical OUTPUT state

  // v3.2.1: Dual hashes for tamper-evidence and independent auditability
  rawInputHash?: string;          // SHA-256 of raw input facts + claims + versions + cutoff date (input side)
  decisionStateHash?: string;     // SHA-256 of reconstructed output state + policy + DAG (output side)
}

export interface DecisionProvenance {
  quantDerivation: string;
  riskDerivation: string;
  credibilityDerivation: string;
  breakerDerivation: string;
  thesisDerivation: string;
  allocationDerivation: string;
  auditTrail: string[];
}

export interface DecisionState {
  quantOpportunity: QuantOpportunity;
  intelligenceRisk: IntelligenceRisk;
  thesisState: ThesisState;
  managementCredibility: CredibilityGrade;
  activeThesisBreakers: number;
  criticalUnknowns: number;
  evidenceQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
  interpretation: string; // Strictly derived from the state combinations
  allocationRecommendation: AllocationRecommendation;
  portfolioPolicy?: PortfolioAllocationPolicy;
  provenance?: DecisionProvenance;
  provenanceDAG?: DecisionProvenanceDAG;
  decisionSnapshot?: DecisionSnapshot;
}

export type ExecutiveVerdict = 'POSITIVE' | 'MIXED' | 'NEGATIVE' | 'INSUFFICIENT_EVIDENCE';
export type DecisionImplication = 'SUPPORTS_THESIS' | 'CHALLENGES_THESIS' | 'NEUTRAL' | 'INSUFFICIENT_EVIDENCE';
export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface IntelligenceItem {
  headline: string;
  detail: string;
  sourceDocType: string;
  evidenceLineage: string;
  pageNumber?: number;
  significance: 'HIGH' | 'MEDIUM';
}

export interface InvestmentIntelligenceBrief {
  symbol: string;
  companyName: string;
  marketCapTier: 'LARGECAP' | 'MIDCAP' | 'SMALLCAP' | 'MICROCAP_SME';
  exchangeBoard: 'MAIN_BOARD' | 'SME_EXCHANGE';
  generatedAt: string;

  // Top-Level Two-Axis Decision State (10-second situational awareness)
  decisionState: DecisionState;

  // 1. Executive Assessment
  executiveAssessment: {
    overall: ExecutiveVerdict;
    confidence: ConfidenceTier;
    decisionImplication: DecisionImplication;
    oneLineSummary: string;
  };

  // 2. What Supports the Thesis (3–7 strongest evidenced items)
  thesisSupport: IntelligenceItem[];

  // 3. What Challenges the Thesis (3–7 strongest evidenced items)
  thesisChallenges: IntelligenceItem[];

  // 4. Walk-the-Talk Track Record
  walkTheTalk: ManagementCredibilityScorecard;

  // 5. Governance & Forensic Signals
  governanceSignals: Array<{
    parameter: string;
    finding: string;
    severity: 'CLEAN' | 'CAUTION' | 'ALARM';
    evidenceId: string;
  }>;

  // 6. External Intelligence (Disclosures, Ratings, Legal)
  externalIntelligence: Array<{
    date: string;
    source: string;
    headline: string;
    verified: boolean;
    sourceTier?: string;
  }>;

  // 7. Contradictions (Open, unresolved gaps)
  openContradictions: Contradiction[];

  // 8. Thesis Breakers
  thesisBreakers: ThesisBreaker[];

  // 9. Important Unknowns
  importantUnknowns: ImportantUnknown[];
}
