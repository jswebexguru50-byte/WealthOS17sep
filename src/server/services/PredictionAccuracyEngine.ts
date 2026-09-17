import { getDB, dbAll, dbRun, dbGet } from '../database.js';
import { SelfLearningEngine } from './SelfLearningEngine.js';

export interface PredictionRecord {
  id?: number;
  symbol: string;
  companyName: string;
  recommendationDate: string;
  recommendedAction: 'STRONG_BUY' | 'BUY_ACCUMULATE' | 'MOMENTUM_BREAKOUT';
  entryPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  currentPrice: number;
  maxPriceReached: number;
  predictedProbabilityPct: number;
  confidenceLevel: 'VERY_HIGH' | 'HIGH' | 'MODERATE';
  status: 'HIT_TARGET' | 'IN_PROFIT' | 'OPEN_TRACKING' | 'STOP_LOSS_HIT' | 'EXPIRED_NEUTRAL';
  pnlPct: number;
  horizonDays: number;
  daysActive: number;
  category: 'INVESTED_PORTFOLIO' | 'NIFTY_500';
  laymanThesis: string;
  // New forensic & microstructure fields
  peakPnlPct?: number;
  troughPnlPct?: number;
  entryRsi14?: number;
  entryBbBandwidth?: number;
  entryRelativeVolume?: number;
  entryDeliverySurge?: number;
  entrySectorZScore?: number;
  entryRsNifty?: number;
  entryKellyFraction?: number;
  entryRegime?: string;
  entryCompositeScore?: number;
  resolvedAt?: string;
}

export interface AccuracyReport {
  totalRealPredictions: number;        // excludes seed records (is_seed = 1)
  resolvedPredictions: number;
  successfulPicksCount: number;
  inaccuratePicksCount: number;
  openActivePicksCount: number;
  expiredPicksCount: number;
  /** null until MIN_SAMPLE resolved real predictions — never a fabricated default */
  overallAccuracyRatePct: number | null;
  /** null until MIN_SAMPLE resolved */
  averageProfitPctOnWins: number | null;
  /** null until MIN_SAMPLE resolved */
  averageLossPctOnLosses: number | null;
  /** null until MIN_SAMPLE resolved */
  profitFactor: number | null;
  /** null until MIN_SAMPLE resolved */
  avgDaysToTarget: number | null;
  /** null until MIN_SAMPLE resolved */
  brierScore: number | null;
  /** null until MIN_SAMPLE resolved */
  logLoss: number | null;
  /** null until MIN_SAMPLE resolved */
  calibrationErrorPct: number | null;
  isStatisticallySignificant: boolean;  // true when resolvedPredictions >= MIN_SAMPLE
  insufficientDataMessage?: string;     // shown in UI when not yet significant
  lastEvaluatedAt: string;
  records: PredictionRecord[];
}

/**
 * Strategy-specific prediction horizons.
 * A momentum play resolves in 15 days; a value compounder may take 90 days.
 */
export const STRATEGY_HORIZONS: Record<string, number> = {
  'MOMENTUM_BREAKOUT': 15,
  'DIP_ACCUMULATION': 25,
  'VALUE_COMPOUNDER': 90,
  'SECTOR_LEADER': 60,
  'OVERSOLD_REBOUND': 10,
  'BEARISH_BREAKDOWN': 20,
  'DELIVERY_SURGE': 12,
  'BLOCK_ACCUMULATION': 20,
  'SHORT_HEDGE': 10
};

export function getHorizonDays(strategyCategory?: string): number {
  if (!strategyCategory) return 30;
  return STRATEGY_HORIZONS[strategyCategory] ?? 30;
}


export class PredictionAccuracyEngine {
  private static instance: PredictionAccuracyEngine;

  public static getInstance(): PredictionAccuracyEngine {
    if (!PredictionAccuracyEngine.instance) {
      PredictionAccuracyEngine.instance = new PredictionAccuracyEngine();
    }
    return PredictionAccuracyEngine.instance;
  }

