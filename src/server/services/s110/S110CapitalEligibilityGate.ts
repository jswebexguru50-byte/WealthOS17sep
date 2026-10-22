import * as fs from 'fs';
import * as path from 'path';

export interface CapitalEligibilityRequest {
  candidateId: string;
  securityId: string;
  strategyId: string;
  kellyFractionUpperBound: number;
  portfolioRiskLimitNotional: number;
  capitalProtectionLimitNotional: number;
  liquidityCapacityLimitNotional: number;
  singleNameLimitNotional: number;
  capitalProtectionState: 'NORMAL' | 'ELEVATED' | 'HALTED';
}

export interface CapitalEligibilityResult {
  candidateId: string;
  capitalEligible: boolean; // Must remain FALSE in research/readiness mode
  authorizedNotional: number;
  constrainedBy: string;
  reason: string;
}

export class S110CapitalEligibilityGate {
  private static readonly HUMAN_CAPITAL_AUTHORIZATION_GRANTED = false;

  public static evaluateCapitalEligibility(req: CapitalEligibilityRequest): CapitalEligibilityResult {
    // 1. Compute effective upper bound using strictly min() constraint
    const kellyBound = req.kellyFractionUpperBound * 10000000; // ₹10M base budget
    const maxAllowedNotional = Math.min(
      kellyBound,
      req.portfolioRiskLimitNotional,
      req.capitalProtectionLimitNotional,
      req.liquidityCapacityLimitNotional,
      req.singleNameLimitNotional
    );

    // 2. Check CapitalProtectionEngine state
    if (req.capitalProtectionState === 'HALTED') {
      return {
        candidateId: req.candidateId,
        capitalEligible: false,
        authorizedNotional: 0,
        constrainedBy: 'CapitalProtectionEngine_HALTED',
        reason: 'Capital protection state is HALTED; zero capital authorized'
      };
    }

    // 3. Mandatory Governance Override: Capital eligibility remains FALSE without explicit human authorization
    if (!this.HUMAN_CAPITAL_AUTHORIZATION_GRANTED) {
      return {
        candidateId: req.candidateId,
        capitalEligible: false,
        authorizedNotional: 0,
        constrainedBy: 'RESEARCH_PROGRAM_GOVERNANCE_LOCK',
        reason: 'S110 is a research & data readiness program. Human capital authorization is FALSE.'
      };
    }

    return {
      candidateId: req.candidateId,
      capitalEligible: true,
      authorizedNotional: maxAllowedNotional,
      constrainedBy: 'KELLY_RISK_UPPER_BOUND',
      reason: 'Capital authorized subject to Kelly upper bound'
    };
  }
}
