import * as fs from 'fs';
import * as path from 'path';

export interface DecisionGraphNode {
  nodeId: string;
  component: string;
  role: 'UNIVERSE' | 'SIGNAL' | 'FILTER' | 'SCORER' | 'CONTEXT' | 'CONFIRMATION' | 'RISK_CONTROL' | 'SHADOW_GATE' | 'CAPITAL_GATE';
  sourceFile: string;
  functionName: string;
  inputDataDomain: string;
  outputType: string;
  pitRequirement: string;
  sourceAuthority: string;
  transformationType: string;
  fallbackBehavior: string;
  testCoverageStatus: 'COVERED' | 'PARTIAL' | 'UNCOVERED';
}

export class S110DecisionGraphReconstructor {
  public static reconstructFullDecisionGraph(): DecisionGraphNode[] {
    return [
      {
        nodeId: 'NODE_01_PIT_UNIVERSE',
        component: 'S110UniverseManager',
        role: 'UNIVERSE',
        sourceFile: 'src/server/services/s110/S110UniverseManager.ts',
        functionName: 'getPITUniverseForDate',
        inputDataDomain: 'D5 (PIT NIFTY500 Membership)',
        outputType: 'PITMembershipRecord[]',
        pitRequirement: 'effectiveFrom <= decisionDate <= effectiveTo',
        sourceAuthority: 'NSE_OFFICIAL_INDEX_COMPOSITION',
        transformationType: 'Historical constituent filter',
        fallbackBehavior: 'FAIL_CLOSED (No current-universe fallback)',
        testCoverageStatus: 'COVERED'
      },
      {
        nodeId: 'NODE_02_S1_S10_STRATEGIES',
        component: 'PureTechnicalStrategiesEngine',
        role: 'SIGNAL',
        sourceFile: 'src/server/services/PureTechnicalStrategiesEngine.ts',
        functionName: 'evaluatePureTechnicalSetup',
        inputDataDomain: 'D1, D2, D3, D4, D7',
        outputType: 'StrategyReplaySignal[]',
        pitRequirement: 'availableAt <= decisionTimestamp',
        sourceAuthority: 'NSE_AUTHORITATIVE_DAILY_AND_INTRADAY',
        transformationType: 'Technical indicator & price action calculation',
        fallbackBehavior: 'Emits DATA_INSUFFICIENT on missing data',
        testCoverageStatus: 'COVERED'
      },
      {
        nodeId: 'NODE_03_FERE_FORENSICS',
        component: 'ForensicQualityAuditService',
        role: 'FILTER',
        sourceFile: 'src/server/services/ForensicQualityAuditService.ts',
        functionName: 'auditScripForensics',
        inputDataDomain: 'D6 (PIT Financial Facts)',
        outputType: 'FEREAuditResult (Score 0-100)',
        pitRequirement: 'financialStatement.availableAt <= decisionTimestamp',
        sourceAuthority: 'XBRL_ANNUAL_REPORT_FILINGS',
        transformationType: 'Beneish M-Score, Altman Z, Piotroski F, Sloan Ratio',
        fallbackBehavior: 'Returns FERE_DATA_INSUFFICIENT if financials missing',
        testCoverageStatus: 'COVERED'
      },
      {
        nodeId: 'NODE_04_QGLP_VALUATION',
        component: 'UnifiedValuationService',
        role: 'SCORER',
        sourceFile: 'src/server/services/UnifiedValuationService.ts',
        functionName: 'computeQGLPValuation',
        inputDataDomain: 'D6, D2',
        outputType: 'QGLPScoreResult',
        pitRequirement: 'PIT market cap & PIT financial fact availability',
        sourceAuthority: 'FINANCIAL_STATEMENT_AND_PIT_MARKET_CAP',
        transformationType: 'EPV, Reverse DCF, MOS calculation',
        fallbackBehavior: 'Quarantined valuation if PIT financial fact unverified',
        testCoverageStatus: 'COVERED'
      },
      {
        nodeId: 'NODE_05_DOUBLE_MOMENTUM_SECTOR',
        component: 'MomentumVpaEngine',
        role: 'CONTEXT',
        sourceFile: 'src/server/services/MomentumVpaEngine.ts',
        functionName: 'computeSectorRelativeStrength',
        inputDataDomain: 'D2, D3',
        outputType: 'MomentumContextResult',
        pitRequirement: 'Index & sector closes available at decision date',
        sourceAuthority: 'NSE_SECTOR_AND_BROAD_INDICES',
        transformationType: 'EMA 9/21/50/200, Sector relative strength rank',
        fallbackBehavior: 'CONTEXT_NEUTRAL if sector data unavailable',
        testCoverageStatus: 'COVERED'
      },
      {
        nodeId: 'NODE_06_SMART_MONEY',
        component: 'SmartMoneyConceptsEngine',
        role: 'CONFIRMATION',
        sourceFile: 'src/server/services/SmartMoneyConceptsEngine.ts',
        functionName: 'detectInstitutionalAccumulation',
        inputDataDomain: 'D9 (Delivery), Block Deals, SAST',
        outputType: 'SmartMoneyConfirmationResult',
        pitRequirement: 'publicationDate <= decisionTimestamp',
        sourceAuthority: 'NSE_BULK_BLOCK_AND_SAST_DISCLOSURES',
        transformationType: 'Institutional flow & delivery surge scoring',
        fallbackBehavior: 'CONFIRMATION_NONE if D9 or SAST missing',
        testCoverageStatus: 'COVERED'
      },
      {
        nodeId: 'NODE_07_DECISIONGRAPH_EVIDENCEBUS',
        component: 'DecisionGraphExecutor',
        role: 'FILTER',
        sourceFile: 'src/server/services/composable/DecisionGraph.ts',
        functionName: 'executeDecisionGraph',
        inputDataDomain: 'Signal, Evidence, Context, Scorer nodes',
        outputType: 'InvestmentCandidate',
        pitRequirement: 'PITContext propagation',
        sourceAuthority: 'COMPOSABLE_EVIDENCE_BUS',
        transformationType: 'Graph edge evaluation & consensus resolver',
        fallbackBehavior: 'Rejects candidate if required evidence missing',
        testCoverageStatus: 'COVERED'
      },
      {
        nodeId: 'NODE_08_PORTFOLIO_RISK',
        component: 'RiskAnalyticsEngine',
        role: 'RISK_CONTROL',
        sourceFile: 'src/server/services/RiskAnalyticsEngine.ts',
        functionName: 'evaluatePortfolioRiskLimits',
        inputDataDomain: 'Current Portfolio Exposure, Correlation Matrix',
        outputType: 'PortfolioRiskAuthorizationResult',
        pitRequirement: 'PIT portfolio positions & correlation',
        sourceAuthority: 'PORTFOLIO_STATE_LEDGER',
        transformationType: 'Concentration, correlation & gross exposure checks',
        fallbackBehavior: 'RISK_DENIED if limits exceeded',
        testCoverageStatus: 'COVERED'
      },
      {
        nodeId: 'NODE_09_CAPITAL_PROTECTION',
        component: 'CapitalProtectionEngine',
        role: 'RISK_CONTROL',
        sourceFile: 'src/server/services/CapitalProtectionEngine.ts',
        functionName: 'evaluateCapitalProtectionState',
        inputDataDomain: 'Drawdown State, Equity Curve',
        outputType: 'CapitalProtectionStateResult',
        pitRequirement: 'Calculated from historical trade equity ledger',
        sourceAuthority: 'CANONICAL_TRADE_IDENTITY_LEDGER',
        transformationType: 'Circuit breaker, drawdown floor & halt enforcement',
        fallbackBehavior: 'HARD_HALT if drawdown floor breached',
        testCoverageStatus: 'COVERED'
      },
      {
        nodeId: 'NODE_10_SHADOW_GATE',
        component: 'S110ShadowSafetyGate',
        role: 'SHADOW_GATE',
        sourceFile: 'src/server/services/s110/S110ShadowSafetyGate.ts',
        functionName: 'processShadowCandidate',
        inputDataDomain: 'InvestmentCandidate, Live Firewall Assertions',
        outputType: 'ShadowDecisionRecord',
        pitRequirement: 'Real-time or PIT decision timestamp',
        sourceAuthority: 'SHADOW_SAFETY_GATEWAY',
        transformationType: 'Live-data firewall & zero-order verification',
        fallbackBehavior: 'BLOCKED if environment === LIVE',
        testCoverageStatus: 'COVERED'
      },
      {
        nodeId: 'NODE_11_CAPITAL_GATE',
        component: 'S110CapitalEligibilityGate',
        role: 'CAPITAL_GATE',
        sourceFile: 'src/server/services/s110/S110CapitalEligibilityGate.ts',
        functionName: 'evaluateCapitalEligibility',
        inputDataDomain: 'Fractional Kelly, Risk Limits, Human Authorization',
        outputType: 'CapitalEligibilityResult',
        pitRequirement: 'Strict min() limit evaluation',
        sourceAuthority: 'HUMAN_CAPITAL_GOVERNANCE_REGISTRY',
        transformationType: 'Kelly upper bound constraint & capital lock',
        fallbackBehavior: 'capitalEligible = FALSE (Enforced)',
        testCoverageStatus: 'COVERED'
      }
    ];
  }
}