  public async initializeDatabase(): Promise<void> {
    const db = getDB();
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS PredictionAuditLedger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        company_name TEXT,
        recommendation_date TEXT NOT NULL,
        recommended_action TEXT NOT NULL,
        entry_price REAL NOT NULL,
        target_price REAL NOT NULL,
        stop_loss_price REAL NOT NULL,
        current_price REAL NOT NULL,
        max_price_reached REAL NOT NULL,
        predicted_probability_pct REAL NOT NULL,
        confidence_level TEXT NOT NULL,
        status TEXT NOT NULL,
        pnl_pct REAL NOT NULL,
        horizon_days INTEGER NOT NULL,
        category TEXT NOT NULL,
        layman_thesis TEXT,
        is_seed INTEGER DEFAULT 0,    -- 1 = seeded demo record, excluded from all accuracy metrics
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add forensic columns for indicator snapshots, microstructure, and resolution
    const forensicColumns = [
      { name: 'entry_rsi14', type: 'REAL' },
      { name: 'entry_bb_bandwidth', type: 'REAL' },
      { name: 'entry_bb_percent_b', type: 'REAL' },
      { name: 'entry_relative_volume', type: 'REAL' },
      { name: 'entry_delivery_surge', type: 'REAL' },
      { name: 'entry_sector_z_score', type: 'REAL' },
      { name: 'entry_rs_nifty', type: 'REAL' },
      { name: 'entry_kelly_fraction', type: 'REAL' },
      { name: 'entry_macd_histogram', type: 'REAL' },
      { name: 'entry_atr14', type: 'REAL' },
      { name: 'entry_regime', type: 'TEXT' },
      { name: 'entry_composite_score', type: 'REAL' },
      { name: 'days_active', type: 'INTEGER DEFAULT 0' },
      { name: 'peak_pnl_pct', type: 'REAL DEFAULT 0' },
      { name: 'trough_pnl_pct', type: 'REAL DEFAULT 0' },
      { name: 'resolved_at', type: 'TEXT' },
      { name: 'is_seed', type: 'INTEGER DEFAULT 0' }
    ];

    for (const col of forensicColumns) {
      try {
        await dbRun(db, `ALTER TABLE PredictionAuditLedger ADD COLUMN ${col.name} ${col.type}`);
      } catch { /* Column already exists — safe to skip */ }
    }

    // Mark any pre-existing records as seed data to exclude from real accuracy metrics
    await dbRun(db, `UPDATE PredictionAuditLedger SET is_seed = 1 WHERE is_seed IS NULL OR is_seed = 0`);
    // NOTE: We intentionally leave existing records in place for historical display,
    // but all accuracy calculations MUST filter WHERE is_seed = 0.
  }

  /** Minimum resolved real predictions before accuracy metrics are shown */
  private readonly MIN_SAMPLE = 20;

