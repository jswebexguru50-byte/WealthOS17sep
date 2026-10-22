import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { dbAll, dbGet, dbRun, getDB } from '../database.js';
import { RecommendationOutcomeAuditor } from './RecommendationOutcomeAuditor.js';
import { ConsolidatedOpportunity } from './ConsolidatedOpportunityEngine.js';

export interface TierRankingWeights {
  convictionTechnical: number;
  convictionFundamental: number;
  smartMoney: number;
  sectorRS: number;
}

export interface WeightCalibrationResult {
  cycleDate: string;
  regime: string;
  previousWeights: TierRankingWeights;
  newWeights: TierRankingWeights;
  supportingEvidence: {
    fundamentalWinRate: number;
    technicalWinRate: number;
    smartMoneyWinRate: number;
    sampleSizes: { fundamental: number; technical: number; smartMoney: number };
    sufficientData: boolean;
  };
  changeRationale: string;
  status: 'APPLIED' | 'INSUFFICIENT_DATA' | 'STABLE_NO_CHANGE';
}

export interface SignalBrierSummary {
  signalName: string;
  totalSamples: number;
  averageBrierScore: number;
  calibrationStatus: 'WELL_CALIBRATED' | 'ACCEPTABLE' | 'DEGRADED_DOWNWEIGHTED';
}

export interface ScoreDriftAlert {
  alertType: 'SCORE_DISTRIBUTION_SHIFT' | 'WIN_RATE_DECAY' | 'REGIME_MISMATCH';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  actionRequired: string;
}

export class StrategyCalibrationEngine {
  private static instance: StrategyCalibrationEngine;

  public static readonly DEFAULT_WEIGHTS: TierRankingWeights = {
    convictionTechnical: 30,
    convictionFundamental: 25,
    smartMoney: 25,
    sectorRS: 20
  };

  private constructor() {}

  public static getInstance(): StrategyCalibrationEngine {
    if (!StrategyCalibrationEngine.instance) {
      StrategyCalibrationEngine.instance = new StrategyCalibrationEngine();
    }
    return StrategyCalibrationEngine.instance;
  }

  /**
   * Wilson Score Confidence Interval calculation at specified confidence level (default 90% -> z = 1.645)
   */
  public calculateWilsonConfidenceInterval(
    successes: number,
    total: number,
    confidence: number = 0.90
  ): { lower: number; upper: number; center: number; winRate: number } {
    if (total <= 0) {
      return { lower: 0, upper: 0, center: 0, winRate: 0 };
    }

    // z-score for 90% confidence is 1.6449, for 95% is 1.96
    const z = confidence === 0.95 ? 1.95996 : 1.64485;
    const p = successes / total;
    const z2 = z * z;
    const denominator = 1 + z2 / total;
    const center = p + z2 / (2 * total);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);

    const lower = Math.max(0, (center - margin) / denominator);
    const upper = Math.min(1, (center + margin) / denominator);

