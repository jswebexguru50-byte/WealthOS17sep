/**
 * QuantitativeBacktestScheduler.ts
 * 
 * The hourly orchestration engine for the Self-Learning & Self-Correcting
 * Stock Intelligence Engine. This scheduler:
 * 
 * 1. Ingests fresh OHLCV data for all tracked symbols
 * 2. Re-classifies the macro market regime
 * 3. Runs the opportunity scanner with regime-adjusted weights
 * 4. Evaluates open predictions (SL hit? Target hit? Still active?)
 * 5. Triggers post-mortem analysis on failed trades
 * 6. Checks if auto-calibration of model weights is needed
 * 7. Logs the full cycle to ModelRunLedger for audit trail
 */

import { getDB, dbRun, dbAll, dbGet } from '../database.js';
import { MarketDataIngestorService } from './MarketDataIngestorService.js';
import { FnOIntelligenceService } from './FnOIntelligenceService.js';
import { MacroRegimeClassifierService, RegimeState } from './MacroRegimeClassifierService.js';
import { SelfLearningEngine } from './SelfLearningEngine.js';
import { PredictionAccuracyEngine } from './PredictionAccuracyEngine.js';
import { OpportunityScannerEngine } from './OpportunityScannerEngine.js';

// The universe of symbols to ingest data for (top Nifty 500 by liquidity)
export const TRACKED_UNIVERSE = [
  // Nifty 50 Core
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'BAJFINANCE',
  'BHARTIARTL', 'KOTAKBANK', 'ITC', 'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI',
  'SUNPHARMA', 'TITAN', 'NESTLEIND', 'ULTRACEMCO', 'TECHM', 'WIPRO',
  'M&M', 'HCLTECH', 'POWERGRID', 'NTPC', 'TATASTEEL', 'COALINDIA', 'JSWSTEEL',
  'ADANIPORTS', 'ONGC', 'BPCL',
  // Nifty Next 50
  'SBIN', 'INDUSINDBK', 'BANKBARODA', 'PNB', 'CANBK', 'FEDERALBNK',
  'TATAPOWER', 'PFC', 'RECLTD', 'IOC', 'SIEMENS', 'ABB', 'HAVELLS',
  'PIDILITIND', 'DMART', 'TRENT', 'NAUKRI', 'ZOMATO',
  // Mid & Small Cap High Conviction
  'BEL', 'HAL', 'BHEL', 'IRCTC', 'IRFC', 'RVNL',
  'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP', 'MAXHEALTH',
  'BAJAJFINSV', 'SHRIRAMFIN', 'MUTHOOTFIN', 'BAJAJHFL', 'CHOLAFIN',
  'ADANIENT', 'ADANIGREEN', 'TATACOMM', 'TATACHEM', 'TATACONSUM',
  'TATAMOTORS', 'TIINDIA', 'GRASIM', 'HINDALCO', 'VEDL',
  'JUBLFOOD', 'NYKAA', 'PAYTM', 'LODHA', 'OBEROIRLTY', 'PRESTIGE',
  'PERSISTENT', 'PIIND', 'POLYCAB', 'OFSS', 'MPHASIS',
  'MANKIND', 'ZYDUSLIFE', 'MARICO', 'UNOMINDA', 'VBL',
  'IREDA', 'SJVN', 'NHPC', 'CESC', 'TORNTPOWER',
  'AMBUJACEM', 'ACC', 'SHREECEM', 'RAMCOCEM',
  // Nifty Market index
  '^NSEI'
];

export interface SchedulerRunResult {
  runAt: string;
  regime: RegimeState;
  stocksScanned: number;
  highConvictionAlerts: number;
  slHitsEvaluated: number;
  weightMutationsApplied: number;
  accuracyPct: number;
  durationMs: number;
  errors: string[];
  cycleLog: string[];
}

export interface SchedulerStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  totalCyclesCompleted: number;
  currentRegime: RegimeState | null;
  lastRunResult: SchedulerRunResult | null;
}

export class QuantitativeBacktestScheduler {
  private static instance: QuantitativeBacktestScheduler;
  private isRunning: boolean = false;
  private lastRunAt: string | null = null;
  private totalCycles: number = 0;
  private lastRunResult: SchedulerRunResult | null = null;
  private schedulerInterval: ReturnType<typeof setInterval> | null = null;

  // Service references
  private ingestor = MarketDataIngestorService.getInstance();
  private fno = FnOIntelligenceService.getInstance();
  private regime = MacroRegimeClassifierService.getInstance();
  private learner = SelfLearningEngine.getInstance();
  private accuracy = PredictionAccuracyEngine.getInstance();

  public static getInstance(): QuantitativeBacktestScheduler {
    if (!QuantitativeBacktestScheduler.instance) {
      QuantitativeBacktestScheduler.instance = new QuantitativeBacktestScheduler();
    }
    return QuantitativeBacktestScheduler.instance;
  }

