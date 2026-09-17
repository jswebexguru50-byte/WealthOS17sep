import { getDB, dbRun, dbAll, dbGet } from '../database.js';

/**
 * Market Regime Classification using Hidden Markov Model (HMM) principles.
 * 
 * We implement a simplified HMM-like regime detection using:
 * 1. Nifty50 rolling return statistics (mean, volatility)
 * 2. VIX proxy (realized volatility as VIX approximation)
 * 3. Market breadth (% of stocks above SMA20)
 * 4. Momentum persistence (trending vs mean-reverting)
 * 
 * 4 Regime States:
 * - BULL_TREND: Rising prices + low volatility + strong breadth
 * - BEAR_TREND: Falling prices + elevated volatility + weak breadth
 * - HIGH_VOLATILITY: Erratic prices + very high volatility (event-driven)
 * - MEAN_REVERTING: Flat prices + low volatility + narrow range (consolidation)
 */

export type MarketRegime = 'BULL_TREND' | 'BEAR_TREND' | 'HIGH_VOLATILITY' | 'MEAN_REVERTING' | 'UNKNOWN';

export interface RegimeState {
  regime: MarketRegime;
  confidence: number;              // 0-100 how confident the classifier is
  regimeProbabilities: {
    bull: number;                  // 0.0 - 1.0 probability of Bull regime
    chop: number;                  // 0.0 - 1.0 probability of Mean-Reverting/Chop regime
    bear: number;                  // 0.0 - 1.0 probability of Bear/High Vol regime
  };
  nifty5dReturnPct: number;
  nifty20dReturnPct: number;
  realizedVolatilityPct: number;   // 20-day annualized realized vol
  breadthScore: number;             // 0-100 (% of stocks above SMA20)
  momentumZ: number;                // Z-score of recent return vs historical
  vixLevel: number;                 // Proxy VIX (using realized vol * 1.1)
  regimeDescription: string;
  investmentImplication: string;
  convictionMultiplier: number;    // Applied to all scanner confidence scores
  capitalPreservationMode: boolean; // True when VIX > 22 or Bear/High Vol regime is active
  suggestedCashAllocationPct: number; // Defensive buffer recommendation (e.g. 35-50% in bear/vol)
  allowedStrategies: string[];
  avoidStrategies: string[];
  scannerThreshold: number;        // Min composite score to flag as opportunity
}

export interface RegimeHistory {
  date: string;
  regime: MarketRegime;
  confidence: number;
  convictionMultiplier: number;
}

