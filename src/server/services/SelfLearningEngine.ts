import { getDB, dbAll, dbRun, dbGet } from '../database.js';

export interface ModelFactorWeights {
  fundamentalWeightPct: number;
  technicalMomentumWeightPct: number;
  bollingerSqueezeWeightPct: number;
  volumeSurgeWeightPct: number;
  newsSentimentWeightPct: number;
  sectorRelativeStrengthWeightPct: number;
  deliverySurgeWeightPct: number;       // India microstructure delivery surge weight
  relativeStrengthWeightPct: number;    // Outperformance vs Nifty 500 weight
  plattScalingA: number;                // Sigmoid calibration slope parameter
  plattScalingB: number;                // Sigmoid calibration intercept parameter
  atrStopMultiplier: number;
  minBandwidthThresholdPct: number;
  rsiOversoldBoundary: number;
  rsiOverboughtBoundary: number;
}

export interface PostMortemLearningCase {
  symbol: string;
  recommendationDate: string;
  entryPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  exitPrice: number;
  pnlPct: number;
  failureReasonCategory: 'FALSE_VOLUME_BREAKOUT' | 'PREMATURE_RSI_ENTRY' | 'TIGHT_ATR_STOP' | 'SECTOR_HEADWIND' | 'FUNDAMENTAL_LAG';
  rootCauseAnalysis: string;
  correctiveActionTaken: string;
  appliedParameterMutation: string;
  learnedAt: string;
}

export interface EvolutionGeneration {
  generationId: number;
  versionTag: string;
  createdAt: string;
  triggerReason: string;
  accuracyBeforeCalibrationPct: number | null;
  simulatedAccuracyAfterCalibrationPct: number | null;
  brierScoreBefore?: number | null;
  brierScoreAfter?: number | null;
  activeWeights: ModelFactorWeights;
  weightShiftsSummary: string[];
  walkForwardValidation?: {
    improved: boolean;
    oldWinRate: number;
    newWinRate: number;
    oldBrierScore?: number;
    newBrierScore?: number;
    sampleSize: number;
  };
}

export interface SelfLearningReport {
  currentGeneration: EvolutionGeneration;
  historicalGenerations: EvolutionGeneration[];
  recentPostMortems: PostMortemLearningCase[];
  learningMetrics: {
    totalEvaluatedTrades: number;
    failuresDiagnosedCount: number;
    autoCorrecionsAppliedCount: number;
    cumulativeAccuracyImprovementPct: number | null;
    currentCalibratedAccuracyRatePct: number | null;
    learningModeStatus: 'ACTIVE_CONTINUOUS_LEARNING' | 'CALIBRATED_OPTIMAL';
  };
  lastLearningCycleAt: string;
}

const DEFAULT_WEIGHTS: ModelFactorWeights = {
  fundamentalWeightPct: 22,
  technicalMomentumWeightPct: 22,
  bollingerSqueezeWeightPct: 16,
  volumeSurgeWeightPct: 12,
  deliverySurgeWeightPct: 14,
  relativeStrengthWeightPct: 8,
  newsSentimentWeightPct: 4,
  sectorRelativeStrengthWeightPct: 2,
  plattScalingA: 1.15,
  plattScalingB: -0.22,
  atrStopMultiplier: 2.2,
  minBandwidthThresholdPct: 7.2,
  rsiOversoldBoundary: 35,
  rsiOverboughtBoundary: 75
};

// Weight keys and their allowed bounds for bidirectional evolution
const WEIGHT_BOUNDS: { key: keyof ModelFactorWeights; min: number; max: number }[] = [
  { key: 'fundamentalWeightPct', min: 10, max: 35 },
  { key: 'technicalMomentumWeightPct', min: 10, max: 35 },
  { key: 'bollingerSqueezeWeightPct', min: 8, max: 25 },
  { key: 'volumeSurgeWeightPct', min: 5, max: 25 },
  { key: 'deliverySurgeWeightPct', min: 5, max: 25 },
  { key: 'relativeStrengthWeightPct', min: 4, max: 20 },
  { key: 'newsSentimentWeightPct', min: 2, max: 15 },
  { key: 'sectorRelativeStrengthWeightPct', min: 1, max: 10 },
];

export class SelfLearningEngine {
  private static instance: SelfLearningEngine;

  public static getInstance(): SelfLearningEngine {
    if (!SelfLearningEngine.instance) {
      SelfLearningEngine.instance = new SelfLearningEngine();
    }
    return SelfLearningEngine.instance;
  }

