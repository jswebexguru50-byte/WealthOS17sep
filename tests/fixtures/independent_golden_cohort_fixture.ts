/**
 * independent_golden_cohort_fixture.ts
 *
 * ORACLE 0: Independent Ground Truth Specification Fixture.
 *
 * Manually audited and mathematically specified ground-truth dataset for all 20 Phase 2 companies.
 * This fixture is completely decoupled from the production application runtime.
 * Tests evaluate production engine outputs against this independent ground truth.
 */

export interface GoldenCompanyProfile {
  symbol: string;
  name: string;
  itasScore: number;
  expectedQuantOpportunity: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
  expectedIntelligenceRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
  expectedThesisState: 'SUPPORTED' | 'MIXED' | 'CHALLENGED' | 'BROKEN' | 'UNRESOLVED';
  expectedCredibilityGrade: 'STRONG' | 'GENERALLY_CREDIBLE' | 'WEAK' | 'INSUFFICIENT_HISTORY';
  expectedAllocationDirective:
    | 'FULL_TARGET_SIZING'
    | 'NORMAL_SIZING'
    | 'CAPPED_ALLOCATION'
    | 'CONSTRAINED_SIZING'
    | 'PROHIBITED_ENTRY'
    | 'HARD_EXCLUSION_VETO'
    | 'GATED_ESCROW';
  maxTargetAllocationRatio: number;
  activeBreakersCount: number;
  openContradictionsCount: number;
  primaryBreakerId: string;
  primaryBreakerExpectedStatus: 'ACTIVE' | 'INACTIVE' | 'EVALUATION_UNRESOLVED' | 'EVIDENCE_UNKNOWN';
  claims: Array<{
    claimId: string;
    metric: string;
    targetValue: number;
    targetTemporalSemantics: 'DEADLINE' | 'YEAR_END' | 'PERIOD' | 'ONGOING';
    deadline: string;
    expectedOutcome: 'ACHIEVED' | 'ACHIEVED_EARLY' | 'MISSED' | 'NOT_DUE' | 'NOT_COMPARABLE';
  }>;
}

