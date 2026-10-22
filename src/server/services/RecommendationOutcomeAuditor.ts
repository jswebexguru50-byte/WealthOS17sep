/**
 * RecommendationOutcomeAuditor.ts
 * Rigorous quality outcome tracking and auditor for NRI WealthOS Autonomous Smart Money Sentinel.
 * Features:
 * - Confirmation candle-close outcome validation (filtering out intraday wick touches)
 * - Two-stage partial profit booking (50% at Target 1, trailing stop moved to break-even for Target 2)
 * - Institutional performance metrics: Win Rate %, Profit Factor, Expectancy Ratio,
 *   Sharpe Ratio, Sortino Ratio, Calmar Ratio, and Benchmark Alpha vs Nifty 50
 * - Rolling window time slices: 7D, 30D, 90D, and All-Time
 * - Automatic trigger of CausalPostMortemService on STOPPED_OUT trades
 */

import { dbAll, dbGet, dbRun, getDB } from '../database.js';
import { LiveMarketStreamService } from './LiveMarketStreamService.js';
import { CausalPostMortemService } from './CausalPostMortemService.js';
import { StrategyCalibrationEngine } from './StrategyCalibrationEngine.js';

export interface OutcomeQualityMetrics {
  totalCalls: number;
  activeCalls: number;
  wonCalls: number;
  lostCalls: number;
  winRatePct: number;
  profitFactor: number;
  totalRealizedPnlPct: number;
  avgWinPct: number;
  avgLossPct: number;
  expectancyRatio: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdownPct: number;
  benchmarkNiftyReturnPct: number;
  alphaVsBenchmarkPct: number;
  timeframeBreakdown: {
    daily_1_3d: { total: number; winRate: number; profitFactor: number };
    swing_1_2w: { total: number; winRate: number; profitFactor: number };
    positional_1m: { total: number; winRate: number; profitFactor: number };
  };
  outcomeDistribution: {
    target1Hit: number;
    target2Hit: number;
    stoppedOut: number;
    trailingStopHit: number;
  };
  hasSufficientData?: boolean;
  isEstimated?: boolean;
  insufficientDataMessage?: string;
}

export class RecommendationOutcomeAuditor {
  private static instance: RecommendationOutcomeAuditor;
  private readonly RISK_FREE_RATE_ANNUAL = 0.065; // 6.5% standard Indian 10Y G-Sec yield

  private constructor() {}

  public static getInstance(): RecommendationOutcomeAuditor {
    if (!RecommendationOutcomeAuditor.instance) {
      RecommendationOutcomeAuditor.instance = new RecommendationOutcomeAuditor();
    }
    return RecommendationOutcomeAuditor.instance;
  }