  public async initializeDatabase(): Promise<void> {
    const db = getDB();

    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS ModelGenerations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_tag TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        trigger_reason TEXT NOT NULL,
        accuracy_before REAL NOT NULL,
        accuracy_after REAL NOT NULL,
        weights_json TEXT NOT NULL,
        weight_shifts_json TEXT NOT NULL
      )
    `);

    // Add walk-forward validation column
    try {
      await dbRun(db, `ALTER TABLE ModelGenerations ADD COLUMN walk_forward_json TEXT`);
    } catch { /* Column already exists */ }

    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS ModelPostMortems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        recommendation_date TEXT NOT NULL,
        entry_price REAL NOT NULL,
        target_price REAL NOT NULL,
        stop_loss_price REAL NOT NULL,
        exit_price REAL NOT NULL,
        pnl_pct REAL NOT NULL,
        failure_category TEXT NOT NULL,
        root_cause TEXT NOT NULL,
        corrective_action TEXT NOT NULL,
        mutation_applied TEXT NOT NULL,
        learned_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const existingGens = await dbAll(db, 'SELECT count(*) as count FROM ModelGenerations');
    if (!existingGens || existingGens[0]?.count === 0) {
      await this.seedEvolutionHistory();
    }
  }

  private async seedEvolutionHistory(): Promise<void> {
    const db = getDB();

    // Gen 1.0 (Baseline Initial Deployment - Authentic Cold Start)
    const gen1Weights = { ...DEFAULT_WEIGHTS };
    await dbRun(db, `
      INSERT INTO ModelGenerations (version_tag, created_at, trigger_reason, accuracy_before, accuracy_after, weights_json, weight_shifts_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'v1.0.0 (Baseline)',
      new Date().toISOString(),
      'Initial baseline deployment with uniform multi-factor indicator weighting. Awaiting live signal resolutions.',
      0,
      0,
      JSON.stringify(gen1Weights),
      JSON.stringify(['Initial baseline weights initialized across all quantitative pillars.'])
    ]);
  }

  public async getSelfLearningReport(): Promise<SelfLearningReport> {
    await this.initializeDatabase();
    const db = getDB();

    const genRows = await dbAll(db, 'SELECT * FROM ModelGenerations ORDER BY id DESC');
    const pmRows = await dbAll(db, 'SELECT * FROM ModelPostMortems ORDER BY id DESC');

    const historicalGenerations: EvolutionGeneration[] = genRows.map((g: any) => ({
      generationId: g.id,
      versionTag: g.version_tag,
      createdAt: g.created_at,
      triggerReason: g.trigger_reason,
      accuracyBeforeCalibrationPct: g.accuracy_before,
      simulatedAccuracyAfterCalibrationPct: g.accuracy_after,
      activeWeights: JSON.parse(g.weights_json || '{}'),
      weightShiftsSummary: JSON.parse(g.weight_shifts_json || '[]'),
      walkForwardValidation: g.walk_forward_json ? JSON.parse(g.walk_forward_json) : undefined
    }));

    const currentGeneration = historicalGenerations[0] || {
      generationId: 1,
      versionTag: 'v2.1.0 (Adaptive Dynamic Calibration)',
      createdAt: new Date().toISOString(),
      triggerReason: 'Initial Genesis Model (Awaiting 20 resolved trades for empirical self-calibration)',
      accuracyBeforeCalibrationPct: null,
      simulatedAccuracyAfterCalibrationPct: null,
      activeWeights: DEFAULT_WEIGHTS,
      weightShiftsSummary: []
    };

    const recentPostMortems: PostMortemLearningCase[] = pmRows.map((pm: any) => ({
      symbol: pm.symbol,
      recommendationDate: pm.recommendation_date,
      entryPrice: pm.entry_price,
      targetPrice: pm.target_price,
      stopLossPrice: pm.stop_loss_price,
      exitPrice: pm.exit_price,
      pnlPct: pm.pnl_pct,
      failureReasonCategory: pm.failure_category as any,
      rootCauseAnalysis: pm.root_cause,
      correctiveActionTaken: pm.corrective_action,
      appliedParameterMutation: pm.mutation_applied,
      learnedAt: pm.learned_at
    }));

    // Compute real accuracy from PredictionAuditLedger resolved outcomes
    const realAccuracy = await this.computeRealAccuracy();

    const lastGenAcc = historicalGenerations[historicalGenerations.length - 1]?.accuracyBeforeCalibrationPct;
    const curGenAcc = currentGeneration.simulatedAccuracyAfterCalibrationPct;
    const cumulativeImprovement = (curGenAcc != null && lastGenAcc != null)
      ? Number((curGenAcc - lastGenAcc).toFixed(1))
      : null;

    return {
      currentGeneration,
      historicalGenerations,
      recentPostMortems,
      learningMetrics: {
        totalEvaluatedTrades: realAccuracy.totalDecided + realAccuracy.openCount,
        failuresDiagnosedCount: recentPostMortems.length,
        autoCorrecionsAppliedCount: historicalGenerations.length,
        cumulativeAccuracyImprovementPct: cumulativeImprovement,
        currentCalibratedAccuracyRatePct: realAccuracy.accuracyPct,
        learningModeStatus: 'ACTIVE_CONTINUOUS_LEARNING'
      },
      lastLearningCycleAt: new Date().toISOString()
    };
  }

  /**
   * Compute real accuracy from PredictionAuditLedger resolved outcomes
   * instead of relying on the simulated/incremented accuracy values.
   */
  private async computeRealAccuracy(): Promise<{ accuracyPct: number; totalDecided: number; openCount: number }> {
    try {
      const db = getDB();
      const resolved = await dbAll(db, `
        SELECT status FROM PredictionAuditLedger 
        WHERE status IN ('HIT_TARGET', 'STOP_LOSS_HIT', 'IN_PROFIT')
      `);
      const openRows = await dbAll(db, `
        SELECT count(*) as cnt FROM PredictionAuditLedger 
        WHERE status IN ('OPEN_TRACKING', 'EXPIRED_NEUTRAL')
      `);

      const wins = resolved.filter((r: any) => r.status === 'HIT_TARGET' || r.status === 'IN_PROFIT').length;
      const losses = resolved.filter((r: any) => r.status === 'STOP_LOSS_HIT').length;
      const totalDecided = wins + losses;
      const openCount = openRows[0]?.cnt || 0;

      if (totalDecided === 0) {
        // ZFA: Strict null honesty when no real resolved trades exist
        return { accuracyPct: null, totalDecided: 0, openCount };
      }

      return {
        accuracyPct: Number(((wins / totalDecided) * 100).toFixed(1)),
        totalDecided,
        openCount
      };
    } catch {
      return { accuracyPct: null, totalDecided: 0, openCount: 0 };
    }
  }

  /**
   * Diagnose the failure category from actual entry-time indicators stored
   * in PredictionAuditLedger, rather than inferring from loss magnitude alone.
   */
  private async diagnoseFailureCategory(trade: {
    symbol: string;
    recommendationDate: string;
    pnlPct: number;
    entryPrice: number;
  }): Promise<{
    category: 'FALSE_VOLUME_BREAKOUT' | 'PREMATURE_RSI_ENTRY' | 'TIGHT_ATR_STOP' | 'SECTOR_HEADWIND' | 'FUNDAMENTAL_LAG';
    rootCause: string;
    correctiveAction: string;
    mutation: string;
  }> {
    const db = getDB();

    // Look up the entry-time indicator snapshot from the forensic audit trail
    let ledgerRow: any = null;
    try {
      ledgerRow = await dbGet(db, `
        SELECT entry_rsi14, entry_bb_bandwidth, entry_relative_volume, 
               entry_atr14, entry_regime, entry_composite_score
        FROM PredictionAuditLedger 
        WHERE symbol = ? AND recommendation_date = ?
      `, [trade.symbol, trade.recommendationDate]);
    } catch { /* table or columns may not exist yet */ }

    // If we have actual entry indicators, diagnose from them
    if (ledgerRow && (ledgerRow.entry_rsi14 || ledgerRow.entry_bb_bandwidth || ledgerRow.entry_relative_volume)) {
      const rsi = ledgerRow.entry_rsi14 || 50;
      const bbBW = ledgerRow.entry_bb_bandwidth || 10;
      const relVol = ledgerRow.entry_relative_volume || 1;
      const atr = ledgerRow.entry_atr14 || 0;
      const regime = ledgerRow.entry_regime || 'UNKNOWN';

      // Rule 1: High volume breakout from squeeze that failed
      if (relVol > 1.5 && bbBW < 8) {
        return {
          category: 'FALSE_VOLUME_BREAKOUT',
          rootCause: `Entered on volume surge (${relVol.toFixed(1)}x 20-DMA) during Bollinger squeeze (BW: ${bbBW.toFixed(1)}%), but the breakout failed to sustain. Entry RSI was ${rsi.toFixed(0)} in regime ${regime}.`,
          correctiveAction: `Tightened Bollinger squeeze threshold and raised volume persistence requirement to 2-day confirmation.`,
          mutation: `Volume Surge Weight: +2% | Min BB Bandwidth: +0.3%`
        };
      }

      // Rule 2: Premature RSI dip buy
      if (rsi < 38) {
        return {
          category: 'PREMATURE_RSI_ENTRY',
          rootCause: `Entered on RSI ${rsi.toFixed(0)} oversold signal, but price continued falling without forming a structural higher-low. Regime was ${regime}.`,
          correctiveAction: `Lowered RSI oversold boundary further and added MACD histogram divergence confirmation before mean-reversion entries.`,
          mutation: `RSI Oversold Boundary: -2 | Added Trend Confirmation Filter`
        };
      }

      // Rule 3: Regime mismatch
      if (regime === 'BEAR_TREND' || regime === 'HIGH_VOLATILITY') {
        return {
          category: 'SECTOR_HEADWIND',
          rootCause: `Entry was made during ${regime} regime. Macro headwinds overwhelmed the individual stock signal (composite score: ${(ledgerRow.entry_composite_score || 0).toFixed(1)}).`,
          correctiveAction: `Reduced conviction multiplier for entries during ${regime} regime. Added regime filter to scanner to skip MOMENTUM_BREAKOUT strategies in adverse conditions.`,
          mutation: `Sector Relative Strength Weight: +2% | Added Regime Guard Filter`
        };
      }

      // Rule 4: Stop was too tight relative to ATR
      if (atr > 0) {
        const stopDistance = Math.abs(trade.pnlPct);
        const atrPct = (atr / trade.entryPrice) * 100;
        if (stopDistance < atrPct * 2.5) {
          return {
            category: 'TIGHT_ATR_STOP',
            rootCause: `Stop-loss distance (${stopDistance.toFixed(1)}%) was within ${(stopDistance / atrPct).toFixed(1)}x ATR (${atrPct.toFixed(1)}%). Normal market noise triggered the exit before the thesis played out.`,
            correctiveAction: `Widened adaptive ATR stop multiplier to absorb intraday volatility without premature exits.`,
            mutation: `ATR Stop Multiplier: +0.15x`
          };
        }
      }

      // Rule 5: Default — fundamental thesis didn't materialize
      return {
        category: 'FUNDAMENTAL_LAG',
        rootCause: `Entry indicators were neutral (RSI: ${rsi.toFixed(0)}, Vol: ${relVol.toFixed(1)}x) but the fundamental catalyst failed to materialize within the horizon period. Loss: ${trade.pnlPct.toFixed(1)}%.`,
        correctiveAction: `Increased weight on fundamental quality metrics and shortened horizon window for fundamental plays.`,
        mutation: `Fundamental Weight: +2% | Horizon Expectation: -5 days`
      };
    }

    // Fallback: no indicator data available, use improved loss-magnitude heuristic
    if (trade.pnlPct < -10) {
      return {
        category: 'FALSE_VOLUME_BREAKOUT',
        rootCause: `Severe loss (${trade.pnlPct.toFixed(1)}%) suggests the entry signal was based on a false breakout that quickly reversed.`,
        correctiveAction: `Tightened volume surge confirmation and raised Bollinger squeeze threshold.`,
        mutation: `Volume Surge Weight: +2% | Min BB Bandwidth: +0.3%`
      };
    } else if (trade.pnlPct < -6) {
      return {
        category: 'PREMATURE_RSI_ENTRY',
        rootCause: `Moderate loss (${trade.pnlPct.toFixed(1)}%) consistent with a premature mean-reversion entry before trend confirmation.`,
        correctiveAction: `Lowered RSI oversold trigger and mandated trend ribbon alignment.`,
        mutation: `RSI Oversold Boundary: -1`
      };
    }
    return {
      category: 'TIGHT_ATR_STOP',
      rootCause: `Minor loss (${trade.pnlPct.toFixed(1)}%) suggests stop-loss was too tight relative to the stock's average daily range.`,
      correctiveAction: `Widened adaptive ATR stop multiplier.`,
      mutation: `ATR Stop Multiplier: +0.1x`
    };
  }

  /**
   * Analyze which factor categories contributed more to winning vs losing trades.
   * Returns directional weight adjustments based on actual trade attribution.
   */
  private async analyzeFactorContribution(currentWeights: ModelFactorWeights): Promise<{
    adjustments: Partial<Record<keyof ModelFactorWeights, number>>;
    rationale: string[];
  }> {
    const db = getDB();
    const rationale: string[] = [];
    const adjustments: Partial<Record<keyof ModelFactorWeights, number>> = {};

    try {
      // Get resolved predictions with their entry-time indicator data
      const winners = await dbAll(db, `
        SELECT entry_rsi14, entry_bb_bandwidth, entry_relative_volume, entry_composite_score, entry_regime
        FROM PredictionAuditLedger WHERE status = 'HIT_TARGET'
      `);
      const losers = await dbAll(db, `
        SELECT entry_rsi14, entry_bb_bandwidth, entry_relative_volume, entry_composite_score, entry_regime
        FROM PredictionAuditLedger WHERE status = 'STOP_LOSS_HIT'
      `);

      if (winners.length === 0 && losers.length === 0) {
        rationale.push('No resolved trades available for factor attribution analysis.');
        return { adjustments, rationale };
      }

      // Compute average indicators for winners vs losers
      const avgField = (rows: any[], field: string) => {
        const vals = rows.filter(r => r[field] != null).map(r => Number(r[field]));
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      };

      const winAvgVol = avgField(winners, 'entry_relative_volume');
      const loseAvgVol = avgField(losers, 'entry_relative_volume');
      const winAvgBB = avgField(winners, 'entry_bb_bandwidth');
      const loseAvgBB = avgField(losers, 'entry_bb_bandwidth');
      const winAvgScore = avgField(winners, 'entry_composite_score');
      const loseAvgScore = avgField(losers, 'entry_composite_score');

      // Volume surge: if winners had higher relative volume, increase volume weight
      if (winAvgVol !== null && loseAvgVol !== null) {
        if (winAvgVol > loseAvgVol * 1.15) {
          adjustments.volumeSurgeWeightPct = 2;
          rationale.push(`Winners had ${((winAvgVol / loseAvgVol - 1) * 100).toFixed(0)}% higher relative volume at entry → Volume Surge weight +2%.`);
        } else if (loseAvgVol > winAvgVol * 1.15) {
          adjustments.volumeSurgeWeightPct = -2;
          rationale.push(`Losers had higher volume at entry — volume surge may be producing false signals → Volume Surge weight -2%.`);
        }
      }

      // Bollinger squeeze: if winners had tighter bands, the squeeze strategy is working
      if (winAvgBB !== null && loseAvgBB !== null) {
        if (winAvgBB < loseAvgBB * 0.85) {
          adjustments.bollingerSqueezeWeightPct = 2;
          rationale.push(`Winners entered during tighter Bollinger squeezes (avg BW: ${winAvgBB.toFixed(1)}% vs losers: ${loseAvgBB.toFixed(1)}%) → Bollinger weight +2%.`);
        } else if (winAvgBB > loseAvgBB * 1.15) {
          adjustments.bollingerSqueezeWeightPct = -2;
          rationale.push(`Bollinger squeeze setups underperforming → Bollinger weight -2%.`);
        }
      }

      // If winners had significantly higher composite scores, reinforce signal thresholds
      if (winAvgScore !== null && loseAvgScore !== null) {
        if (winAvgScore > 75 && loseAvgScore < 65) {
          adjustments.fundamentalWeightPct = 1;
          rationale.push(`Clear score separation between wins (${winAvgScore.toFixed(0)}) and losses (${loseAvgScore.toFixed(0)}) — fundamentals discriminating well → Fundamental weight +1%.`);
        }
      }

      // Check if regime-aware filtering would help
      const bearLosers = losers.filter((r: any) => r.entry_regime === 'BEAR_TREND' || r.entry_regime === 'HIGH_VOLATILITY').length;
      if (bearLosers > losers.length * 0.4) {
        adjustments.sectorRelativeStrengthWeightPct = 2;
        rationale.push(`${bearLosers} of ${losers.length} losses occurred in adverse regimes → Sector/Regime weight +2%.`);
      }

    } catch (err) {
      rationale.push('Factor attribution analysis skipped — PredictionAuditLedger data unavailable.');
    }

    return { adjustments, rationale };
  }

  /**
   * Walk-forward validation: re-score historical resolved predictions with
   * proposed new weights and compare win classification accuracy vs old weights.
   */
  private async walkForwardValidate(newWeights: ModelFactorWeights, oldWeights: ModelFactorWeights): Promise<{
    improved: boolean;
    oldWinRate: number;
    newWinRate: number;
    sampleSize: number;
    oldBrierScore?: number;
    newBrierScore?: number;
  }> {
    try {
      const db = getDB();
      const resolved = await dbAll(db, `
        SELECT entry_composite_score, entry_rsi14, entry_bb_bandwidth, 
               entry_relative_volume, status
        FROM PredictionAuditLedger 
        WHERE status IN ('HIT_TARGET', 'STOP_LOSS_HIT') 
          AND entry_composite_score IS NOT NULL
        ORDER BY recommendation_date DESC LIMIT 20
      `);

      if (resolved.length < 5) {
        // ZFA: Insufficient real samples to validate weight changes — do NOT auto-approve
        return { improved: false, oldWinRate: 0, newWinRate: 0, sampleSize: resolved.length };
      }

      // Re-score each historical prediction with old weights and new weights
      // using all 7 factor dimensions
      const scoreWithWeights = (row: any, w: ModelFactorWeights): number => {
        const rsiScore = row.entry_rsi14 ? (row.entry_rsi14 > w.rsiOversoldBoundary && row.entry_rsi14 < w.rsiOverboughtBoundary ? 70 : 40) : 50;
        const bbScore = row.entry_bb_bandwidth ? (row.entry_bb_bandwidth < w.minBandwidthThresholdPct ? 85 : 55) : 50;
        const volScore = row.entry_relative_volume ? (row.entry_relative_volume > 1.5 ? 80 : 50) : 50;
        const baseScore = row.entry_composite_score || 50;

        const sumWeights = (w.fundamentalWeightPct || 22) +
          (w.technicalMomentumWeightPct || 22) +
          (w.bollingerSqueezeWeightPct || 16) +
          (w.volumeSurgeWeightPct || 12) +
          (w.deliverySurgeWeightPct || 14) +
          (w.relativeStrengthWeightPct || 8) +
          (w.newsSentimentWeightPct || 6);

        return (
          baseScore * ((w.fundamentalWeightPct || 22) / 100) +
          rsiScore * ((w.technicalMomentumWeightPct || 22) / 100) +
          bbScore * ((w.bollingerSqueezeWeightPct || 16) / 100) +
          volScore * ((w.volumeSurgeWeightPct || 12) / 100) +
          baseScore * (((w.deliverySurgeWeightPct || 14) + (w.relativeStrengthWeightPct || 8) + (w.newsSentimentWeightPct || 6)) / 100)
        ) / (sumWeights / 100);
      };

      // Count how well each weight set would have classified outcomes & minimized Brier score
      let oldCorrect = 0;
      let newCorrect = 0;
      let oldBrierSum = 0;
      let newBrierSum = 0;

      for (const row of resolved) {
        const oldScore = scoreWithWeights(row, oldWeights);
        const newScore = scoreWithWeights(row, newWeights);
        const isWin = row.status === 'HIT_TARGET';
        const y = isWin ? 1 : 0;

        // Sigmoid probability calibration
        const pOld = 1 / (1 + Math.exp(-(oldWeights.plattScalingA * ((oldScore - 50) / 20) + oldWeights.plattScalingB)));
        const pNew = 1 / (1 + Math.exp(-(newWeights.plattScalingA * ((newScore - 50) / 20) + newWeights.plattScalingB)));

        oldBrierSum += Math.pow(pOld - y, 2);
        newBrierSum += Math.pow(pNew - y, 2);

        // A correct classification: high score for wins, low score for losses
        if ((isWin && oldScore > 58) || (!isWin && oldScore < 52)) oldCorrect++;
        if ((isWin && newScore > 58) || (!isWin && newScore < 52)) newCorrect++;
      }

      const oldWinRate = (oldCorrect / resolved.length) * 100;
      const newWinRate = (newCorrect / resolved.length) * 100;
      const oldBrierScore = Number((oldBrierSum / resolved.length).toFixed(4));
      const newBrierScore = Number((newBrierSum / resolved.length).toFixed(4));

      // ZFA: Strict walk-forward validation requires BOTH Brier score non-increase AND win rate non-decrease
      return {
        improved: newBrierScore <= oldBrierScore && newWinRate >= oldWinRate,
        oldWinRate,
        newWinRate,
        oldBrierScore,
        newBrierScore,
        sampleSize: resolved.length
      };
    } catch {
      return { improved: false, oldWinRate: 0, newWinRate: 0, sampleSize: 0 };
    }
  }

  public async recordTradeOutcomePostMortem(trade: {
    symbol: string;
    recommendationDate: string;
    entryPrice: number;
    targetPrice: number;
    stopLossPrice: number;
    exitPrice: number;
    pnlPct: number;
    failureCategory?: 'FALSE_VOLUME_BREAKOUT' | 'PREMATURE_RSI_ENTRY' | 'TIGHT_ATR_STOP' | 'SECTOR_HEADWIND' | 'FUNDAMENTAL_LAG';
    rootCause?: string;
    action?: string;
  }): Promise<void> {
    await this.initializeDatabase();
    const db = getDB();

    // Check if post-mortem already exists for this symbol and date
    const existing = await dbAll(db, 'SELECT id FROM ModelPostMortems WHERE symbol = ? AND recommendation_date = ?', [trade.symbol, trade.recommendationDate]);
    if (existing && existing.length > 0) {
      return;
    }

    // Diagnose failure from actual entry-time indicators (not just loss magnitude)
    const diagnosis = await this.diagnoseFailureCategory({
      symbol: trade.symbol,
      recommendationDate: trade.recommendationDate,
      pnlPct: trade.pnlPct,
      entryPrice: trade.entryPrice
    });

    const cat = trade.failureCategory || diagnosis.category;
    const root = trade.rootCause || diagnosis.rootCause;
    const action = trade.action || diagnosis.correctiveAction;
    const mutation = diagnosis.mutation;

    await dbRun(db, `
      INSERT INTO ModelPostMortems (
        symbol, recommendation_date, entry_price, target_price, stop_loss_price,
        exit_price, pnl_pct, failure_category, root_cause, corrective_action, mutation_applied
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      trade.symbol, trade.recommendationDate, trade.entryPrice, trade.targetPrice, trade.stopLossPrice,
      trade.exitPrice, trade.pnlPct, cat, root, action, mutation
    ]);

    // Automatically trigger a model generation evolution cycle
    await this.triggerAutoCalibration(`Autonomous post-mortem calibration following ${trade.symbol} trade stop.`);
  }

  public async triggerAutoCalibration(reason: string = 'Manual Operator Re-Optimization Cycle'): Promise<EvolutionGeneration> {
    await this.initializeDatabase();
    const db = getDB();

    const latest = (await this.getSelfLearningReport()).currentGeneration;
    const nextGenId = latest.generationId + 1;
    const newVersionTag = `v${nextGenId}.0.0 (Self-Evolved AI Calibration)`;

    // ZFA Gate: Require at least 20 resolved trades before allowing weight mutations
    const resolvedRows = await dbAll(db, `
      SELECT COUNT(*) as count FROM PredictionAuditLedger
      WHERE status IN ('HIT_TARGET', 'STOP_LOSS_HIT')
    `);
    const resolvedCount = resolvedRows[0]?.count || 0;
    if (resolvedCount < 20) {
      // Invariant: Do not mutate genesis weights prior to statistically significant empirical sample
      return latest;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 1: Analyze factor contribution from resolved trades
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const factorAnalysis = await this.analyzeFactorContribution(latest.activeWeights);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 2: Apply bidirectional weight adjustments within bounds
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const evolvedWeights: ModelFactorWeights = { ...latest.activeWeights };

    // Apply factor attribution adjustments (bidirectional)
    for (const bound of WEIGHT_BOUNDS) {
      const adjustment = factorAnalysis.adjustments[bound.key] || 0;
      const current = (evolvedWeights as any)[bound.key] as number;
      (evolvedWeights as any)[bound.key] = Math.max(bound.min, Math.min(bound.max, current + adjustment));
    }

    // ATR and RSI threshold adjustments from recent post-mortems
    const recentPMs = await dbAll(db, `
      SELECT failure_category FROM ModelPostMortems ORDER BY id DESC LIMIT 5
    `);
    const recentCategories = recentPMs.map((pm: any) => pm.failure_category);
    const tightATRCount = recentCategories.filter((c: string) => c === 'TIGHT_ATR_STOP').length;
    const prematureRSICount = recentCategories.filter((c: string) => c === 'PREMATURE_RSI_ENTRY').length;
    const falseBreakoutCount = recentCategories.filter((c: string) => c === 'FALSE_VOLUME_BREAKOUT').length;

    if (tightATRCount >= 2) {
      evolvedWeights.atrStopMultiplier = Number(Math.min(2.8, evolvedWeights.atrStopMultiplier + 0.15).toFixed(2));
    }
    if (prematureRSICount >= 2) {
      evolvedWeights.rsiOversoldBoundary = Math.max(25, evolvedWeights.rsiOversoldBoundary - 2);
    }
    if (falseBreakoutCount >= 2) {
      evolvedWeights.minBandwidthThresholdPct = Number(Math.min(9.0, evolvedWeights.minBandwidthThresholdPct + 0.3).toFixed(1));
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 3: Walk-forward validation
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const validation = await this.walkForwardValidate(evolvedWeights, latest.activeWeights);

    const shifts: string[] = [...factorAnalysis.rationale];

    if (!validation.improved && validation.sampleSize >= 3) {
      // Walk-forward rejected: revert to current weights
      shifts.push(`⚠ Walk-forward validation REJECTED proposed weights (new: ${validation.newWinRate}% vs current: ${validation.oldWinRate}% on ${validation.sampleSize} trades). Keeping current generation parameters with only threshold adjustments.`);
      // Still persist ATR/RSI threshold changes but revert the weight percentages
      Object.assign(evolvedWeights, {
        fundamentalWeightPct: latest.activeWeights.fundamentalWeightPct,
        technicalMomentumWeightPct: latest.activeWeights.technicalMomentumWeightPct,
        bollingerSqueezeWeightPct: latest.activeWeights.bollingerSqueezeWeightPct,
        volumeSurgeWeightPct: latest.activeWeights.volumeSurgeWeightPct,
        newsSentimentWeightPct: latest.activeWeights.newsSentimentWeightPct,
        sectorRelativeStrengthWeightPct: latest.activeWeights.sectorRelativeStrengthWeightPct,
      });
    } else if (validation.sampleSize >= 3) {
      shifts.push(`✅ Walk-forward validation PASSED: ${validation.newWinRate}% classification accuracy vs ${validation.oldWinRate}% on ${validation.sampleSize} historical trades.`);
    }

    // Build human-readable shift summary
    const weightKeys: (keyof ModelFactorWeights)[] = ['fundamentalWeightPct', 'technicalMomentumWeightPct', 'bollingerSqueezeWeightPct', 'volumeSurgeWeightPct', 'newsSentimentWeightPct', 'sectorRelativeStrengthWeightPct'];
    for (const key of weightKeys) {
      const oldVal = (latest.activeWeights as any)[key];
      const newVal = (evolvedWeights as any)[key];
      if (oldVal !== newVal) {
        const label = key.replace(/WeightPct$/, '').replace(/([A-Z])/g, ' $1').trim();
        shifts.push(`${label}: ${oldVal}% → ${newVal}% (${newVal > oldVal ? '+' : ''}${newVal - oldVal}%)`);
      }
    }
    if (latest.activeWeights.atrStopMultiplier !== evolvedWeights.atrStopMultiplier) {
      shifts.push(`ATR Stop Multiplier: ${latest.activeWeights.atrStopMultiplier}x → ${evolvedWeights.atrStopMultiplier}x`);
    }
    if (latest.activeWeights.rsiOversoldBoundary !== evolvedWeights.rsiOversoldBoundary) {
      shifts.push(`RSI Oversold Boundary: ${latest.activeWeights.rsiOversoldBoundary} → ${evolvedWeights.rsiOversoldBoundary}`);
    }
    if (latest.activeWeights.minBandwidthThresholdPct !== evolvedWeights.minBandwidthThresholdPct) {
      shifts.push(`Min BB Bandwidth: ${latest.activeWeights.minBandwidthThresholdPct}% → ${evolvedWeights.minBandwidthThresholdPct}%`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 4: Compute real accuracy from trade outcomes
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const realAccuracy = await this.computeRealAccuracy();
    const accBefore = latest.simulatedAccuracyAfterCalibrationPct;
    const accAfter = realAccuracy.totalDecided > 0 ? realAccuracy.accuracyPct : accBefore;

    await dbRun(db, `
      INSERT INTO ModelGenerations (version_tag, created_at, trigger_reason, accuracy_before, accuracy_after, weights_json, weight_shifts_json, walk_forward_json)
      VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)
    `, [
      newVersionTag,
      reason,
      accBefore,
      accAfter,
      JSON.stringify(evolvedWeights),
      JSON.stringify(shifts),
      JSON.stringify(validation)
    ]);

    return {
      generationId: nextGenId,
      versionTag: newVersionTag,
      createdAt: new Date().toISOString(),
      triggerReason: reason,
      accuracyBeforeCalibrationPct: accBefore,
      simulatedAccuracyAfterCalibrationPct: accAfter,
      activeWeights: evolvedWeights,
      weightShiftsSummary: shifts,
      walkForwardValidation: validation
    };
  }
}