export const INDEPENDENT_GOLDEN_COHORT: Record<string, GoldenCompanyProfile> = {
  SOLARINDS: {
    symbol: 'SOLARINDS',
    name: 'Solar Industries India Limited',
    itasScore: 96,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'LOW',
    expectedThesisState: 'SUPPORTED',
    expectedCredibilityGrade: 'STRONG',
    expectedAllocationDirective: 'FULL_TARGET_SIZING',
    maxTargetAllocationRatio: 1.0,
    activeBreakersCount: 0,
    openContradictionsCount: 0,
    primaryBreakerId: 'TB_SOLAR_LEVERAGE',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: [
      {
        claimId: 'CLM_SOLAR_01',
        metric: 'DEFENSE_ORDER_BOOK',
        targetValue: 1000,
        targetTemporalSemantics: 'DEADLINE',
        deadline: '2025-03-31',
        expectedOutcome: 'ACHIEVED_EARLY'
      },
      {
        claimId: 'CLM_SOLAR_02',
        metric: 'EBITDA_MARGIN',
        targetValue: 22,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'ACHIEVED'
      }
    ]
  },

  ARVSMART: {
    symbol: 'ARVSMART',
    name: 'Arvind SmartSpaces Limited',
    itasScore: 89,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'LOW',
    expectedThesisState: 'SUPPORTED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'CAPPED_ALLOCATION',
    maxTargetAllocationRatio: 0.5,
    activeBreakersCount: 0,
    openContradictionsCount: 0,
    primaryBreakerId: 'TB_ARV_LEVERAGE',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: [
      {
        claimId: 'CLM_ARV_01',
        metric: 'PRE_SALES',
        targetValue: 1000,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'ACHIEVED'
      }
    ]
  },

  NOVARTIND: {
    symbol: 'NOVARTIND',
    name: 'Novartis India Limited',
    itasScore: 85,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'LOW',
    expectedThesisState: 'SUPPORTED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'CAPPED_ALLOCATION',
    maxTargetAllocationRatio: 0.5,
    activeBreakersCount: 0,
    openContradictionsCount: 0,
    primaryBreakerId: 'TB_NOV_DEBT',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: [
      {
        claimId: 'CLM_NOV_01',
        metric: 'DIVIDEND_PAYOUT',
        targetValue: 85,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'ACHIEVED'
      }
    ]
  },

  BAJAJHLDNG: {
    symbol: 'BAJAJHLDNG',
    name: 'Bajaj Holdings & Investment Limited',
    itasScore: 92,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'LOW',
    expectedThesisState: 'SUPPORTED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'CAPPED_ALLOCATION',
    maxTargetAllocationRatio: 0.5,
    activeBreakersCount: 0,
    openContradictionsCount: 0,
    primaryBreakerId: 'TB_BAJ_PLEDGE',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: [
      {
        claimId: 'CLM_BAJ_01',
        metric: 'PROMOTER_PLEDGE',
        targetValue: 0,
        targetTemporalSemantics: 'ONGOING',
        deadline: '2024-03-31',
        expectedOutcome: 'ACHIEVED'
      }
    ]
  },

  UNOMINDA: {
    symbol: 'UNOMINDA',
    name: 'UNO Minda Limited',
    itasScore: 90,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'LOW',
    expectedThesisState: 'SUPPORTED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'CAPPED_ALLOCATION',
    maxTargetAllocationRatio: 0.5,
    activeBreakersCount: 0,
    openContradictionsCount: 0,
    primaryBreakerId: 'TB_UNO_LEVERAGE',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: [
      {
        claimId: 'CLM_UNO_01',
        metric: 'EV_KIT_VALUE',
        targetValue: 20000,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'ACHIEVED'
      }
    ]
  },

  VMART: {
    symbol: 'VMART',
    name: 'V-Mart Retail Limited',
    itasScore: 81,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'CRITICAL',
    expectedThesisState: 'BROKEN',
    expectedCredibilityGrade: 'WEAK',
    expectedAllocationDirective: 'HARD_EXCLUSION_VETO',
    maxTargetAllocationRatio: 0.0,
    activeBreakersCount: 1,
    openContradictionsCount: 1,
    primaryBreakerId: 'TB_VMART_LEVERAGE',
    primaryBreakerExpectedStatus: 'ACTIVE',
    claims: [
      {
        claimId: 'CLM_VMART_01',
        metric: 'UNLIMITED_EBITDA',
        targetValue: 0,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'MISSED'
      }
    ]
  },

  TATATECH: {
    symbol: 'TATATECH',
    name: 'Tata Technologies Limited',
    itasScore: 88,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'MODERATE',
    expectedThesisState: 'MIXED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'CONSTRAINED_SIZING',
    maxTargetAllocationRatio: 0.5,
    activeBreakersCount: 0,
    openContradictionsCount: 1,
    primaryBreakerId: 'TB_TT_GROWTH',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: [
      {
        claimId: 'CLM_TT_01',
        metric: 'REVENUE_GROWTH_PCT',
        targetValue: 18,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'MISSED'
      }
    ]
  },

  HINDCOPPER: {
    symbol: 'HINDCOPPER',
    name: 'Hindustan Copper Limited',
    itasScore: 86,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'HIGH',
    expectedThesisState: 'CHALLENGED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'PROHIBITED_ENTRY',
    maxTargetAllocationRatio: 0.0,
    activeBreakersCount: 0,
    openContradictionsCount: 1,
    primaryBreakerId: 'TB_HC_MINING_HALT',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: [
      {
        claimId: 'CLM_HC_01',
        metric: 'ORE_PRODUCTION_MTPA',
        targetValue: 5.0,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'MISSED'
      }
    ]
  },

  SCI: {
    symbol: 'SCI',
    name: 'Shipping Corporation of India Limited',
    itasScore: 87,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'HIGH',
    expectedThesisState: 'CHALLENGED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'PROHIBITED_ENTRY',
    maxTargetAllocationRatio: 0.0,
    activeBreakersCount: 0,
    openContradictionsCount: 1,
    primaryBreakerId: 'TB_SCI_FREIGHT_COLLAPSE',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: [
      {
        claimId: 'CLM_SCI_01',
        metric: 'STRATEGIC_DISINVESTMENT',
        targetValue: 1,
        targetTemporalSemantics: 'DEADLINE',
        deadline: '2024-03-31',
        expectedOutcome: 'MISSED'
      }
    ]
  },

  BOROLTD: {
    symbol: 'BOROLTD',
    name: 'Borosil Limited',
    itasScore: 88,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'MODERATE',
    expectedThesisState: 'MIXED',
    expectedCredibilityGrade: 'GENERALLY_CREDIBLE',
    expectedAllocationDirective: 'CONSTRAINED_SIZING',
    maxTargetAllocationRatio: 0.5,
    activeBreakersCount: 0,
    openContradictionsCount: 1,
    primaryBreakerId: 'TB_BORO_LEVERAGE',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: [
      {
        claimId: 'CLM_BORO_01',
        metric: 'FURNACE_COMMISSIONING',
        targetValue: 1,
        targetTemporalSemantics: 'DEADLINE',
        deadline: '2024-03-31',
        expectedOutcome: 'MISSED'
      }
    ]
  },

  PURVA: {
    symbol: 'PURVA',
    name: 'Puravankara Limited',
    itasScore: 91,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'CRITICAL',
    expectedThesisState: 'BROKEN',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'HARD_EXCLUSION_VETO',
    maxTargetAllocationRatio: 0.0,
    activeBreakersCount: 1,
    openContradictionsCount: 1,
    primaryBreakerId: 'TB_PURVA_LEVERAGE',
    primaryBreakerExpectedStatus: 'ACTIVE',
    claims: [
      {
        claimId: 'CLM_PURVA_01',
        metric: 'NET_DEBT_REDUCTION',
        targetValue: 2000,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'MISSED'
      }
    ]
  },

  STLNETWORK: {
    symbol: 'STLNETWORK',
    name: 'Sterlite Technologies Limited',
    itasScore: 82,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'CRITICAL',
    expectedThesisState: 'BROKEN',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'HARD_EXCLUSION_VETO',
    maxTargetAllocationRatio: 0.0,
    activeBreakersCount: 1,
    openContradictionsCount: 1,
    primaryBreakerId: 'TB_STL_LEVERAGE',
    primaryBreakerExpectedStatus: 'ACTIVE',
    claims: [
      {
        claimId: 'CLM_STL_01',
        metric: 'DEBT_TO_EBITDA',
        targetValue: 2.5,
        targetTemporalSemantics: 'ONGOING',
        deadline: '2024-03-31',
        expectedOutcome: 'MISSED'
      }
    ]
  },

  SENCO: {
    symbol: 'SENCO',
    name: 'Senco Gold Limited',
    itasScore: 87,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'LOW',
    expectedThesisState: 'SUPPORTED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'CAPPED_ALLOCATION',
    maxTargetAllocationRatio: 0.5,
    activeBreakersCount: 0,
    openContradictionsCount: 0,
    primaryBreakerId: 'TB_SENCO_WC_UTIL',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: [
      {
        claimId: 'CLM_SENCO_01',
        metric: 'STORE_EXPANSION',
        targetValue: 20,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'ACHIEVED'
      }
    ]
  },

  GMDCLTD: {
    symbol: 'GMDCLTD',
    name: 'Gujarat Mineral Development Corporation Limited',
    itasScore: 80,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'HIGH',
    expectedThesisState: 'CHALLENGED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'PROHIBITED_ENTRY',
    maxTargetAllocationRatio: 0.0,
    activeBreakersCount: 0,
    openContradictionsCount: 1,
    primaryBreakerId: 'TB_GMDC_CLEARANCE',
    primaryBreakerExpectedStatus: 'EVALUATION_UNRESOLVED',
    claims: [
      {
        claimId: 'CLM_GMDC_01',
        metric: 'BAITRA_MINING_START',
        targetValue: 1,
        targetTemporalSemantics: 'DEADLINE',
        deadline: '2024-03-31',
        expectedOutcome: 'MISSED'
      }
    ]
  },

  '360ONE': {
    symbol: '360ONE',
    name: '360 ONE WAM Limited',
    itasScore: 89,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'MODERATE',
    expectedThesisState: 'MIXED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'CONSTRAINED_SIZING',
    maxTargetAllocationRatio: 0.5,
    activeBreakersCount: 0,
    openContradictionsCount: 1,
    primaryBreakerId: 'TB_360ONE_YIELD',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: [
      {
        claimId: 'CLM_360ONE_01',
        metric: 'ARR_FEE_YIELD_BPS',
        targetValue: 58,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'MISSED'
      }
    ]
  },

  MANORAMA: {
    symbol: 'MANORAMA',
    name: 'Manorama Industries Limited',
    itasScore: 86,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'UNKNOWN',
    expectedThesisState: 'UNRESOLVED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'GATED_ESCROW',
    maxTargetAllocationRatio: 0.0,
    activeBreakersCount: 0,
    openContradictionsCount: 0,
    primaryBreakerId: 'TB_MANO_DEBT',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: []
  },

  IKIO: {
    symbol: 'IKIO',
    name: 'IKIO Lighting Limited',
    itasScore: 83,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'CRITICAL',
    expectedThesisState: 'BROKEN',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'HARD_EXCLUSION_VETO',
    maxTargetAllocationRatio: 0.0,
    activeBreakersCount: 1,
    openContradictionsCount: 1,
    primaryBreakerId: 'TB_IKIO_CONC',
    primaryBreakerExpectedStatus: 'ACTIVE',
    claims: [
      {
        claimId: 'CLM_IKIO_01',
        metric: 'CLIENT_DIVERSIFICATION',
        targetValue: 50,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'MISSED'
      }
    ]
  },

  THOMASCOOK: {
    symbol: 'THOMASCOOK',
    name: 'Thomas Cook (India) Limited',
    itasScore: 88,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'LOW',
    expectedThesisState: 'SUPPORTED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'CAPPED_ALLOCATION',
    maxTargetAllocationRatio: 0.5,
    activeBreakersCount: 0,
    openContradictionsCount: 0,
    primaryBreakerId: 'TB_TC_LEVERAGE',
    primaryBreakerExpectedStatus: 'INACTIVE',
    claims: [
      {
        claimId: 'CLM_TC_01',
        metric: 'EBITDA_RECOVERY',
        targetValue: 250,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'ACHIEVED'
      }
    ]
  },

  RPGLIFE: {
    symbol: 'RPGLIFE',
    name: 'RPG Life Sciences Limited',
    itasScore: 89,
    expectedQuantOpportunity: 'STRONG',
    expectedIntelligenceRisk: 'LOW',
    expectedThesisState: 'SUPPORTED',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'CAPPED_ALLOCATION',
    maxTargetAllocationRatio: 0.5,
    activeBreakersCount: 0,
    openContradictionsCount: 0,
    primaryBreakerId: 'TB_RPG_REGULATORY',
    primaryBreakerExpectedStatus: 'EVALUATION_UNRESOLVED',
    claims: [
      {
        claimId: 'CLM_RPG_01',
        metric: 'PBT_MARGIN_EXPANSION',
        targetValue: 20,
        targetTemporalSemantics: 'PERIOD',
        deadline: '2024-03-31',
        expectedOutcome: 'ACHIEVED'
      }
    ]
  },

  KAVVERITEL: {
    symbol: 'KAVVERITEL',
    name: 'Kavveri Telecom Products Limited',
    itasScore: 25,
    expectedQuantOpportunity: 'WEAK',
    expectedIntelligenceRisk: 'CRITICAL',
    expectedThesisState: 'BROKEN',
    expectedCredibilityGrade: 'INSUFFICIENT_HISTORY',
    expectedAllocationDirective: 'HARD_EXCLUSION_VETO',
    maxTargetAllocationRatio: 0.0,
    activeBreakersCount: 1,
    openContradictionsCount: 1,
    primaryBreakerId: 'TB_KAV_NETWORTH',
    primaryBreakerExpectedStatus: 'ACTIVE',
    claims: [
      {
        claimId: 'CLM_KAV_01',
        metric: 'DEBT_RESTRUCTURING',
        targetValue: 1,
        targetTemporalSemantics: 'DEADLINE',
        deadline: '2024-03-31',
        expectedOutcome: 'MISSED'
      }
    ]
  }
};