  public async initializeAllDatabases(): Promise<void> {
    await this.ingestor.initializeDatabase();
    await this.fno.initializeDatabase();
    await this.regime.initializeDatabase();
    await this.learner.initializeDatabase();
    await this.accuracy.initializeDatabase();
    console.log('[QuantScheduler] All engine databases initialized.');
  }

  /**
   * Check if currently within Indian market hours (09:15–15:30 IST, Mon–Fri)
   */
  public isMarketHours(): boolean {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST = UTC + 5:30
    const istTime = new Date(now.getTime() + istOffset);

    const day = istTime.getUTCDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;

    const hour = istTime.getUTCHours();
    const min = istTime.getUTCMinutes();
    const totalMin = hour * 60 + min;

    const marketOpen = 9 * 60 + 15;  // 09:15 IST
    const marketClose = 15 * 60 + 30; // 15:30 IST

    return totalMin >= marketOpen && totalMin <= marketClose;
  }

  /**
   * Execute one full engine cycle
   */
  public async runCycle(triggerReason: string = 'SCHEDULED'): Promise<SchedulerRunResult> {
    if (this.isRunning) {
      throw new Error('Scheduler cycle already in progress');
    }

    const startTime = Date.now();
    this.isRunning = true;
    const cycleLog: string[] = [];
    const errors: string[] = [];
    let slHitsEvaluated = 0;
    let highConvictionAlerts = 0;
    let weightMutationsApplied = 0;
    let currentRegime: RegimeState | null = null;

    try {
      cycleLog.push(`[${new Date().toISOString()}] Starting engine cycle — Trigger: ${triggerReason}`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PHASE 1: Data Ingestion
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      cycleLog.push('[Phase 1] Starting OHLCV data ingestion for tracked universe...');
      const ingestResult = await this.ingestor.batchIngest(TRACKED_UNIVERSE, 200);
      cycleLog.push(`[Phase 1] Ingestion complete: ${ingestResult.totalIngested} records stored. Failures: ${ingestResult.failures.length}. Duration: ${ingestResult.durationMs}ms`);
      if (ingestResult.failures.length > 0) {
        errors.push(`Data ingestion failures: ${ingestResult.failures.slice(0, 5).join(', ')}`);
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PHASE 2: Macro Regime Classification
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      cycleLog.push('[Phase 2] Running Macro Regime Classifier (HMM)...');
      const niftySnapshots = await this.ingestor.getSnapshots('^NSEI', 25);
      const niftyPrices = niftySnapshots.map(s => s.close).filter(p => p > 0);

      if (niftyPrices.length >= 5) {
        currentRegime = await this.regime.forceReclassify(niftyPrices);
      } else {
        currentRegime = await this.regime.getCurrentRegime();
      }

      cycleLog.push(`[Phase 2] Regime: ${currentRegime.regime} (Confidence: ${currentRegime.confidence.toFixed(1)}%, Multiplier: ${currentRegime.convictionMultiplier}x)`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PHASE 3: F&O Data Refresh
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      cycleLog.push('[Phase 3] Refreshing F&O intelligence data...');
      let fnoRefreshed = 0;
      const fnoSymbols = TRACKED_UNIVERSE.filter(s => this.fno.isFnoEligible(s));
      for (const sym of fnoSymbols.slice(0, 30)) { // Process top 30 F&O stocks
        const snapshot = await this.ingestor.getLatestSnapshot(sym);
        if (snapshot) {
          const trend: 'BULLISH' | 'NEUTRAL' | 'BEARISH' =
            currentRegime.regime === 'BULL_TREND' ? 'BULLISH' :
            currentRegime.regime === 'BEAR_TREND' ? 'BEARISH' : 'NEUTRAL';
          const instKey = await this.ingestor.resolveUpstoxInstrumentKey(sym);
          const fnoSnap = await this.fno.getOrFetchFnOSnapshot(
            sym, snapshot.close, snapshot.rsi14 ?? 50, trend, instKey || undefined
          );
          fnoRefreshed++;
        }
      }
      cycleLog.push(`[Phase 3] F&O derivatives data refreshed for ${fnoRefreshed} symbols (Upstox primary / model fallback).`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PHASE 4: Prediction Accuracy Evaluation
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      cycleLog.push('[Phase 4] Evaluating open predictions against latest prices...');
      const accuracyReport = await this.accuracy.evaluateAccuracy();
      slHitsEvaluated = accuracyReport.inaccuratePicksCount;
      cycleLog.push(`[Phase 4] Accuracy: ${accuracyReport.overallAccuracyRatePct.toFixed(1)}%. SL Hits: ${slHitsEvaluated}. Profit Factor: ${accuracyReport.profitFactor.toFixed(2)}x`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PHASE 5: Self-Learning Feedback Loop
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      cycleLog.push('[Phase 5] Running Self-Learning calibration check...');
      const learningReport = await this.learner.getSelfLearningReport();
      const currentAccuracy = learningReport.learningMetrics.currentCalibratedAccuracyRatePct;

      // Auto-calibrate if accuracy has dropped below threshold
      if (currentAccuracy < 55 && slHitsEvaluated > 2) {
        const newGeneration = await this.learner.triggerAutoCalibration(
          `Auto-calibration triggered: Accuracy dropped to ${currentAccuracy.toFixed(1)}% with ${slHitsEvaluated} recent SL hits`
        );
        weightMutationsApplied++;
        cycleLog.push(`[Phase 5] ⚡ AUTO-CALIBRATION triggered → New model: ${newGeneration.versionTag} (Simulated accuracy: ${newGeneration.simulatedAccuracyAfterCalibrationPct.toFixed(1)}%)`);
      } else {
        cycleLog.push(`[Phase 5] Model stable. Accuracy: ${currentAccuracy.toFixed(1)}% — No calibration needed.`);
      }

      // Count high conviction signals from opportunity scanner
      try {
        const scanReport = await OpportunityScannerEngine.getInstance().scanOpportunities();
        const topInvested = scanReport.investedStockOpportunities.filter(o => o.bullishProbabilityPct >= 80).length;
        const topNifty = scanReport.nifty500StockOpportunities.filter(o => o.bullishProbabilityPct >= 80).length;
        highConvictionAlerts = topInvested + topNifty;
      } catch {
        highConvictionAlerts = 0;
      }
      cycleLog.push(`[Phase 5] High conviction opportunities identified: ${highConvictionAlerts}`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PHASE 6: Cycle Logging
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const durationMs = Date.now() - startTime;
      await this.logCycleToLedger({
        regime: currentRegime.regime,
        stocksScanned: TRACKED_UNIVERSE.length,
        highConvictionAlerts,
        slHitsEvaluated,
        weightMutationsApplied,
        accuracyPct: currentAccuracy,
        durationMs,
        triggerReason
      });
      cycleLog.push(`[Phase 6] Cycle complete. Duration: ${durationMs}ms`);

      const result: SchedulerRunResult = {
        runAt: new Date().toISOString(),
        regime: currentRegime,
        stocksScanned: TRACKED_UNIVERSE.length,
        highConvictionAlerts,
        slHitsEvaluated,
        weightMutationsApplied,
        accuracyPct: currentAccuracy,
        durationMs,
        errors,
        cycleLog
      };

      this.lastRunResult = result;
      this.lastRunAt = result.runAt;
      this.totalCycles++;

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  private async logCycleToLedger(data: {
    regime: string;
    stocksScanned: number;
    highConvictionAlerts: number;
    slHitsEvaluated: number;
    weightMutationsApplied: number;
    accuracyPct: number;
    durationMs: number;
    triggerReason: string;
  }): Promise<void> {
    const db = getDB();
    try {
      await dbRun(db, `
        INSERT INTO ModelRunLedger
          (regime, stocks_scanned, high_conviction_alerts, sl_hits_evaluated,
           weight_mutations_applied, accuracy_pct, run_duration_ms, trigger_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.regime, data.stocksScanned, data.highConvictionAlerts,
        data.slHitsEvaluated, data.weightMutationsApplied, data.accuracyPct,
        data.durationMs, data.triggerReason
      ]);
    } catch { /* non-critical */ }
  }

  /**
   * Get the last N model run records
   */
  public async getRunHistory(limit: number = 20): Promise<any[]> {
    const db = getDB();
    try {
      return await dbAll(db, `
        SELECT * FROM ModelRunLedger ORDER BY run_at DESC LIMIT ?
      `, [limit]);
    } catch {
      return [];
    }
  }

  /**
   * Get current scheduler status
   */
  public getStatus(): SchedulerStatus {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      nextRunAt: null, // Managed by the outer scheduler in server.ts
      totalCyclesCompleted: this.totalCycles,
      currentRegime: this.lastRunResult?.regime || null,
      lastRunResult: this.lastRunResult
    };
  }

  /**
   * Start the hourly background scheduler (called from server.ts)
   * Integrates with the existing market hours scheduler
   */
  public startBackgroundScheduler(): void {
    if (this.schedulerInterval) return; // Already running

    // Note: Do not block server startup with heavy 70-stock batch; run during scheduled market hours or on-demand

    // Then run every 60 minutes during market hours
    // Note: The outer server.ts market hours check will call this
    this.schedulerInterval = setInterval(async () => {
      if (this.isMarketHours()) {
        try {
          await this.runCycle('HOURLY_MARKET_HOURS');
        } catch (err) {
          console.error('[QuantScheduler] Cycle error:', err);
        }
      } else {
        // Off-market: Run a lighter refresh every 4 hours
        const now = new Date();
        const hours = now.getUTCHours();
        if (hours % 4 === 0 && now.getUTCMinutes() < 5) {
          await this.runCycle('OFF_MARKET_REFRESH').catch(() => {});
        }
      }
    }, 60 * 60 * 1000); // 60 minutes

    console.log('[QuantScheduler] Background scheduler started. Runs every 60 min during market hours.');
  }

  public stopBackgroundScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }
}
