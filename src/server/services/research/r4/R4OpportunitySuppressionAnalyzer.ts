import { R4ReplayedTrade } from './R4CandidateEngine';

export interface SuppressionReport {
  experimentId: string;
  totalTrades: number;
  retainedTrades: number;
  suppressedTrades: number;
  winnerSuppression: {
    totalBaselineWinners: number;
    winnersRetained: number;
    winnersSuppressed: number;
    winnerSuppressionRatePct: number;
    grossProfitLostRupees: number;
  };
  loserSuppression: {
    totalBaselineLosers: number;
    losersRetained: number;
    losersSuppressed: number;
    loserSuppressionRatePct: number;
    lossAvoidedRupees: number;
  };
  tailOutcomes: {
    largeWinnersThresholdR: number;
    totalLargeWinners: number;
    largeWinnersSuppressed: number;
    largeWinnerSuppressionRatePct: number;
    largeLosersThresholdR: number;
    totalLargeLosers: number;
    largeLosersSuppressed: number;
    tailLossSuppressionRatePct: number;
  };
  economicTradeOff: {
    netSuppressionBenefitRupees: number;
    suppressionEfficiencyRatio: number; // lossAvoided / grossProfitLost
    verdict: 'FAVORABLE_SUPPRESSION' | 'HARMFUL_OPPORTUNITY_DESTRUCTION' | 'NEUTRAL_FILTER';
  };
}

export class R4OpportunitySuppressionAnalyzer {
  public static analyze(experimentId: string, replayedTrades: R4ReplayedTrade[]): SuppressionReport {
    let baselineWinners = 0;
    let baselineLosers = 0;
    let winnersRetained = 0;
    let winnersSuppressed = 0;
    let losersRetained = 0;
    let losersSuppressed = 0;

    let grossProfitLost = 0;
    let lossAvoided = 0;

    let totalLargeWinners = 0;
    let largeWinnersSuppressed = 0;
    let totalLargeLosers = 0;
    let largeLosersSuppressed = 0;

    const LARGE_WINNER_R = 1.5;
    const LARGE_LOSER_R = -1.0;

    for (const t of replayedTrades) {
      const isWin = t.net > 0;
      const isLargeWin = t.strategyStopRiskR >= LARGE_WINNER_R;
      const isLargeLoss = t.strategyStopRiskR <= LARGE_LOSER_R;

      if (isWin) {
        baselineWinners++;
        if (isLargeWin) totalLargeWinners++;

        if (t.isRetained) {
          winnersRetained++;
        } else {
          winnersSuppressed++;
          grossProfitLost += t.net;
          if (isLargeWin) largeWinnersSuppressed++;
        }
      } else {
        baselineLosers++;
        if (isLargeLoss) totalLargeLosers++;

        if (t.isRetained) {
          losersRetained++;
        } else {
          losersSuppressed++;
          lossAvoided += Math.abs(t.net);
          if (isLargeLoss) largeLosersSuppressed++;
        }
      }
    }

    const winnerSuppRate = baselineWinners > 0 ? (winnersSuppressed / baselineWinners) * 100 : 0;
    const loserSuppRate = baselineLosers > 0 ? (losersSuppressed / baselineLosers) * 100 : 0;
    const largeWinSuppRate = totalLargeWinners > 0 ? (largeWinnersSuppressed / totalLargeWinners) * 100 : 0;
    const tailLossSuppRate = totalLargeLosers > 0 ? (largeLosersSuppressed / totalLargeLosers) * 100 : 0;

    const netBenefit = lossAvoided - grossProfitLost;
    const efficiency = grossProfitLost > 0 ? lossAvoided / grossProfitLost : lossAvoided > 0 ? 999 : 1;

    let verdict: SuppressionReport['economicTradeOff']['verdict'] = 'NEUTRAL_FILTER';
    if (largeWinSuppRate > 40 && netBenefit < 0) {
      verdict = 'HARMFUL_OPPORTUNITY_DESTRUCTION';
    } else if (netBenefit > 0 && efficiency > 1.2) {
      verdict = 'FAVORABLE_SUPPRESSION';
    } else {
      verdict = 'NEUTRAL_FILTER';
    }

    return {
      experimentId,
      totalTrades: replayedTrades.length,
      retainedTrades: winnersRetained + losersRetained,
      suppressedTrades: winnersSuppressed + losersSuppressed,
      winnerSuppression: {
        totalBaselineWinners: baselineWinners,
        winnersRetained,
        winnersSuppressed,
        winnerSuppressionRatePct: Math.round(winnerSuppRate * 100) / 100,
        grossProfitLostRupees: Math.round(grossProfitLost * 100) / 100
      },
      loserSuppression: {
        totalBaselineLosers: baselineLosers,
        losersRetained,
        losersSuppressed,
        loserSuppressionRatePct: Math.round(loserSuppRate * 100) / 100,
        lossAvoidedRupees: Math.round(lossAvoided * 100) / 100
      },
      tailOutcomes: {
        largeWinnersThresholdR: LARGE_WINNER_R,
        totalLargeWinners,
        largeWinnersSuppressed,
        largeWinnerSuppressionRatePct: Math.round(largeWinSuppRate * 100) / 100,
        largeLosersThresholdR: LARGE_LOSER_R,
        totalLargeLosers,
        largeLosersSuppressed,
        tailLossSuppressionRatePct: Math.round(tailLossSuppRate * 100) / 100
      },
      economicTradeOff: {
        netSuppressionBenefitRupees: Math.round(netBenefit * 100) / 100,
        suppressionEfficiencyRatio: Math.round(efficiency * 100) / 100,
        verdict
      }
    };
  }
}