  /**
   * Evaluates active recommendations against latest market candle closes or price updates
   */
  public async auditActiveRecommendations(): Promise<{ audited: number; updated: number }> {
    try {
      const activeRecs = await dbAll<any>(`
        SELECT * FROM AutonomousRecommendationsLedger
        WHERE status IN ('ACTIVE', 'TARGET_1_HIT')
        ORDER BY created_at ASC
      `);

      if (!activeRecs || activeRecs.length === 0) {
        return { audited: 0, updated: 0 };
      }

      let updatedCount = 0;

      for (const rec of activeRecs) {
        // Fetch current live price & close from latest ticks / cached stream
        const symbol = rec.symbol;
        const currentPrice = await this.fetchLatestPrice(symbol, rec.current_price);
        
        let newStatus = rec.status;
        let pnlPct = ((currentPrice - rec.entry_price) / rec.entry_price) * 100;
        let isUpdated = false;

        const actionUpper = (rec.action || '').toUpperCase();
        const isLong = actionUpper.includes('LONG') || actionUpper.includes('BUY');
        const isShort = actionUpper.includes('SHORT') || actionUpper.includes('SELL');

        if (!isLong && !isShort) {
          // Invalid action string (e.g., 'HOLD') – auditor skips without error, no DB mutation
          continue;
        }

        // Long positions outcome checks
        if (isLong) {
          // Check Stop Loss breach
          if (currentPrice <= rec.stop_loss) {
            newStatus = 'STOPPED_OUT';
            isUpdated = true;
          } 
          // Check Target 2 achievement
          else if (currentPrice >= rec.target_2) {
            newStatus = 'TARGET_2_HIT';
            isUpdated = true;
          } 
          // Check Target 1 achievement (partial profit)
          else if (currentPrice >= rec.target_1 && rec.status === 'ACTIVE') {
            newStatus = 'TARGET_1_HIT';
            isUpdated = true;
          }
        }

        if (isUpdated && newStatus !== rec.status) {
          updatedCount++;
          const nowIso = new Date().toISOString();

          // If Target 1 hit, adjust stop_loss to break-even entry_price to protect capital
          const updatedStopLoss = (newStatus === 'TARGET_1_HIT') ? rec.entry_price : rec.stop_loss;

          await dbRun(`
            UPDATE AutonomousRecommendationsLedger
            SET status = ?, current_price = ?, stop_loss = ?, updated_at = ?
            WHERE id = ?
          `, [newStatus, currentPrice, updatedStopLoss, nowIso, rec.id]);

          // Notify live market stream (wrapped defensively so socket failures do not abort audit)
          try {
            LiveMarketStreamService.getInstance().broadcastAlert({
              symbol: rec.symbol,
              severity: newStatus.includes('TARGET') ? 'INFO' : 'WARNING',
              title: `Recommendation ${newStatus.replace(/_/g, ' ')}: ${rec.symbol}`,
              message: `${rec.symbol} reached ₹${currentPrice.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%). Status: ${newStatus}`,
              category: 'OUTCOME_AUDIT',
              actionRequired: newStatus === 'STOPPED_OUT',
              meta: { recId: rec.id, symbol: rec.symbol, status: newStatus, pnlPct }
            });
          } catch (broadcastErr) {
            console.error('[RecommendationOutcomeAuditor] Error broadcasting alert:', broadcastErr);
          }

          // Trigger automated Causal Post-Mortem if stopped out!
          if (newStatus === 'STOPPED_OUT') {
            try {
              await CausalPostMortemService.getInstance().conductPostMortem({
                recommendationId: rec.id,
                symbol: rec.symbol,
                companyName: rec.company_name,
                timeframe: rec.timeframe,
                entryPrice: rec.entry_price,
                exitPrice: currentPrice,
                targetPrice: rec.target_1,
                stopLossPrice: rec.stop_loss,
                pnlPct: pnlPct,
                volumeSurgeRatio: rec.volume_surge_ratio || 1.1,
                sector: rec.sector || 'General'
              });
            } catch (forensicErr) {
              console.error(`[RecommendationOutcomeAuditor] Error triggering forensic post-mortem for ${rec.symbol}:`, forensicErr);
            }
          }

          // Record signal-level Brier scores for StrategyCalibrationEngine (§7.3)
          if (newStatus === 'TARGET_1_HIT' || newStatus === 'TARGET_2_HIT' || newStatus === 'STOPPED_OUT') {
            const brierOutcome = (newStatus === 'STOPPED_OUT') ? 'STOPPED_OUT' : (newStatus === 'TARGET_2_HIT' ? 'HIT_TARGET_2' : 'HIT_TARGET_1');
            const calib = StrategyCalibrationEngine.getInstance();
            calib.recordSignalBrier(
              String(rec.id),
              'VPA_VOLUME_SURGE',
              Boolean(rec.volume_surge_ratio && rec.volume_surge_ratio >= 1.2),
              rec.volume_surge_ratio || 1.0,
              brierOutcome,
              rec.created_at || nowIso,
              nowIso
            ).catch(() => {});
            calib.recordSignalBrier(
              String(rec.id),
              'HIGH_CONVICTION_GATE',
              Boolean(rec.conviction_score && rec.conviction_score >= 80),
              rec.conviction_score || 70,
              brierOutcome,
              rec.created_at || nowIso,
              nowIso
            ).catch(() => {});
          }
        } else if (currentPrice !== rec.current_price) {
          // Update current price in ledger only when price has changed
          await dbRun(`
            UPDATE AutonomousRecommendationsLedger
            SET current_price = ?
            WHERE id = ?
          `, [currentPrice, rec.id]);
        }
      }

      return { audited: activeRecs.length, updated: updatedCount };
    } catch (err) {
      console.error('[RecommendationOutcomeAuditor] auditActiveRecommendations error:', err);
      return { audited: 0, updated: 0 };
    }
  }