  public async evaluateAccuracy(): Promise<AccuracyReport> {
    await this.initializeDatabase();
    const db = getDB();

    // Fetch all current holdings & ticker prices to update active records
    const liveHoldings = await dbAll(db, 'SELECT symbol, ltp FROM Holdings WHERE ltp > 0');
    const ltpMap = new Map<string, number>();
    liveHoldings.forEach((h: any) => ltpMap.set(h.symbol.toUpperCase(), Number(h.ltp)));

    // Fetch ALL prediction records (including seed, for display purposes)
    const rows = await dbAll(db, 'SELECT * FROM PredictionAuditLedger ORDER BY id DESC');

    const records: PredictionRecord[] = [];
    let wins = 0;
    let losses = 0;
    let openCount = 0;
    let expiredCount = 0;
    let totalWinPnl = 0;
    let totalLossPnl = 0;
    let totalDaysToTarget = 0;
    let targetHitCount = 0;
    let realResolvedCount = 0; // count of non-seed resolved predictions

    for (const r of rows) {
      let currentPrice = r.current_price;
      if (ltpMap.has(r.symbol.toUpperCase())) {
        currentPrice = ltpMap.get(r.symbol.toUpperCase())!;
      }

      // Use intraday high from MarketSnapshots for target validation
      // This avoids missing targets hit intraday but closed below target
      let maxPrice = Math.max(r.max_price_reached || currentPrice, currentPrice);
      try {
        const highRow = await dbGet(db, `
          SELECT MAX(high) as maxHigh FROM MarketSnapshots
          WHERE UPPER(symbol) = UPPER(?)
          AND snapshot_date >= ?
        `, [r.symbol, r.recommendation_date]);
        if (highRow?.maxHigh && highRow.maxHigh > maxPrice) {
          maxPrice = highRow.maxHigh;
        }
      } catch { /* MarketSnapshots may not have this symbol yet */ }

      let pnlPct = r.entry_price > 0 ? Number((((currentPrice - r.entry_price) / r.entry_price) * 100).toFixed(2)) : 0;

      // Compute real days active from recommendation date
      const recDate = new Date(r.recommendation_date);
      const now = new Date();
      const daysActive = Math.max(1, Math.ceil((now.getTime() - recDate.getTime()) / 86400000));

      // Track peak and trough P&L over the prediction's lifetime
      const peakPnl = Math.max(r.peak_pnl_pct || 0, pnlPct);
      const troughPnl = Math.min(r.trough_pnl_pct || 0, pnlPct);

      let status: PredictionRecord['status'] = r.status as any;

      // Re-evaluate live status (but don't overwrite already-resolved predictions)
      const isAlreadyResolved = r.resolved_at && (r.status === 'HIT_TARGET' || r.status === 'STOP_LOSS_HIT');
      if (!isAlreadyResolved) {
        const isTrimOrExit = r.recommended_action === 'TRIM_EXIT' || r.target_price < r.entry_price;
        if (isTrimOrExit) {
          if (currentPrice <= r.target_price) {
            status = 'HIT_TARGET';
          } else if (r.stop_loss_price > r.entry_price && currentPrice >= r.stop_loss_price) {
            status = 'STOP_LOSS_HIT';
          } else if (currentPrice < r.entry_price) {
            status = 'IN_PROFIT';
          } else if (daysActive > r.horizon_days * 1.5) {
            status = 'EXPIRED_NEUTRAL';
          } else {
            status = 'OPEN_TRACKING';
          }
        } else {
          if (maxPrice >= r.target_price) {
            status = 'HIT_TARGET';
          } else if (currentPrice <= r.stop_loss_price) {
            status = 'STOP_LOSS_HIT';
          } else if (daysActive > r.horizon_days * 1.5) {
            status = pnlPct > 0 ? 'IN_PROFIT' : 'EXPIRED_NEUTRAL';
          } else if (pnlPct > 0) {
            status = 'IN_PROFIT';
          } else {
            status = 'OPEN_TRACKING';
          }
        }
      }

      // Persist updated values back to the ledger for forensic audit trail
      try {
        const isNowResolved = status === 'HIT_TARGET' || status === 'STOP_LOSS_HIT';
        await dbRun(db, `
          UPDATE PredictionAuditLedger 
          SET current_price = ?, max_price_reached = ?, status = ?, 
              pnl_pct = ?, days_active = ?, peak_pnl_pct = ?, trough_pnl_pct = ?,
              resolved_at = CASE WHEN ? = 1 AND resolved_at IS NULL 
                            THEN CURRENT_TIMESTAMP ELSE resolved_at END
          WHERE id = ?
        `, [currentPrice, maxPrice, status, pnlPct, daysActive, peakPnl, troughPnl,
            isNowResolved ? 1 : 0, r.id]);
      } catch { /* non-critical write-back failure */ }

      // Classify outcome for accuracy metrics — ONLY count real (non-seed) records
      const isSeed = r.is_seed === 1;
      if (!isSeed) {
        if (status === 'HIT_TARGET' || (status === 'IN_PROFIT' && pnlPct >= 5.0)) {
          wins++;
          totalWinPnl += Math.max(0, pnlPct);
          if (status === 'HIT_TARGET') {
            targetHitCount++;
            totalDaysToTarget += daysActive;
          }
          realResolvedCount++;
        } else if (status === 'STOP_LOSS_HIT' || pnlPct < -5.0) {
          losses++;
          totalLossPnl += Math.abs(Math.min(0, pnlPct));
          realResolvedCount++;

          // Trigger autonomous self-learning post-mortem feedback loop
          if (status === 'STOP_LOSS_HIT' && !isAlreadyResolved) {
            SelfLearningEngine.getInstance().recordTradeOutcomePostMortem({
              symbol: r.symbol,
              recommendationDate: r.recommendation_date,
              entryPrice: r.entry_price,
              targetPrice: r.target_price,
              stopLossPrice: r.stop_loss_price,
              exitPrice: currentPrice,
              pnlPct
            }).catch((err) => console.error(`[Self-Learning Auto-Audit] Error recording post-mortem for ${r.symbol}:`, err));
          }
        } else if (status === 'EXPIRED_NEUTRAL') {
          expiredCount++;
        } else {
          openCount++;
        }
      } else {
        // Seed records: only count as open for display purposes
        if (status === 'OPEN_TRACKING' || status === 'IN_PROFIT') openCount++;
      }

      records.push({
        id: r.id,
        symbol: r.symbol,
        companyName: r.company_name,
        recommendationDate: r.recommendation_date,
        recommendedAction: r.recommended_action,
        entryPrice: r.entry_price,
        targetPrice: r.target_price,
        stopLossPrice: r.stop_loss_price,
        currentPrice,
        maxPriceReached: maxPrice,
        predictedProbabilityPct: r.predicted_probability_pct,
        confidenceLevel: r.confidence_level,
        status,
        pnlPct,
        horizonDays: r.horizon_days,
        daysActive,
        category: r.category,
        laymanThesis: r.layman_thesis,
        peakPnlPct: peakPnl,
        troughPnlPct: troughPnl,
        entryRsi14: r.entry_rsi14,
        entryBbBandwidth: r.entry_bb_bandwidth,
        entryRelativeVolume: r.entry_relative_volume,
        entryDeliverySurge: r.entry_delivery_surge,
        entrySectorZScore: r.entry_sector_z_score,
        entryRsNifty: r.entry_rs_nifty,
        entryKellyFraction: r.entry_kelly_fraction,
        entryRegime: r.entry_regime,
        entryCompositeScore: r.entry_composite_score,
        resolvedAt: r.resolved_at
      });
    }

    const resolvedCount = wins + losses;
    const isSignificant = resolvedCount >= this.MIN_SAMPLE;

    // All accuracy metrics are null until MIN_SAMPLE real resolved predictions exist.
    // NEVER substitute fabricated defaults.
    const overallAccuracyRatePct = isSignificant
      ? Number(((wins / resolvedCount) * 100).toFixed(1))
      : null;
    const avgWin = isSignificant && wins > 0
      ? Number((totalWinPnl / wins).toFixed(2))
      : null;
    const avgLoss = isSignificant && losses > 0
      ? Number((totalLossPnl / losses).toFixed(2))
      : null;
    const profitFactor = isSignificant && avgLoss !== null && avgLoss > 0
      ? Number(((wins * (avgWin ?? 0)) / (losses * avgLoss)).toFixed(2))
      : null;
    const avgDaysToTarget = isSignificant && targetHitCount > 0
      ? Number((totalDaysToTarget / targetHitCount).toFixed(1))
      : null;

    // Brier Score & Log-Loss — only for real resolved records
    let brierSum = 0;
    let logLossSum = 0;
    let probSum = 0;
    let countForBrier = 0;

    for (const rec of records) {
      // Skip seed records from calibration metrics
      const recRow = rows.find(r => r.id === rec.id);
      if (recRow?.is_seed === 1) continue;

      if (rec.status === 'HIT_TARGET' || rec.status === 'STOP_LOSS_HIT' ||
          (rec.status === 'IN_PROFIT' && rec.pnlPct >= 5.0) || rec.pnlPct < -5.0) {
        const y = (rec.status === 'HIT_TARGET' || (rec.status === 'IN_PROFIT' && rec.pnlPct >= 5.0)) ? 1 : 0;
        const p = Math.max(0.01, Math.min(0.99, (rec.predictedProbabilityPct || 75) / 100));
        brierSum += Math.pow(p - y, 2);
        logLossSum += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
        probSum += p * 100;
        countForBrier++;
      }
    }

    const brierScore = isSignificant && countForBrier > 0
      ? Number((brierSum / countForBrier).toFixed(4))
      : null;
    const logLoss = isSignificant && countForBrier > 0
      ? Number((logLossSum / countForBrier).toFixed(4))
      : null;
    const avgPredictedProb = countForBrier > 0 ? probSum / countForBrier : null;
    const calibrationErrorPct = isSignificant && avgPredictedProb !== null && overallAccuracyRatePct !== null
      ? Number(Math.abs(avgPredictedProb - overallAccuracyRatePct).toFixed(1))
      : null;

    return {
      totalRealPredictions: rows.filter(r => !r.is_seed).length,
      resolvedPredictions: resolvedCount,
      successfulPicksCount: wins,
      inaccuratePicksCount: losses,
      openActivePicksCount: openCount,
      expiredPicksCount: expiredCount,
      overallAccuracyRatePct,
      averageProfitPctOnWins: avgWin,
      averageLossPctOnLosses: avgLoss,
      profitFactor,
      avgDaysToTarget,
      brierScore,
      logLoss,
      calibrationErrorPct,
      isStatisticallySignificant: isSignificant,
      insufficientDataMessage: isSignificant
        ? undefined
        : `Track Record Building: ${resolvedCount} of ${this.MIN_SAMPLE} signals resolved. Accuracy metrics shown after ${this.MIN_SAMPLE} real outcomes.`,
      lastEvaluatedAt: new Date().toISOString(),
      records
    };
  }

