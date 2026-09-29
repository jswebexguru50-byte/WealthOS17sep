/**
 * RiskEngine.ts — Section 14 Company Risk Intelligence
 *
 * Evaluates structural and emerging risks for a company across:
 * - BUSINESS, FINANCIAL, MANAGEMENT, REGULATORY, COMPETITIVE, VALUATION, EXECUTION, BALANCE_SHEET
 *
 * Constitution:
 * - Do NOT equate contradictions with all risks (contradictions are data discrepancies; risks are forward-looking threats)
 * - Evidence-linked for every active risk
 * - Avoid fake precision (coarse categories: LOW / MEDIUM / HIGH)
 */

import { EvidenceReference } from '../contracts/Provenance.js';
import { Contradiction } from '../contracts/ContradictionContracts.js';
import { CompanyAnalyticalState } from '../assembler/CompanyAnalyticalStateAssembler.js';

export type RiskCategory =
  | 'BUSINESS'
  | 'FINANCIAL'
  | 'MANAGEMENT'
  | 'REGULATORY'
  | 'COMPETITIVE'
  | 'VALUATION'
  | 'EXECUTION'
  | 'BALANCE_SHEET';

export type RiskState =
  | 'ACTIVE'
  | 'INCREASING'
  | 'DECREASING'
  | 'RESOLVED'
  | 'UNKNOWN';

export interface CompanyRisk {
  riskId: string;
  title: string;
  category: RiskCategory;
  state: RiskState;
  probability?: 'LOW' | 'MEDIUM' | 'HIGH';
  impact?: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
  evidence: EvidenceReference[];
  linkedPillars: string[];
}

export interface RiskResult {
  securityId: string;
  risks: CompanyRisk[];
  activeCount: number;
  highImpactCount: number;
  evaluatedAt: string;
}

export class RiskEngine {
  private static instance: RiskEngine;

  private constructor() {}

  public static getInstance(): RiskEngine {
    if (!RiskEngine.instance) {
      RiskEngine.instance = new RiskEngine();
    }
    return RiskEngine.instance;
  }

  /**
   * Synthesizes company risks from active contradictions, operating metrics, and sector risk profiles.
   */
  public evaluate(params: {
    securityId: string;
    symbol: string;
    businessModel: string;
    state?: CompanyAnalyticalState;
    contradictions?: Contradiction[];
    valuationPercentile?: number | null;
  }): RiskResult {
    const { securityId, symbol, businessModel, state, contradictions = [], valuationPercentile } = params;
    const now = new Date().toISOString();

    const risks: CompanyRisk[] = [];

    // 1. Convert material contradictions into active risks
    for (const c of contradictions) {
      if (c.status === 'OPEN') {
        let category: RiskCategory = 'FINANCIAL';
        if (c.patternId === 'GUIDANCE_VS_ACTUAL' || c.patternId === 'DEMAND_NARRATIVE_VS_KPI') {
          category = 'MANAGEMENT';
        } else if (c.patternId === 'DELEVERAGING_CLAIM_VS_DEBT') {
          category = 'BALANCE_SHEET';
        } else if (c.patternId === 'CAPACITY_VS_UTILISATION') {
          category = 'EXECUTION';
        }

        risks.push({
          riskId: `risk_con_${c.contradictionId.substring(0, 8)}`,
          title: c.observationB.substring(0, 80),
          category,
          state: 'ACTIVE',
          probability: c.severity === 'MATERIAL' ? 'HIGH' : 'MEDIUM',
          impact: c.severity === 'MATERIAL' ? 'HIGH' : 'MEDIUM',
          explanation: c.explanation,
          evidence: c.evidence,
          linkedPillars: [],
        });
      }
    }

    // Historical-valuation percentile is intentionally not emitted as a live
    // risk until the valuation adapter supplies its persisted source facts as
    // evidence.  A calculated label is not evidence by itself.

    const activeCount = risks.filter(r => r.state === 'ACTIVE' || r.state === 'INCREASING').length;
    const highImpactCount = risks.filter(r => r.impact === 'HIGH').length;

    return {
      securityId,
      risks,
      activeCount,
      highImpactCount,
      evaluatedAt: now,
    };
  }

}