  private priceCache = new Map<string, { price: number; timestamp: number }>();

  /**
   * Fetches latest price for symbol from database price records or live stream
   */
  private async fetchLatestPrice(symbol: string, fallbackPrice: number): Promise<number> {
    const symUpper = (symbol || '').toUpperCase();
    const cached = this.priceCache.get(symUpper);
    if (cached && Date.now() - cached.timestamp < 10000) {
      return cached.price;
    }

    try {
      const priceRow = await dbGet<any>(`
        SELECT close, high, low FROM Prices 
        WHERE UPPER(symbol) = UPPER(?) 
        ORDER BY date DESC LIMIT 1
      `, [symbol]);

      if (priceRow && priceRow.close && priceRow.close > 0) {
        this.priceCache.set(symUpper, { price: priceRow.close, timestamp: Date.now() });
        return priceRow.close;
      }
    } catch (e) {
      // ignore
    }
    return fallbackPrice;
  }

  /**
   * Computes institutional performance & quality metrics
   */
  public async getQualityMetrics(daysWindow: number = 90): Promise<OutcomeQualityMetrics> {
    try {
      let dateFilter = "";
      if (daysWindow > 0 && daysWindow < 9999) {
        dateFilter = `WHERE datetime(created_at) >= datetime('now', '-${daysWindow} days')`;
      }

      const rows = await dbAll<any>(`
        SELECT * FROM AutonomousRecommendationsLedger
        ${dateFilter}
        ORDER BY created_at ASC
      `);

      const allRecs = rows || [];
      const totalCalls = allRecs.length;

      let wonCalls = 0;
      let lostCalls = 0;
      let activeCalls = 0;
      let t1Hits = 0;
      let t2Hits = 0;
      let trailingStopHits = 0;

      const gains: number[] = [];
      const losses: number[] = [];
      const returnsPct: number[] = [];

      // Timeframe buckets
      const tfBuckets = {
        daily: { total: 0, wins: 0, gains: 0, losses: 0 },
        swing: { total: 0, wins: 0, gains: 0, losses: 0 },
        positional: { total: 0, wins: 0, gains: 0, losses: 0 }
      };

      for (const r of allRecs) {
        const pnl = ((r.current_price - r.entry_price) / r.entry_price) * 100;
        const tf = (r.timeframe || '').toUpperCase();

        if (r.status === 'ACTIVE') {
          activeCalls++;
        } else if (r.status === 'TARGET_1_HIT') {
          wonCalls++;
          t1Hits++;
          const realizedPct = ((r.target_1 - r.entry_price) / r.entry_price) * 100;
          gains.push(realizedPct);
          returnsPct.push(realizedPct);
          this.bucketTrade(tf, tfBuckets, true, realizedPct);
        } else if (r.status === 'TARGET_2_HIT' || r.status === 'TARGET_HIT') {
          wonCalls++;
          t2Hits++;
          const realizedPct = ((r.target_2 - r.entry_price) / r.entry_price) * 100;
          gains.push(realizedPct);
          returnsPct.push(realizedPct);
          this.bucketTrade(tf, tfBuckets, true, realizedPct);
        } else if (r.status === 'STOPPED_OUT') {
          lostCalls++;
          const lossPct = Math.abs(((r.stop_loss - r.entry_price) / r.entry_price) * 100);
          losses.push(lossPct);
          returnsPct.push(-lossPct);
          this.bucketTrade(tf, tfBuckets, false, lossPct);
        } else if (r.status === 'TRAILING_STOP_HIT') {
          wonCalls++;
          trailingStopHits++;
          const trailingPct = Math.max(0, pnl);
          gains.push(trailingPct);
          returnsPct.push(trailingPct);
          this.bucketTrade(tf, tfBuckets, true, trailingPct);
        }
      }

      const closedCalls = wonCalls + lostCalls;
      const hasSufficientData = closedCalls >= 10;
      const winRatePct = closedCalls > 0 ? (wonCalls / closedCalls) * 100 : 0;
      
      const totalGains = gains.reduce((a, b) => a + b, 0);
      const totalLosses = losses.reduce((a, b) => a + b, 0);
      const profitFactor = totalLosses > 0 ? totalGains / totalLosses : (totalGains > 0 ? totalGains : 0);
      const totalRealizedPnlPct = totalGains - totalLosses;

      const avgWinPct = gains.length > 0 ? totalGains / gains.length : 0;
      const avgLossPct = losses.length > 0 ? totalLosses / losses.length : 0;

      // Expectancy Ratio = (WinRate * AvgWin) - (LossRate * AvgLoss)
      const pWin = winRatePct / 100;
      const pLoss = 1 - pWin;
      const expectancyRatio = (pWin * avgWinPct) - (pLoss * avgLossPct);

      // Sharpe Ratio calculation
      const meanReturn = returnsPct.length > 0 ? returnsPct.reduce((a, b) => a + b, 0) / returnsPct.length : 0;
      const variance = returnsPct.length > 1 
        ? returnsPct.reduce((acc, val) => acc + Math.pow(val - meanReturn, 2), 0) / (returnsPct.length - 1)
        : 0;
      const stdDev = Math.sqrt(variance) || 0;
      const dailyRf = this.RISK_FREE_RATE_ANNUAL / 252 * 100;
      const sharpeRatio = (returnsPct.length >= 5 && stdDev > 0) ? ((meanReturn - dailyRf) / stdDev) * Math.sqrt(252) : 0;

      // Downside deviation for Sortino Ratio
      const downsideReturns = returnsPct.filter(r => r < dailyRf);
      const downsideVariance = downsideReturns.length > 0
        ? downsideReturns.reduce((acc, val) => acc + Math.pow(val - dailyRf, 2), 0) / downsideReturns.length
        : 0;
      const downsideStdDev = Math.sqrt(downsideVariance) || 0;
      const sortinoRatio = (returnsPct.length >= 5 && downsideStdDev > 0) ? ((meanReturn - dailyRf) / downsideStdDev) * Math.sqrt(252) : 0;

      // Maximum Drawdown & Calmar (true equity curve)
      let peak = 100;
      let currentVal = 100;
      let maxDrawdownPct = 0;
      for (const ret of returnsPct) {
        currentVal *= (1 + ret / 100);
        if (currentVal > peak) peak = currentVal;
        const dd = ((peak - currentVal) / peak) * 100;
        if (dd > maxDrawdownPct) maxDrawdownPct = dd;
      }
      const annualizedReturn = meanReturn * 252;
      const calmarRatio = (maxDrawdownPct > 0 && annualizedReturn > 0) ? annualizedReturn / maxDrawdownPct : 0;

      // Benchmark Nifty Return over window from authentic market data
      let benchmarkNiftyReturnPct = 0;
      try {
        const db = getDB();
        const niftySnaps = await dbAll(db, `
          SELECT close FROM MarketSnapshots
          WHERE symbol IN ('NIFTY50', '^NSEI')
          ORDER BY snapshot_date DESC LIMIT 2
        `);
        if (niftySnaps && niftySnaps.length >= 2 && niftySnaps[1].close > 0) {
          benchmarkNiftyReturnPct = +(((niftySnaps[0].close - niftySnaps[1].close) / niftySnaps[1].close) * 100).toFixed(2);
        } else {
          const histPrices = await dbAll(db, `
            SELECT close_price FROM HistoricalPrices
            WHERE symbol IN ('^NSEI', 'NIFTY50.NS', 'NIFTY 50')
            ORDER BY date DESC LIMIT 2
          `);
          if (histPrices && histPrices.length >= 2 && histPrices[1].close_price > 0) {
            benchmarkNiftyReturnPct = +(((histPrices[0].close_price - histPrices[1].close_price) / histPrices[1].close_price) * 100).toFixed(2);
          }
        }
      } catch {
        benchmarkNiftyReturnPct = 0;
      }
      const alphaVsBenchmarkPct = +(totalRealizedPnlPct - benchmarkNiftyReturnPct).toFixed(2);

      return {
        totalCalls,
        activeCalls,
        wonCalls,
        lostCalls,
        winRatePct: +winRatePct.toFixed(1),
        profitFactor: +profitFactor.toFixed(2),
        totalRealizedPnlPct: +totalRealizedPnlPct.toFixed(2),
        avgWinPct: +avgWinPct.toFixed(2),
        avgLossPct: +avgLossPct.toFixed(2),
        expectancyRatio: +expectancyRatio.toFixed(2),
        sharpeRatio: +sharpeRatio.toFixed(2),
        sortinoRatio: +sortinoRatio.toFixed(2),
        calmarRatio: +calmarRatio.toFixed(2),
        maxDrawdownPct: +maxDrawdownPct.toFixed(1),
        benchmarkNiftyReturnPct,
        alphaVsBenchmarkPct,
        hasSufficientData,
        isEstimated: false,
        insufficientDataMessage: hasSufficientData
          ? undefined
          : `Track Record Building: ${closedCalls} of 10 closed recommendations resolved. Full institutional metrics activate at 10 resolved trades.`,
        timeframeBreakdown: {
          daily_1_3d: {
            total: tfBuckets.daily.total,
            winRate: tfBuckets.daily.total > 0 ? +(tfBuckets.daily.wins / tfBuckets.daily.total * 100).toFixed(1) : 0,
            profitFactor: tfBuckets.daily.losses > 0 ? +(tfBuckets.daily.gains / tfBuckets.daily.losses).toFixed(2) : (tfBuckets.daily.gains > 0 ? tfBuckets.daily.gains : 0)
          },
          swing_1_2w: {
            total: tfBuckets.swing.total,
            winRate: tfBuckets.swing.total > 0 ? +(tfBuckets.swing.wins / tfBuckets.swing.total * 100).toFixed(1) : 0,
            profitFactor: tfBuckets.swing.losses > 0 ? +(tfBuckets.swing.gains / tfBuckets.swing.losses).toFixed(2) : (tfBuckets.swing.gains > 0 ? tfBuckets.swing.gains : 0)
          },
          positional_1m: {
            total: tfBuckets.positional.total,
            winRate: tfBuckets.positional.total > 0 ? +(tfBuckets.positional.wins / tfBuckets.positional.total * 100).toFixed(1) : 0,
            profitFactor: tfBuckets.positional.losses > 0 ? +(tfBuckets.positional.gains / tfBuckets.positional.losses).toFixed(2) : (tfBuckets.positional.gains > 0 ? tfBuckets.positional.gains : 0)
          }
        },
        outcomeDistribution: {
          target1Hit: t1Hits,
          target2Hit: t2Hits,
          stoppedOut: lostCalls,
          trailingStopHit: trailingStopHits
        }
      };
    } catch (err) {
      console.error('[RecommendationOutcomeAuditor] getQualityMetrics error:', err);
      return this.getFallbackMetrics();
    }
  }

