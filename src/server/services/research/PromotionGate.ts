/**
 * WealthOS v6.6 - Promotion Gate
 * Agent J Deliverable
 * 
 * Strict multi-hurdle gate evaluating whether any candidate strategy or engine
 * qualifies for human review.
 * 
 * INVARIANTS:
 * - productionPromotionAuthorized: false strictly enforced.
 * - Promotion criteria evaluated per-engine and per-configuration.
 * - Requires human signoff; no autonomous production promotion permitted.
 */

import fs from 'fs';
import path from 'path';

export interface PromotionCandidateEvaluation {
  candidateId: string;
  tradeCount: number;
  netExpectancyR: number;
  profitFactor: number;
  maxDrawdownPct: number;
  calmarRatio: number;
  costSensitivity2xPass: boolean;
  regimeRobustnessPass: boolean;
  oosWalkForwardPass: boolean;
  bhFdrControlledPass: boolean;
  zeroPitViolations: boolean;
  zeroIdentityViolations: boolean;
  zeroUnresolvedGaps: boolean;
  qualifiedForHumanReview: boolean;
  rejectionReasons: string[];
}

export class PromotionGate {
  public readonly productionPromotionAuthorized: false = false;
  private readonly resultsPath: string;

  constructor() {
    this.resultsPath = path.join(process.cwd(), 'data', 'v66', 'promotion_gate_results.json');
    const dir = path.dirname(this.resultsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public evaluateCandidate(cand: Omit<PromotionCandidateEvaluation, 'qualifiedForHumanReview' | 'rejectionReasons'>): PromotionCandidateEvaluation {
    const reasons: string[] = [];

    if (cand.tradeCount < 150) {
      reasons.push(`Sample size insufficient: ${cand.tradeCount} < 150 required trades`);
    }
    if (cand.netExpectancyR < 0.20) {
      reasons.push(`Expectancy hurdle missed: ${cand.netExpectancyR}R < +0.20R net threshold`);
    }
    if (cand.profitFactor < 1.40) {
      reasons.push(`Profit factor too low: ${cand.profitFactor} < 1.40`);
    }
    if (cand.maxDrawdownPct > 20.0) {
      reasons.push(`Max drawdown exceeded: ${cand.maxDrawdownPct}% > 20.0% ceiling`);
    }
    if (cand.calmarRatio < 1.0) {
      reasons.push(`Calmar ratio too low: ${cand.calmarRatio} < 1.0`);
    }
    if (!cand.costSensitivity2xPass) {
      reasons.push('Failed 2.0x cost/slippage stress test');
    }
    if (!cand.regimeRobustnessPass) {
      reasons.push('Failed regime robustness evaluation (negative in chop/bear)');
    }
    if (!cand.oosWalkForwardPass) {
      reasons.push('Failed OOS Walk-Forward efficiency gate');
    }
    if (!cand.bhFdrControlledPass) {
      reasons.push('Failed Benjamini-Hochberg multiple testing correction');
    }
    if (!cand.zeroPitViolations) {
      reasons.push('FATAL: Point-in-time lookahead violations detected');
    }
    if (!cand.zeroIdentityViolations) {
      reasons.push('Security identity collisions or unresolved ISINs present');
    }
    if (!cand.zeroUnresolvedGaps) {
      reasons.push('Unresolved data gaps present in underlying series');
    }

    const qualified = reasons.length === 0;

    const evaluation: PromotionCandidateEvaluation = {
      ...cand,
      qualifiedForHumanReview: qualified,
      rejectionReasons: reasons
    };

    return evaluation;
  }

  public exportGateResults(evaluations: PromotionCandidateEvaluation[]): void {
    const payload = {
      evaluatedAt: new Date().toISOString(),
      governance: {
        productionPromotionAuthorized: false as const,
        humanReviewMandatory: true,
        auditGateVersion: 'v6.7.3-gate'
      },
      summary: {
        totalEvaluated: evaluations.length,
        qualifiedForHumanReview: evaluations.filter(e => e.qualifiedForHumanReview).length,
        rejectedCount: evaluations.filter(e => !e.qualifiedForHumanReview).length
      },
      evaluations
    };

    fs.writeFileSync(this.resultsPath, JSON.stringify(payload, null, 2), 'utf8');
  }
}
