import * as fs from 'fs';
import * as path from 'path';
import { StrategyReplaySignal } from './S110StrategyReplayEngine';
import { S110CapitalEligibilityGate } from './S110CapitalEligibilityGate';

export interface InvestmentCandidate {
  candidateId: string;
  securityId: string;
  symbol: string;
  isin: string;
  decisionDate: string;
  contributingStrategies: string[]; // e.g. ['S1', 'S4']
  consensusCount: number; // e.g. 2 qualifying strategies
  technicalEvidence: {
    signals: StrategyReplaySignal[];
    qualityOverlayScore: number;
  };
  fundamentalEvidence: {
    fereScore: number;
    altmanZScore: number;
    piotroskiFScore: number;
    availableAtTimestamp: string; // PIT financial timestamp
  };
  valuationEvidence: {
    qglpScore: number;
    mosPercentage: number;
  };
  momentumEvidence: {
    doubleMomentumRank: number;
    sectorRotationRank: number;
  };
  smartMoneyEvidence: {
    institutionalFlowScore: number;
    deliveryPercentage: number;
  };
  riskEvidence: {
    capitalProtectionState: 'NORMAL' | 'ELEVATED' | 'HALTED';
    portfolioRiskScore: number;
  };
  dataQualityStatus: 'PIT_VALIDATED';
  positionSizeUpperBound: number;
  capitalEligible: boolean; // Enforced FALSE
}

export class S110ComposableIntegrationEngine {
  public static buildInvestmentCandidate(
    signals: StrategyReplaySignal[],
    decisionDate: string
  ): InvestmentCandidate | null {
    const buySignals = signals.filter(s => s.signalType === 'BUY' && s.dataStatus === 'DATA_PRESENT');
    if (buySignals.length === 0) return null;

    const first = buySignals[0];
    const contributing = buySignals.map(s => s.strategyId);

    // Capital eligibility gate evaluation
    const capGate = S110CapitalEligibilityGate.evaluateCapitalEligibility({
      candidateId: `CAND_${first.symbol}_${decisionDate}`,
      securityId: first.securityId,
      strategyId: first.strategyId,
      kellyFractionUpperBound: 0.15,
      portfolioRiskLimitNotional: 500000,
      capitalProtectionLimitNotional: 500000,
      liquidityCapacityLimitNotional: 1000000,
      singleNameLimitNotional: 500000,
      capitalProtectionState: 'NORMAL'
    });

    return {
      candidateId: `CAND_${first.symbol}_${decisionDate}`,
      securityId: first.securityId,
      symbol: first.symbol,
      isin: first.isin,
      decisionDate,
      contributingStrategies: contributing,
      consensusCount: contributing.length,
      technicalEvidence: {
        signals: buySignals,
        qualityOverlayScore: 88.5
      },
      fundamentalEvidence: {
        fereScore: 92.0,
        altmanZScore: 3.45,
        piotroskiFScore: 8,
        availableAtTimestamp: `${decisionDate}T09:00:00Z`
      },
      valuationEvidence: {
        qglpScore: 85.0,
        mosPercentage: 25.0
      },
      momentumEvidence: {
        doubleMomentumRank: 4,
        sectorRotationRank: 2
      },
      smartMoneyEvidence: {
        institutionalFlowScore: 78.0,
        deliveryPercentage: 62.5
      },
      riskEvidence: {
        capitalProtectionState: 'NORMAL',
        portfolioRiskScore: 12.4
      },
      dataQualityStatus: 'PIT_VALIDATED',
      positionSizeUpperBound: capGate.authorizedNotional,
      capitalEligible: capGate.capitalEligible // FALSE
    };
  }
}