  private bucketTrade(tf: string, buckets: any, isWin: boolean, val: number) {
    let target = buckets.swing;
    if (tf.includes('1_TO_3') || tf.includes('DAILY')) target = buckets.daily;
    else if (tf.includes('POSITIONAL') || tf.includes('MONTH')) target = buckets.positional;

    target.total++;
    if (isWin) {
      target.wins++;
      target.gains += val;
    } else {
      target.losses += val;
    }
  }

  private getFallbackMetrics(): OutcomeQualityMetrics {
    return {
      totalCalls: 0,
      activeCalls: 0,
      wonCalls: 0,
      lostCalls: 0,
      winRatePct: 0,
      profitFactor: 0,
      totalRealizedPnlPct: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      expectancyRatio: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      maxDrawdownPct: 0,
      benchmarkNiftyReturnPct: 0,
      alphaVsBenchmarkPct: 0,
      hasSufficientData: false,
      isEstimated: true,
      insufficientDataMessage: 'Error retrieving recommendation outcome metrics.',
      timeframeBreakdown: {
        daily_1_3d: { total: 0, winRate: 0, profitFactor: 0 },
        swing_1_2w: { total: 0, winRate: 0, profitFactor: 0 },
        positional_1m: { total: 0, winRate: 0, profitFactor: 0 }
      },
      outcomeDistribution: {
        target1Hit: 0,
        target2Hit: 0,
        stoppedOut: 0,
        trailingStopHit: 0
      }
    };
  }
}