  public async recordOrUpdatePrediction(pred: {
    symbol: string;
    companyName?: string;
    recommendationDate: string;
    recommendedAction: string;
    entryPrice: number;
    targetPrice: number;
    stopLossPrice: number;
    currentPrice: number;
    maxPriceReached?: number;
    predictedProbabilityPct: number;
    confidenceLevel: string;
    status: 'HIT_TARGET' | 'IN_PROFIT' | 'OPEN_TRACKING' | 'STOP_LOSS_HIT' | 'EXPIRED_NEUTRAL';
    pnlPct: number;
    horizonDays?: number;
    strategyCategory?: string;  // used to derive correct horizon when horizonDays not provided
    category: 'INVESTED_PORTFOLIO' | 'NIFTY_500';
    laymanThesis?: string;
    entryRsi14?: number;
    entryBbBandwidth?: number;
    entryRelativeVolume?: number;
    entryRegime?: string;
    entryCompositeScore?: number;
    resolvedAt?: string;
  }): Promise<void> {
    await this.initializeDatabase();
    const db = getDB();
    const existing = await dbAll(db, `
      SELECT id FROM PredictionAuditLedger WHERE symbol = ? AND recommendation_date = ?
    `, [pred.symbol, pred.recommendationDate]);

    // Use strategy-specific horizon when not provided explicitly
    const horizonDays = pred.horizonDays ?? getHorizonDays(pred.strategyCategory);

    if (existing && existing.length > 0) {
      await dbRun(db, `
        UPDATE PredictionAuditLedger
        SET current_price = ?, max_price_reached = MAX(max_price_reached, ?),
            status = ?, pnl_pct = ?, resolved_at = COALESCE(?, resolved_at)
        WHERE id = ?
      `, [
        pred.currentPrice,
        pred.maxPriceReached || pred.currentPrice,
        pred.status,
        pred.pnlPct,
        pred.resolvedAt || null,
        existing[0].id
      ]);
    } else {
      await dbRun(db, `
        INSERT INTO PredictionAuditLedger (
          symbol, company_name, recommendation_date, recommended_action,
          entry_price, target_price, stop_loss_price, current_price, max_price_reached,
          predicted_probability_pct, confidence_level, status, pnl_pct,
          horizon_days, category, layman_thesis,
          entry_rsi14, entry_bb_bandwidth, entry_relative_volume, entry_regime, entry_composite_score,
          is_seed, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `, [
        pred.symbol,
        pred.companyName || pred.symbol,
        pred.recommendationDate,
        pred.recommendedAction,
        pred.entryPrice,
        pred.targetPrice,
        pred.stopLossPrice,
        pred.currentPrice,
        pred.maxPriceReached || pred.currentPrice,
        pred.predictedProbabilityPct,
        pred.confidenceLevel,
        pred.status,
        pred.pnlPct,
        horizonDays,
        pred.category,
        pred.laymanThesis || '',
        pred.entryRsi14 ?? null,
        pred.entryBbBandwidth ?? null,
        pred.entryRelativeVolume ?? null,
        pred.entryRegime ?? null,
        pred.entryCompositeScore ?? null,
        pred.resolvedAt || null
      ]);
    }
  }
}