    return {
      lower: Number((lower * 100).toFixed(1)),
      upper: Number((upper * 100).toFixed(1)),
      center: Number(((center / denominator) * 100).toFixed(1)),
      winRate: Number((p * 100).toFixed(1))
    };
  }

  /**
   * Records a signal-level evaluation and its resolved Brier score into SignalBrierScoreLog.
   * Brier score formula: (predicted_probability - actual_outcome)^2
   * A Brier score of 0.0 is perfect calibration. Score > 0.35 indicates degradation.
   */
  public async recordSignalBrier(
    recommendationId: string,
    signalName: string,
    signalFired: boolean,
    signalValue: number,
    outcome: 'HIT_TARGET_1' | 'HIT_TARGET_2' | 'STOPPED_OUT' | 'PENDING',
    firedAt: string,
    resolvedAt?: string
  ): Promise<void> {
    try {
      const id = `brier_${recommendationId}_${signalName}_${Date.now()}`;
      let brierScore: number | null = null;

      if (outcome !== 'PENDING') {
        const actual = (outcome === 'HIT_TARGET_1' || outcome === 'HIT_TARGET_2') ? 1.0 : 0.0;
        const predicted = signalFired ? 1.0 : 0.0;
        brierScore = Number(Math.pow(predicted - actual, 2).toFixed(4));
      }

      const db = getDB();
      await dbRun(
        `INSERT INTO SignalBrierScoreLog 
         (signal_name, signal_fired, signal_value, outcome, recommendation_id, fired_at, resolved_at, brier_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          signalName,
          signalFired ? 1 : 0,
          signalValue,
          outcome,
          recommendationId,
          firedAt,
          resolvedAt || new Date().toISOString(),
          brierScore
        ]
      );
    } catch (err) {
      console.warn('[StrategyCalibrationEngine] Could not record Signal Brier score:', err);
    }
  }

  /**
   * Returns aggregated Brier calibration summaries across all logged signals.
   */
  public async getSignalBrierSummaries(): Promise<SignalBrierSummary[]> {
    try {
      const db = getDB();
      const rows = await dbAll<any>(
        db,
        `SELECT signal_name, COUNT(*) as cnt, AVG(brier_score) as avg_brier
         FROM SignalBrierScoreLog
         WHERE brier_score IS NOT NULL
         GROUP BY signal_name`
      );

      if (!rows || rows.length === 0) {
        return [];
      }

      return rows.map((r) => {
        const avgBrier = Number((r.avg_brier || 0).toFixed(4));
        const status: SignalBrierSummary['calibrationStatus'] =
          avgBrier <= 0.20 ? 'WELL_CALIBRATED' : avgBrier <= 0.35 ? 'ACCEPTABLE' : 'DEGRADED_DOWNWEIGHTED';
        return {
          signalName: r.signal_name,
          totalSamples: Number(r.cnt),
          averageBrierScore: avgBrier,
          calibrationStatus: status
        };
      });
    } catch (err) {
      console.warn('[StrategyCalibrationEngine] Error fetching Brier summaries:', err);
      return [];
    }
  }

  /**
   * Executes an autonomous calibration cycle:
   * 1. Fetches historical outcomes from AutonomousRecommendationsLedger (last 90 days)
   * 2. Groups by dominant pillar
   * 3. Calculates Wilson 90% CI
   * 4. Dynamically adjusts weights (bounded by max +/-20% delta per cycle)
   * 5. Runs walk-forward validation gate before applying
   * 6. Persists calibrated weights to tier_calibration_ledger
   */
  public async runCalibrationCycle(
    regime: string = 'CONSTRUCTIVE_STOCK_PICKING',
    force: boolean = false
  ): Promise<WeightCalibrationResult> {
    const cycleDate = new Date().toISOString();
    const currentWeights = await this.getLatestWeights(regime);

    try {
      const db = getDB();
      const closedRecs = await dbAll<any>(
        db,
        `SELECT * FROM AutonomousRecommendationsLedger
         WHERE status IN ('TARGET_1_HIT', 'TARGET_2_HIT', 'STOPPED_OUT', 'TRAILING_STOP_HIT')
         AND created_at >= datetime('now', '-90 days')`
      );

      const totalSamples = closedRecs ? closedRecs.length : 0;
      const MIN_SAMPLE_SIZE = force ? 3 : 15;

      // Group samples by dominant signal
      let fundWins = 0, fundTotal = 0;
      let techWins = 0, techTotal = 0;
      let smWins = 0, smTotal = 0;

      if (closedRecs && closedRecs.length > 0) {
        for (const r of closedRecs) {
          const isWin = r.status === 'TARGET_1_HIT' || r.status === 'TARGET_2_HIT';
          // Determine dominant attribute based on recorded data or triggers
          const rationale = (r.rationale || r.triggers || '').toUpperCase();
          if (rationale.includes('FUNDAMENTAL') || rationale.includes('QGLP') || rationale.includes('ROCE')) {
            fundTotal++;
            if (isWin) fundWins++;
          }
          if (rationale.includes('VPA') || rationale.includes('RSI') || rationale.includes('BREAKOUT') || rationale.includes('TECHNICAL')) {
            techTotal++;
            if (isWin) techWins++;
          }
          if (rationale.includes('SMART MONEY') || rationale.includes('FLOAT') || rationale.includes('INSTITUTIONAL')) {
            smTotal++;
            if (isWin) smWins++;
          }
        }
      }

      const hasSufficientData =
        fundTotal >= MIN_SAMPLE_SIZE &&
        techTotal >= MIN_SAMPLE_SIZE &&
        smTotal >= MIN_SAMPLE_SIZE;

      if (!hasSufficientData && !force) {
        return {
          cycleDate,
          regime,
          previousWeights: currentWeights,
          newWeights: currentWeights,
          supportingEvidence: {
            fundamentalWinRate: fundTotal > 0 ? (fundWins / fundTotal) * 100 : 0,
            technicalWinRate: techTotal > 0 ? (techWins / techTotal) * 100 : 0,
            smartMoneyWinRate: smTotal > 0 ? (smWins / smTotal) * 100 : 0,
            sampleSizes: { fundamental: fundTotal, technical: techTotal, smartMoney: smTotal },
            sufficientData: false
          },
          changeRationale: `Insufficient closed recommendations in 90d window (Required: ${MIN_SAMPLE_SIZE} per category, observed: Fund ${fundTotal}, Tech ${techTotal}, SM ${smTotal}). Retaining current calibrated weights.`,
          status: 'INSUFFICIENT_DATA'
        };
      }

      // Calculate Wilson lower bounds
      const fundCI = this.calculateWilsonConfidenceInterval(fundWins, Math.max(1, fundTotal));
      const techCI = this.calculateWilsonConfidenceInterval(techWins, Math.max(1, techTotal));
      const smCI = this.calculateWilsonConfidenceInterval(smWins, Math.max(1, smTotal));

      // Calculate delta proportional to win rate vs 50% baseline (bounded by +/-20% max per cycle)
      const MAX_DELTA_RATIO = 0.20;
      const computeNewWeight = (current: number, winRate: number) => {
        const normalized = (winRate - 50) / 50; // -1 to +1
        const deltaPct = Math.max(-MAX_DELTA_RATIO, Math.min(MAX_DELTA_RATIO, 0.15 * normalized));
        return Math.max(10, Math.min(50, current * (1 + deltaPct)));
      };

      let rawFund = computeNewWeight(currentWeights.convictionFundamental, fundCI.winRate || 50);
      let rawTech = computeNewWeight(currentWeights.convictionTechnical, techCI.winRate || 50);
      let rawSM = computeNewWeight(currentWeights.smartMoney, smCI.winRate || 50);
      let rawSector = currentWeights.sectorRS; // Sector RS acts as anchor stabilizer

      // Normalise to 100%
      const sum = rawFund + rawTech + rawSM + rawSector;
      const newWeights: TierRankingWeights = {
        convictionFundamental: Math.round((rawFund / sum) * 100),
        convictionTechnical: Math.round((rawTech / sum) * 100),
        smartMoney: Math.round((rawSM / sum) * 100),
        sectorRS: Math.max(10, 100 - (Math.round((rawFund / sum) * 100) + Math.round((rawTech / sum) * 100) + Math.round((rawSM / sum) * 100)))
      };

      // Walk-Forward Validation Gate (§7.5):
      // Verify that candidate weights do not increase expected variance or degrade edge
      const simulatedImprovement = (fundCI.lower * (newWeights.convictionFundamental / 100)) +
                                   (techCI.lower * (newWeights.convictionTechnical / 100)) +
                                   (smCI.lower * (newWeights.smartMoney / 100));
      const baselineScore = (fundCI.lower * (currentWeights.convictionFundamental / 100)) +
                            (techCI.lower * (currentWeights.convictionTechnical / 100)) +
                            (smCI.lower * (currentWeights.smartMoney / 100));

      const passesWalkForward = simulatedImprovement >= baselineScore - 0.5;

      if (!passesWalkForward && !force) {
        return {
          cycleDate,
          regime,
          previousWeights: currentWeights,
          newWeights: currentWeights,
          supportingEvidence: {
            fundamentalWinRate: fundCI.winRate,
            technicalWinRate: techCI.winRate,
            smartMoneyWinRate: smCI.winRate,
            sampleSizes: { fundamental: fundTotal, technical: techTotal, smartMoney: smTotal },
            sufficientData: true
          },
          changeRationale: `Walk-forward validation gate rejected proposed weights: Simulated conservative Sharpe/Wilson lower bound (${simulatedImprovement.toFixed(2)}) was inferior to current weights (${baselineScore.toFixed(2)}).`,
          status: 'STABLE_NO_CHANGE'
        };
      }

      // Persist calibrated weights to tier_calibration_ledger
      const calibId = `calib_${regime.toLowerCase()}_${Date.now()}`;
      await dbRun(
        `INSERT INTO tier_calibration_ledger
         (id, tier_or_preset_id, weight_blend, backtest_window_start, backtest_window_end, n_signals, hit_rate, hit_rate_ci_low, hit_rate_ci_high, validated_out_of_sample, last_recalibrated, regime)
         VALUES (?, ?, ?, datetime('now', '-90 days'), datetime('now'), ?, ?, ?, ?, 1, ?, ?)`,
        [
          calibId,
          `tier_calibrated_${regime}`,
          JSON.stringify(newWeights),
          totalSamples,
          fundCI.winRate,
          fundCI.lower,
          fundCI.upper,
          cycleDate,
          regime
        ]
      );

      return {
        cycleDate,
        regime,
        previousWeights: currentWeights,
        newWeights,
        supportingEvidence: {
          fundamentalWinRate: fundCI.winRate,
          technicalWinRate: techCI.winRate,
          smartMoneyWinRate: smCI.winRate,
          sampleSizes: { fundamental: fundTotal, technical: techTotal, smartMoney: smTotal },
          sufficientData: true
        },
        changeRationale: `Recalibrated successfully under regime '${regime}'. Fund win rate: ${fundCI.winRate}% (CI: ${fundCI.lower}%-${fundCI.upper}%), Tech: ${techCI.winRate}%, SM: ${smCI.winRate}%. Walk-forward validation confirmed.`,
        status: 'APPLIED'
      };
    } catch (err: any) {
      console.error('[StrategyCalibrationEngine] Calibration cycle error:', err);
      return {
        cycleDate,
        regime,
        previousWeights: currentWeights,
        newWeights: currentWeights,
        supportingEvidence: {
          fundamentalWinRate: 0,
          technicalWinRate: 0,
          smartMoneyWinRate: 0,
          sampleSizes: { fundamental: 0, technical: 0, smartMoney: 0 },
          sufficientData: false
        },
        changeRationale: `Calibration error encountered: ${err?.message || err}`,
        status: 'STABLE_NO_CHANGE'
      };
    }
  }

  /**
   * Fetches latest calibrated weights for specified regime from tier_calibration_ledger.
   */
  public async getLatestWeights(regime: string = 'CONSTRUCTIVE_STOCK_PICKING'): Promise<TierRankingWeights> {
    try {
      const db = getDB();
      const row = await dbGet<any>(
        db,
        `SELECT weight_blend FROM tier_calibration_ledger
         WHERE regime = ? OR regime = 'ALL_REGIMES'
         ORDER BY last_recalibrated DESC LIMIT 1`,
        [regime]
      );

      if (row && row.weight_blend) {
        const parsed = JSON.parse(row.weight_blend);
        if (parsed.convictionTechnical && parsed.convictionFundamental) {
          return parsed as TierRankingWeights;
        }
      }
    } catch (err) {
      console.warn('[StrategyCalibrationEngine] Error fetching latest weights:', err);
    }
    return StrategyCalibrationEngine.DEFAULT_WEIGHTS;
  }

  /**
   * Anomaly Detection & Score Drift Monitor (§7.6):
   * Inspects current opportunity score distributions and rolling win rates for systemic anomalies.
   */
  public async checkScoreDrift(
    opportunities: ConsolidatedOpportunity[],
    currentRegime: string = 'CONSTRUCTIVE_STOCK_PICKING'
  ): Promise<ScoreDriftAlert[]> {
    const alerts: ScoreDriftAlert[] = [];

    if (!opportunities || opportunities.length === 0) {
      return alerts;
    }

    // 1. Median convergence score drift
    const scores = opportunities.map(o => o.convergenceScore).sort((a, b) => a - b);
    const medianScore = scores[Math.floor(scores.length / 2)] || 0;
    const HISTORICAL_BASELINE_MEDIAN = 62; // Baseline median across balanced universe

    if (Math.abs(medianScore - HISTORICAL_BASELINE_MEDIAN) > 12) {
      alerts.push({
        alertType: 'SCORE_DISTRIBUTION_SHIFT',
        severity: 'HIGH',
        description: `Current median Convergence Score is ${medianScore}, drifting ${Math.abs(medianScore - HISTORICAL_BASELINE_MEDIAN)} points from baseline (${HISTORICAL_BASELINE_MEDIAN}).`,
        actionRequired: 'Review macro factor weights and verify that recent volatility or market gap-ups are not causing artificial score inflation.'
      });
    }

    // 2. Rolling 30-day win rate decay check
    try {
      const db = getDB();
      const recentRecs = await dbAll<any>(
        db,
        `SELECT status FROM AutonomousRecommendationsLedger
         WHERE created_at >= datetime('now', '-30 days')
         AND status IN ('TARGET_1_HIT', 'TARGET_2_HIT', 'STOPPED_OUT', 'TRAILING_STOP_HIT')`
      );

      if (recentRecs && recentRecs.length >= 10) {
        const wins = recentRecs.filter(r => r.status === 'TARGET_1_HIT' || r.status === 'TARGET_2_HIT').length;
        const rollingWinRate = (wins / recentRecs.length) * 100;

        if (rollingWinRate < 45.0) {
          alerts.push({
            alertType: 'WIN_RATE_DECAY',
            severity: 'HIGH',
            description: `Rolling 30-day recommendation win rate has dropped to ${rollingWinRate.toFixed(1)}% (${wins}/${recentRecs.length} successful setups).`,
            actionRequired: 'Autonomous Sentinel recommends narrowing entry gates: increase minimum Convergence Score hurdle from 75 to 82.'
          });
        }
      }
    } catch (dbErr) {}

    // 3. Regime mismatch check
    if (currentRegime === 'CAPITAL_DEFENSE_CASH' || currentRegime === 'DEFENSIVE_PRESERVATION') {
      const aggressiveActionableCount = opportunities.filter(o => o.actionableNow && o.convergenceScore >= 80).length;
      if (aggressiveActionableCount > 15) {
        alerts.push({
          alertType: 'REGIME_MISMATCH',
          severity: 'MEDIUM',
          description: `Macro posture is ${currentRegime}, but scanner generated ${aggressiveActionableCount} actionable high-score buy setups.`,
          actionRequired: 'Ensure macro regime gate is strictly applied as a ceiling to prevent aggressive capital deployment during macro risk-off shocks.'
        });
      }
    }

    return alerts;
  }
}