const REGIME_METADATA: Record<MarketRegime, {
  description: string;
  implication: string;
  convictionMultiplier: number;
  allowed: string[];
  avoid: string[];
  threshold: number;
}> = {
  'BULL_TREND': {
    description: 'Sustained uptrend with institutional accumulation and broad market participation',
    implication: 'Aggressive positioning recommended. Momentum plays, breakout entries, and growth stocks outperform. Add to winners.',
    convictionMultiplier: 1.15,
    allowed: ['MOMENTUM_BREAKOUT', 'SECTOR_LEADER', 'VALUE_COMPOUNDER'],
    avoid: ['SHORT_SELLING', 'CASH_ONLY'],
    threshold: 60  // Lower threshold needed to qualify (bullish environment)
  },
  'BEAR_TREND': {
    description: 'Broad market decline driven by FII outflows, earnings deterioration, or macro headwinds',
    implication: 'Defensive positioning. Reduce equity exposure, focus on dividend payers, avoid leveraged positions. Raise cash.',
    convictionMultiplier: 0.75,
    allowed: ['DIP_ACCUMULATION', 'OVERSOLD_REBOUND'],
    avoid: ['MOMENTUM_BREAKOUT', 'AGGRESSIVE_LEVERAGE'],
    threshold: 75  // Higher conviction required to act in bear market
  },
  'HIGH_VOLATILITY': {
    description: 'Event-driven volatility spike (election outcomes, RBI policy shocks, geopolitical events, global contagion)',
    implication: 'Capital protection priority. Avoid new entries. Use smaller position sizes. Let volatility normalize before acting.',
    convictionMultiplier: 0.60,
    allowed: ['OVERSOLD_REBOUND'],
    avoid: ['MOMENTUM_BREAKOUT', 'LARGE_POSITIONS', 'STOP_LOSS_WIDENING'],
    threshold: 82  // Very high bar required
  },
  'MEAN_REVERTING': {
    description: 'Sideways range-bound market with no clear directional bias — index fluctuating in a tight band',
    implication: 'Range-trading strategies work best. Buy near support, sell near resistance. Avoid trend-following. Prefer dividend yield plays.',
    convictionMultiplier: 0.90,
    allowed: ['DIP_ACCUMULATION', 'OVERSOLD_REBOUND', 'VALUE_COMPOUNDER'],
    avoid: ['MOMENTUM_BREAKOUT', 'TREND_FOLLOWING'],
    threshold: 68
  },
  'UNKNOWN': {
    description: 'Insufficient market history to reliably classify the macro regime',
    implication: 'Operating with unskewed neutral parameters. Exercise standard risk management across all active positions.',
    convictionMultiplier: 1.0,
    allowed: ['DIP_ACCUMULATION', 'VALUE_COMPOUNDER', 'MOMENTUM_BREAKOUT', 'SECTOR_LEADER'],
    avoid: ['AGGRESSIVE_LEVERAGE'],
    threshold: 70
  }
};

export class MacroRegimeClassifierService {
  private static instance: MacroRegimeClassifierService;
  private currentRegime: RegimeState | null = null;
  private lastClassifiedAt: number = 0;
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // Reclassify every 1 hour

  public static getInstance(): MacroRegimeClassifierService {
    if (!MacroRegimeClassifierService.instance) {
      MacroRegimeClassifierService.instance = new MacroRegimeClassifierService();
    }
    return MacroRegimeClassifierService.instance;
  }


