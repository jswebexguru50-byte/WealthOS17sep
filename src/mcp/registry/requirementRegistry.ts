/**
 * WealthOS Requirement Registry
 * Master Developer Specification — Section X
 *
 * Provides structured access to all verified product requirements, acceptance criteria,
 * and test mappings without allowing the reviewer or developer to invent requirements.
 */

export interface RequirementItem {
  id: string;
  domain: string;
  title: string;
  description: string;
  classification: 'USER_SPECIFIED' | 'REPOSITORY_DOCUMENTED' | 'IMPLEMENTATION_CONTRACT' | 'PROPOSED_CHALLENGE';
  sourceDocument: string;
  acceptanceCriteria: string[];
  associatedSuites: string[];
  status: 'IMPLEMENTED' | 'PARTIAL' | 'PROPOSED';
}

export const WEALTHOS_REQUIREMENTS: RequirementItem[] = [
  {
    id: 'REQ-SEC-01',
    domain: 'SECURITY_IDENTITY',
    title: 'Canonical Security Identity & Collision Prevention',
    description: 'Every security must resolve to an exact ISIN and canonical symbol without ambiguous collisions (e.g. STYL vs STYLAMIND, BAJFINANCE vs BAJAJHFL).',
    classification: 'USER_SPECIFIED',
    sourceDocument: 'docs/strategies/S1A/S1A.original.txt, AGENTS.md',
    acceptanceCriteria: [
      'STYL resolves to INE04VU01023, STYLAMIND to INE239C01020',
      'No silent substitutions across tickers',
      'Pre-split and post-split ISINs resolve to single canonical entity'
    ],
    associatedSuites: ['laneA_security_identity'],
    status: 'IMPLEMENTED'
  },
  {
    id: 'REQ-FUND-01',
    domain: 'FUNDAMENTAL_TRUTH',
    title: 'Zero Synthetic Financial Data & Point-in-Time Traceability',
    description: 'All fundamental ratios and metrics must stem from verified CanonicalFacts. Missing data must honestly remain missing; no fabricated numbers or golden-company defaults.',
    classification: 'USER_SPECIFIED',
    sourceDocument: 'WealthOS V2 Specification',
    acceptanceCriteria: [
      'Missing facts produce DATA_INSUFFICIENT or null',
      'Sparse companies do not hallucinate fair values',
      '100% of reported facts link to provider, period_end, and unit'
    ],
    associatedSuites: ['laneB_fundamental_evidence'],
    status: 'IMPLEMENTED'
  },
  {
    id: 'REQ-MGMT-01',
    domain: 'WALK_THE_TALK',
    title: 'Management Commitment & Claim Tracking with Adverse Evidence',
    description: 'Track executive statements across quarterly calls and annual reports, classifying outcomes into MET, MISSED, PARTIALLY_MET, or ON_TRACK. Adverse evidence must never be scrubbed.',
    classification: 'REPOSITORY_DOCUMENTED',
    sourceDocument: 'docs/governance/management_commitments.md',
    acceptanceCriteria: [
      'TCS FY25 EBIT margin miss (24.4% vs 26-28% guidance) preserved as MISSED',
      'DYCL FY24 revenue guidance miss preserved as MISSED',
      'No narrative whitewashing'
    ],
    associatedSuites: ['laneC_management_audit'],
    status: 'IMPLEMENTED'
  },
  {
    id: 'REQ-STRAT-01',
    domain: 'TECHNICAL_STRATEGIES',
    title: 'S1A–S5A Technical Strategy Engine Preservation',
    description: 'Production strategies (S1A VPA 3-Leg, S1B Trough Reversal, S2A FVG/CE, S3A Breakout, S4B Gap, S5A Minervini) must execute verbatim according to strategy documents.',
    classification: 'USER_SPECIFIED',
    sourceDocument: 'AGENTS.md, docs/strategies/S1A/S1A.original.txt',
    acceptanceCriteria: [
      'S1A is distinct from S1 Base Breakout',
      'Formulas execute on real adjusted OHLCV bars',
      'Strategy scan outputs match reports/readiness/vpa_three_leg'
    ],
    associatedSuites: ['laneD_market_technical_strategies'],
    status: 'IMPLEMENTED'
  },
  {
    id: 'REQ-XIRR-01',
    domain: 'PORTFOLIO_XIRR',
    title: 'True Dated Cashflow XIRR Calculation',
    description: 'Portfolio and scrip XIRR must compute using exact trade and dividend dates, converging via Newton-Raphson with multiple starting guesses and secant/bisection fallbacks.',
    classification: 'IMPLEMENTATION_CONTRACT',
    sourceDocument: 'src/server/xirr.ts',
    acceptanceCriteria: [
      'Exact cashflow reconciliation with zero artificial smoothing',
      'Independent oracle reconciles within 0.005 tolerance'
    ],
    associatedSuites: ['xirr.test.ts'],
    status: 'IMPLEMENTED'
  },
  {
    id: 'REQ-TAX-01',
    domain: 'TAX_FIFO',
    title: 'Statutory Capital Gains FIFO & Section 112A Grandfathering',
    description: 'Compute LTCG and STCG strictly following Indian Income Tax provisions, incorporating Jan 31 2018 grandfathering FMV for pre-existing holdings.',
    classification: 'REPOSITORY_DOCUMENTED',
    sourceDocument: 'src/server/fifoEngine.ts',
    acceptanceCriteria: [
      'Exact FIFO lot depletion',
      'Section 112A grandfathering applied correctly',
      'No arbitrary tax assumptions'
    ],
    associatedSuites: ['fifoEngine.test.ts'],
    status: 'IMPLEMENTED'
  },
  {
    id: 'REQ-QGLP-01',
    domain: 'QGLP_ANALYSIS',
    title: 'Deterministic Motilal-Oswal QGLP Framework',
    description: 'Pillars Quality, Growth, Longevity, Price must evaluate deterministically from verified canonical facts. A pillar degrades to DATA_INSUFFICIENT if required inputs are missing.',
    classification: 'IMPLEMENTATION_CONTRACT',
    sourceDocument: 'src/server/services/QglpScoringService.ts',
    acceptanceCriteria: [
      'Fail-closed pillar evaluation',
      'No invented QGLP scores when metrics are unverified'
    ],
    associatedSuites: ['qglp_scoring.test.ts'],
    status: 'IMPLEMENTED'
  }
];

export class RequirementRegistry {
  static listRequirements(): RequirementItem[] {
    return WEALTHOS_REQUIREMENTS;
  }

  static getRequirement(id: string): RequirementItem | null {
    return WEALTHOS_REQUIREMENTS.find(r => r.id === id) || null;
  }
}