  public async initializeDatabase(): Promise<void> {
    const db = getDB();
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS MacroRegimeLog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        regime_date TEXT NOT NULL,
        regime TEXT NOT NULL,
        confidence REAL,
        nifty_5d_return REAL,
        nifty_20d_return REAL,
        realized_vol REAL,
        breadth_score REAL,
        vix_level REAL,
        conviction_multiplier REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(regime_date)
      )
    `);

    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS ModelRunLedger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        regime TEXT,
        stocks_scanned INTEGER DEFAULT 0,
        high_conviction_alerts INTEGER DEFAULT 0,
        sl_hits_evaluated INTEGER DEFAULT 0,
        weight_mutations_applied INTEGER DEFAULT 0,
        accuracy_pct REAL DEFAULT 0,
        run_duration_ms INTEGER DEFAULT 0,
        trigger_reason TEXT
      )
    `);
  }

  /**
   * Fetch Nifty50 price data from DB (from MarketSnapshots if available) or estimate from portfolio
   */
  private async getNiftyPrices(): Promise<number[]> {
    const db = getDB();

    // Try to get from MarketSnapshots first
    try {
      const rows = await dbAll(db, `
        SELECT close FROM MarketSnapshots
        WHERE symbol = 'NIFTY50' OR symbol = '^NSEI'
        ORDER BY snapshot_date DESC
        LIMIT 25
      `);
      if (rows && rows.length >= 5) {
        return rows.map((r: any) => r.close).reverse();
      }
    } catch { /* table may not exist yet */ }

    // Query HistoricalPrices table for canonical benchmark series
    try {
      const histRows = await dbAll(db, `
        SELECT close_price as close FROM HistoricalPrices
        WHERE symbol IN ('^NSEI', 'NIFTY50.NS', 'NIFTY 50', 'NIFTY50')
        ORDER BY date DESC
        LIMIT 25
      `);
      if (histRows && histRows.length >= 5) {
        return histRows.map((r: any) => Number(r.close)).reverse();
      }
    } catch { /* HistoricalPrices query failed */ }

    // ZFA: No synthetic fabricated Nifty prices. Return empty array if real data is unavailable.
    return [];
  }

  /**
   * Compute 20-day realized volatility (annualized)
   */
  private computeRealizedVolatility(prices: number[], window: number = 20): number {
    if (prices.length < window + 1) return 18; // Default 18% vol

    const returns: number[] = [];
    for (let i = 1; i <= window; i++) {
      const ret = Math.log(prices[prices.length - i] / prices[prices.length - i - 1]);
      returns.push(ret);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const dailyVol = Math.sqrt(variance);
    return dailyVol * Math.sqrt(252) * 100; // Annualize and convert to %
  }

  /**
   * Classify market regime from Nifty price series
   * Implements a simplified HMM state classification using observable emissions
   */
  public classifyRegime(niftyPrices: number[]): RegimeState {
    const n = niftyPrices.length;
    if (n < 5) {
      // ZFA: Strict honesty when price observations are insufficient
      return this.buildRegimeState('UNKNOWN', 0, 0, 0, 16, 50);
    }

    // 5-day return
    const ret5d = n >= 5
      ? ((niftyPrices[n - 1] - niftyPrices[n - 5]) / niftyPrices[n - 5]) * 100
      : 0;

    // 20-day return
    const ret20d = n >= 20
      ? ((niftyPrices[n - 1] - niftyPrices[n - 20]) / niftyPrices[n - 20]) * 100
      : ret5d * 4;

    // Realized volatility (20-day)
    const realizedVol = this.computeRealizedVolatility(niftyPrices, Math.min(20, n - 1));

    // VIX proxy
    const vixProxy = realizedVol * 1.12;

    // Breadth score: Proxy via dispersion in recent returns
    // Heuristic: Low volatility + positive trend → high breadth
    const breadthScore = Math.max(20, Math.min(80,
      50 + (ret20d > 5 ? 20 : ret20d > 0 ? 10 : ret20d < -5 ? -20 : -10)
        + (realizedVol < 12 ? 10 : realizedVol > 25 ? -15 : 0)
    ));

    // Momentum Z-score: How abnormal is the current return?
    // Approximate: (current 5d return) / (typical 5d std dev = annualVol / sqrt(52))
    const typicalWeeklyVol = realizedVol / Math.sqrt(52);
    const momentumZ = typicalWeeklyVol > 0 ? ret5d / typicalWeeklyVol : 0;

    // HMM-like regime classification using emission probabilities
    let regime: MarketRegime;
    let confidence: number;

    if (realizedVol > 28) {
      // Very high volatility → event-driven regime
      regime = 'HIGH_VOLATILITY';
      confidence = Math.min(95, 60 + (realizedVol - 28) * 2);
    } else if (ret20d < -5 && realizedVol > 18) {
      // Falling prices + elevated vol → bear trend
      regime = 'BEAR_TREND';
      confidence = Math.min(90, 55 + Math.abs(ret20d) * 2);
    } else if (ret20d > 4 && realizedVol < 20 && breadthScore > 55) {
      // Rising prices + low vol + broad participation → bull trend
      regime = 'BULL_TREND';
      confidence = Math.min(90, 55 + ret20d * 2 + (breadthScore - 55));
    } else {
      // Otherwise → consolidation / mean-reversion
      regime = 'MEAN_REVERTING';
      confidence = Math.min(80, 50 + (20 - Math.abs(ret20d)) * 2);
    }

    return this.buildRegimeState(regime, confidence, ret5d, ret20d, realizedVol, breadthScore, vixProxy, momentumZ);
  }

  private buildRegimeState(
    regime: MarketRegime,
    confidence: number,
    ret5d: number,
    ret20d: number,
    realizedVol: number,
    breadthScore: number,
    vixProxy: number = realizedVol * 1.12,
    momentumZ: number = 0
  ): RegimeState {
    const meta = REGIME_METADATA[regime];

    // Compute continuous softmax 3-state regime distribution
    const bullLogit = (ret20d * 0.15) + ((breadthScore - 50) * 0.04) - ((realizedVol - 15) * 0.08);
    const chopLogit = -Math.abs(ret20d) * 0.12 + 0.5 - ((realizedVol - 14) * 0.05);
    const bearLogit = -(ret20d * 0.18) + ((realizedVol - 18) * 0.10) - ((breadthScore - 50) * 0.05);

    const maxLogit = Math.max(bullLogit, chopLogit, bearLogit);
    const expBull = Math.exp(bullLogit - maxLogit);
    const expChop = Math.exp(chopLogit - maxLogit);
    const expBear = Math.exp(bearLogit - maxLogit);
    const sumExp = expBull + expChop + expBear;

    const pBull = Number((expBull / sumExp).toFixed(3));
    const pChop = Number((expChop / sumExp).toFixed(3));
    const pBear = Number((expBear / sumExp).toFixed(3));

    const isPreservation = regime === 'BEAR_TREND' || regime === 'HIGH_VOLATILITY' || vixProxy > 22 || ret20d < -4.0;
    const suggestedCashPct = regime === 'HIGH_VOLATILITY' ? 45 : regime === 'BEAR_TREND' ? 35 : regime === 'MEAN_REVERTING' ? 15 : 5;

    return {
      regime,
      confidence,
      regimeProbabilities: {
        bull: pBull,
        chop: pChop,
        bear: pBear
      },
      nifty5dReturnPct: ret5d,
      nifty20dReturnPct: ret20d,
      realizedVolatilityPct: realizedVol,
      breadthScore,
      momentumZ,
      vixLevel: vixProxy,
      regimeDescription: meta.description,
      investmentImplication: meta.implication,
      convictionMultiplier: meta.convictionMultiplier,
      capitalPreservationMode: isPreservation,
      suggestedCashAllocationPct: suggestedCashPct,
      allowedStrategies: meta.allowed,
      avoidStrategies: meta.avoid,
      scannerThreshold: meta.threshold
    };
  }

  /**
   * Get current regime (with caching to avoid re-computation)
   */
  public async getCurrentRegime(): Promise<RegimeState> {
    const now = Date.now();
    if (this.currentRegime && (now - this.lastClassifiedAt) < this.CACHE_TTL_MS) {
      return this.currentRegime;
    }

    const niftyPrices = await this.getNiftyPrices();
    const regime = this.classifyRegime(niftyPrices);

    this.currentRegime = regime;
    this.lastClassifiedAt = now;

    // Persist to DB
    await this.persistRegime(regime);

    return regime;
  }

  /**
   * Force reclassification (called by the hourly scheduler after fresh data ingestion)
   */
  public async forceReclassify(niftyPrices?: number[]): Promise<RegimeState> {
    this.lastClassifiedAt = 0; // Invalidate cache
    if (niftyPrices) {
      const regime = this.classifyRegime(niftyPrices);
      this.currentRegime = regime;
      this.lastClassifiedAt = Date.now();
      await this.persistRegime(regime);
      return regime;
    }
    return this.getCurrentRegime();
  }

  private async persistRegime(regime: RegimeState): Promise<void> {
    const db = getDB();
    const today = new Date().toISOString().split('T')[0];
    try {
      await dbRun(db, `
        INSERT OR REPLACE INTO MacroRegimeLog
          (regime_date, regime, confidence, nifty_5d_return, nifty_20d_return,
           realized_vol, breadth_score, vix_level, conviction_multiplier)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        today, regime.regime, regime.confidence,
        regime.nifty5dReturnPct, regime.nifty20dReturnPct,
        regime.realizedVolatilityPct, regime.breadthScore,
        regime.vixLevel, regime.convictionMultiplier
      ]);
    } catch { /* ignore duplicate */ }
  }

  /**
   * Get last 30 days of regime history
   */
  public async getRegimeHistory(days: number = 30): Promise<RegimeHistory[]> {
    const db = getDB();
    try {
      const rows = await dbAll(db, `
        SELECT regime_date, regime, confidence, conviction_multiplier
        FROM MacroRegimeLog
        ORDER BY regime_date DESC
        LIMIT ?
      `, [days]);

      return rows.map((r: any) => ({
        date: r.regime_date,
        regime: r.regime,
        confidence: r.confidence,
        convictionMultiplier: r.conviction_multiplier
      }));
    } catch {
      return [];
    }
  }

  /**
   * Adjust a composite signal score based on current market regime
   */
  public applyRegimeAdjustment(baseScore: number, regime: RegimeState): number {
    const adjusted = baseScore * regime.convictionMultiplier;
    return Math.max(0, Math.min(100, adjusted));
  }

  /**
   * Check if a strategy is recommended in the current regime
   */
  public isStrategyAllowed(strategy: string, regime: RegimeState): boolean {
    return regime.allowedStrategies.includes(strategy);
  }

  /**
   * Dynamic Enterprise Factor Weights for Stage 6 Convergence Scoring (§6.3)
   * Systematically modulates weights across Macro Regimes:
   * - RISK_ON (Bull Trend): Momentum & Technicals amplified (30%), Fundamentals 20%
   * - NEUTRAL_DEFENSIVE (Mean-Reverting): Balanced Fundamentals (30%) & Smart Money (30%)
   * - RISK_OFF (Bear Trend): Quality Fundamentals (35%) & Institutional Backing (35%) prioritized
   * - STAGFLATION / CHOP: Deep Value & Margin of Safety (40%) prioritized
   */
  public getEnterpriseFactorWeights(regimeState?: MarketRegime): FactorWeights {
    const reg = regimeState || this.currentRegime?.regime || 'BULL_TREND';
    switch (reg) {
      case 'BULL_TREND':
        return {
          regime: reg,
          technical: 0.30,
          fundamental: 0.20,
          institutional: 0.25,
          derivatives: 0.15,
          sentiment: 0.10,
          cashRedistributed: {
            technical: 0.35,
            fundamental: 0.25,
            institutional: 0.28,
            sentiment: 0.12
          }
        };
      case 'MEAN_REVERTING':
        return {
          regime: reg,
          technical: 0.20,
          fundamental: 0.30,
          institutional: 0.30,
          derivatives: 0.10,
          sentiment: 0.10,
          cashRedistributed: {
            technical: 0.23,
            fundamental: 0.34,
            institutional: 0.33,
            sentiment: 0.10
          }
        };
      case 'BEAR_TREND':
        return {
          regime: reg,
          technical: 0.15,
          fundamental: 0.35,
          institutional: 0.35,
          derivatives: 0.05,
          sentiment: 0.10,
          cashRedistributed: {
            technical: 0.16,
            fundamental: 0.37,
            institutional: 0.37,
            sentiment: 0.10
          }
        };
      case 'HIGH_VOLATILITY':
        return {
          regime: reg,
          technical: 0.10,
          fundamental: 0.40,
          institutional: 0.30,
          derivatives: 0.10,
          sentiment: 0.10,
          cashRedistributed: {
            technical: 0.12,
            fundamental: 0.44,
            institutional: 0.33,
            sentiment: 0.11
          }
        };
      default:
        return {
          regime: 'BULL_TREND',
          technical: 0.25,
          fundamental: 0.25,
          institutional: 0.25,
          derivatives: 0.10,
          sentiment: 0.15,
          cashRedistributed: {
            technical: 0.30,
            fundamental: 0.30,
            institutional: 0.25,
            sentiment: 0.15
          }
        };
    }
  }
}

export interface FactorWeights {
  regime: MarketRegime;
  technical: number;
  fundamental: number;
  institutional: number;
  derivatives: number;
  sentiment: number;
  cashRedistributed: {
    technical: number;
    fundamental: number;
    institutional: number;
    sentiment: number;
  };
}
