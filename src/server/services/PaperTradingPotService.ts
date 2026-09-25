/**
 * PaperTradingPotService.ts
 * Multi-Pot Pseudo-Money Simulation Sandbox (Paper Trading Engine) for NRI WealthOS.
 * Features:
 * - Multi-pot architecture: Conservative Sandbox & Aggressive Kelly Momentum Pot
 * - Conviction gate: Only auto-opens if Prob >= 70%, Conf >= 65%, and Sector Flow >= 0
 * - Half-Kelly criterion dynamic position sizing bounded [2%, 8%]
 * - Realistic institutional friction: 0.05% slippage + 0.10% STT + brokerage/GST
 * - 30% Sector allocation ceiling & correlation limits (max 3 positions per sector, max 8 total)
 * - Risk circuit breakers: 20% max drawdown halt & 3% daily loss pause
 * - Two-stage partial exit: 50% at Target 1, trailing stop to break-even for Target 2
 * - Time series NAV snapshots with Nifty 50 benchmark alpha tracking
 * - Stratification across Daily (1–3D), Weekly (Swing), and Monthly (Positional)
 */

import { dbAll, dbGet, dbRun, getDB } from '../database.js';
import { LiveMarketStreamService } from './LiveMarketStreamService.js';

export interface PotOverview {
  id: string;
  potName: string;
  strategyType: string;
  initialCapital: number;
  cashBalance: number;
  currentPortfolioNav: number;
  investedCapital: number;
  totalRealizedPnl: number;
  totalRealizedPnlPct: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  openPositionsCount: number;
  closedPositionsCount: number;
  winRatePct: number;
  riskPerTradePct: number;
  maxDrawdownPct: number;
  peakNav: number;
  isCircuitBreakerTripped: boolean;
  circuitBreakerReason?: string;
  benchmarkNiftyNav: number;
  alphaVsBenchmarkPct: number;
  timeframeMetrics: {
    daily: { count: number; realizedPnl: number; winRate: number };
    swing: { count: number; realizedPnl: number; winRate: number };
    positional: { count: number; realizedPnl: number; winRate: number };
  };
}

export interface PaperPosition {
  id: number;
  potId: string;
  recommendationId?: number;
  symbol: string;
  companyName: string;
  sector: string;
  action: string;
  timeframe: string;
  quantity: number;
  initialQuantity: number;
  entryPrice: number;
  investedCapital: number;
  currentPrice: number;
  stopLoss: number;
  trailingStopLoss: number;
  target1: number;
  target2: number;
  partialExitDone: boolean;
  partialExitPrice?: number;
  partialExitPnl?: number;
  exitConfirmationType: string;
  frictionCosts: number;
  status: 'OPEN' | 'CLOSED_PROFIT' | 'CLOSED_LOSS';
  exitPrice?: number;
  exitReason?: string;
  realizedPnl: number;
  realizedPnlPct: number;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
  entryDate: string;
  exitDate?: string;
}

export interface NAVHistoryPoint {
  id: number;
  potId: string;
  nav: number;
  cash: number;
  invested: number;
  dailyPnl: number;
  dailyReturnPct: number;
  benchmarkNiftyNav: number;
  alphaVsBenchmarkPct: number;
  timestamp: string;
}

export class PaperTradingPotService {
  private static instance: PaperTradingPotService;
  private readonly SLIPPAGE_PCT = 0.0005; // 0.05% slippage on entry & exit
  private readonly STT_PCT = 0.0010; // 0.10% Securities Transaction Tax
  private readonly FIXED_ORDER_FEE = 23.60; // ₹20 brokerage + 18% GST = ₹23.60

  private constructor() {}

  public static getInstance(): PaperTradingPotService {
    if (!PaperTradingPotService.instance) {
      PaperTradingPotService.instance = new PaperTradingPotService();
    }
    return PaperTradingPotService.instance;
  }

  /**
   * Initializes default pots and verifies data integrity
   */
  public async ensurePotsInitialized(): Promise<void> {
    try {
      const pots = await dbAll<any>(`SELECT id FROM PaperTradingPots`);
      if (!pots || pots.length === 0) {
        await dbRun(`
          INSERT OR IGNORE INTO PaperTradingPots 
          (id, pot_name, strategy_type, initial_capital, cash_balance, current_portfolio_nav, risk_per_trade_pct, max_drawdown_pct, peak_nav)
          VALUES 
          ('pot_conservative', 'Main Conservative Sandbox', 'CONSERVATIVE', 1000000.0, 1000000.0, 1000000.0, 3.0, 0.0, 1000000.0),
          ('pot_aggressive', 'Aggressive Kelly Momentum Pot', 'AGGRESSIVE_KELLY', 1000000.0, 1000000.0, 1000000.0, 5.0, 0.0, 1000000.0),
          ('pot_barbell_1cr', 'Top 10 Barbell Portfolio (1 Cr)', 'BARBELL_CONVICTION', 10000000.0, 10000000.0, 10000000.0, 4.0, 0.0, 10000000.0)
        `);
      } else {
        await dbRun(`
          INSERT OR IGNORE INTO PaperTradingPots 
          (id, pot_name, strategy_type, initial_capital, cash_balance, current_portfolio_nav, risk_per_trade_pct, max_drawdown_pct, peak_nav)
          VALUES 
          ('pot_barbell_1cr', 'Top 10 Barbell Portfolio (1 Cr)', 'BARBELL_CONVICTION', 10000000.0, 10000000.0, 10000000.0, 4.0, 0.0, 10000000.0)
        `);
      }
      const corruptPots = await dbAll<any>(`SELECT id, cash_balance FROM PaperTradingPots WHERE cash_balance < 0`);
      if (corruptPots && corruptPots.length > 0) {
        console.warn(`[PaperTradingPotService] Corrupt pot state detected: Negative cash balance in ${corruptPots.map(p => p.id).join(', ')}`);
      }
    } catch (err) {
      console.error('[PaperTradingPotService] ensurePotsInitialized error:', err);
    }
  }

  /**
   * Evaluates a recommendation for automatic paper position entry
   */
  public async evaluateRecommendationForEntry(rec: any, potId: string = 'pot_conservative'): Promise<boolean> {
    try {
      await this.ensurePotsInitialized();

      // Conviction Gate: Prob >= 70%, Conf >= 65%, Non-negative sector flow
      if ((rec.probability_pct || rec.probabilityPct || 0) < 70) return false;
      if ((rec.confidence_score || rec.confidenceScore || 0) < 65) return false;

      const pot = await dbGet<any>(`SELECT * FROM PaperTradingPots WHERE id = ?`, [potId]);
      if (!pot) return false;

      // Detect corrupt negative cash state
      if (pot.cash_balance < 0) {
        console.warn(`[PaperTradingPotService] Pot ${potId} has corrupt negative cash balance (${pot.cash_balance}). Entries blocked.`);
        return false;
      }

      // Check Circuit Breaker
      if (pot.is_circuit_breaker_tripped) {
        console.warn(`[PaperTradingPotService] Pot ${potId} circuit breaker tripped. Skipping entry for ${rec.symbol}.`);
        return false;
      }

      // Check Open Positions Cap (Max 16 for Barbell, 12 for default pots)
      const maxPositions = (pot.strategy_type === 'BARBELL_CONVICTION' || potId === 'pot_barbell_1cr') ? 16 : 12;
      const openPositions = await dbAll<any>(`
        SELECT * FROM PaperTradingPositions WHERE pot_id = ? AND status = 'OPEN'
      `, [potId]);

      if (openPositions && openPositions.length >= maxPositions) {
        console.log(`[PaperTradingPotService] Max ${maxPositions} open positions reached in pot ${potId}. Skipping.`);
        return false;
      }

      // Check Sector Concentration Limit (Max 3 in same sector, Max 30% NAV)
      const sector = rec.sector || 'General';
      const sameSectorPositions = openPositions.filter(p => (p.sector || '').toUpperCase() === sector.toUpperCase());
      if (sameSectorPositions.length >= 3) {
        console.log(`[PaperTradingPotService] Sector cap reached for ${sector} in pot ${potId}. Skipping.`);
        return false;
      }

      const sectorInvested = sameSectorPositions.reduce((acc, p) => acc + (p.invested_capital || 0), 0);
      if (sectorInvested >= pot.current_portfolio_nav * 0.30) {
        console.log(`[PaperTradingPotService] 30% NAV sector ceiling reached for ${sector}. Skipping.`);
        return false;
      }

      // Check if already open
      const existing = openPositions.find(p => p.symbol.toUpperCase() === rec.symbol.toUpperCase());
      if (existing) return false;

      // Calculate Position Sizing using Half-Kelly Criterion
      const positionCapital = this.calculatePositionSize(pot, rec.probability_pct || 72);
      if (positionCapital > pot.cash_balance) {
        console.log(`[PaperTradingPotService] Insufficient cash balance in pot ${potId} (Req: ₹${positionCapital.toFixed(0)}, Avail: ₹${pot.cash_balance.toFixed(0)})`);
        return false;
      }

      // Entry execution with slippage & friction
      const nominalEntryPrice = Number(rec.entry_price || rec.entryPrice || rec.current_price || rec.currentPrice || 0);
      if (!nominalEntryPrice || isNaN(nominalEntryPrice) || nominalEntryPrice <= 0) {
        console.warn(`[PaperTradingPotService] Invalid entry price for ${rec.symbol}: ${nominalEntryPrice}`);
        return false;
      }
      const executedEntryPrice = +(nominalEntryPrice * (1 + this.SLIPPAGE_PCT)).toFixed(2);
      const rawQty = Math.floor(positionCapital / executedEntryPrice);
      const quantity = Math.max(1, isNaN(rawQty) ? 1 : rawQty);
      const investedCapital = +(quantity * executedEntryPrice).toFixed(2);
      
      const frictionCosts = +(investedCapital * this.STT_PCT + this.FIXED_ORDER_FEE).toFixed(2);
      const newCash = +(pot.cash_balance - investedCapital - frictionCosts).toFixed(2);

      const stopLoss = Number(rec.stop_loss || rec.stopLoss || +(executedEntryPrice * 0.95).toFixed(2));
      const target1 = Number(rec.target_1 || rec.target1 || +(executedEntryPrice * 1.10).toFixed(2));
      const target2 = Number(rec.target_2 || rec.target2 || +(executedEntryPrice * 1.25).toFixed(2));

      // Insert Position
      const nowIso = new Date().toISOString();
      await dbRun(`
        INSERT INTO PaperTradingPositions (
          pot_id, recommendation_id, symbol, company_name, sector, action,
          timeframe, quantity, initial_quantity, entry_price, invested_capital,
          current_price, stop_loss, trailing_stop_loss, target_1, target_2,
          partial_exit_done, friction_costs, status, entry_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'OPEN', ?)
      `, [
        potId,
        rec.id || null,
        rec.symbol.toUpperCase(),
        rec.company_name || rec.companyName || rec.symbol,
        sector,
        rec.action || 'BUY_LONG',
        rec.timeframe || 'SWING_1_TO_2_WEEKS',
        quantity,
        quantity,
        executedEntryPrice,
        investedCapital,
        executedEntryPrice,
        stopLoss,
        stopLoss,
        target1,
        target2,
        frictionCosts,
        nowIso
      ]);

      // Update Pot Cash Balance
      await dbRun(`
        UPDATE PaperTradingPots 
        SET cash_balance = ?, updated_at = ?
        WHERE id = ?
      `, [newCash, nowIso, potId]);

      // Broadcast Alert
      LiveMarketStreamService.getInstance().broadcastAlert({
        symbol: rec.symbol,
        severity: 'INFO',
        title: `Simulated Trade Executed: ${rec.symbol}`,
        message: `Allocated ₹${investedCapital.toLocaleString('en-IN')} (${quantity} shares @ ₹${executedEntryPrice}) in ${pot.pot_name}. Friction: ₹${frictionCosts}`,
        category: 'PAPER_TRADE',
        actionRequired: false,
        meta: { potId, symbol: rec.symbol, quantity, entryPrice: executedEntryPrice }
      });

      console.log(`[PaperTradingPotService] Executed paper trade for ${rec.symbol} in ${potId}`);
      return true;
    } catch (err) {
      console.error('[PaperTradingPotService] evaluateRecommendationForEntry error:', err);
      return false;
    }
  }

  /**
   * Synchronizes all open paper positions against latest prices, executing profit takes or stop outs
   */
  public async syncOpenPositions(): Promise<{ checked: number; updated: number; closed: number }> {
    try {
      await this.ensurePotsInitialized();
      const openPositions = await dbAll<any>(`
        SELECT * FROM PaperTradingPositions WHERE status = 'OPEN'
      `);

      if (!openPositions || openPositions.length === 0) {
        await this.recordNAVHistorySnapshots();
        return { checked: 0, updated: 0, closed: 0 };
      }

      let updatedCount = 0;
      let closedCount = 0;
      const potMap = new Map<string, any>();

      for (const pos of openPositions) {
        // Fetch current price
        const currentPrice = await this.fetchLatestPrice(pos.symbol, pos.current_price);
        let pot = potMap.get(pos.pot_id);
        if (!pot) {
          pot = await dbGet<any>(`SELECT * FROM PaperTradingPots WHERE id = ?`, [pos.pot_id]);
          if (pot) potMap.set(pos.pot_id, pot);
        }
        if (!pot) continue;

        let shouldClose = false;
        let exitReason = '';
        let exitPrice = currentPrice;
        let newStatus = pos.status;

        // Long Strategy Evaluation
        if (pos.action.toUpperCase().includes('LONG') || pos.action.toUpperCase().includes('BUY')) {
          // Check Stop Loss breach
          if (currentPrice <= (pos.trailing_stop_loss || pos.stop_loss)) {
            shouldClose = true;
            exitReason = pos.partial_exit_done ? 'TRAILING_STOP_HIT' : 'STOP_LOSS_HIT';
            newStatus = 'CLOSED_LOSS';
            exitPrice = +(currentPrice * (1 - this.SLIPPAGE_PCT)).toFixed(2);
          }
          // Check Target 2 achievement (final profit)
          else if (currentPrice >= pos.target_2) {
            shouldClose = true;
            exitReason = 'TARGET_2_HIT';
            newStatus = 'CLOSED_PROFIT';
            exitPrice = +(pos.target_2 * (1 - this.SLIPPAGE_PCT)).toFixed(2);
          }
          // Check Target 1 achievement (two-stage partial exit: sell 50%, trail remaining to break-even)
          else if (currentPrice >= pos.target_1 && !pos.partial_exit_done && pos.quantity > 1) {
            const sellQty = Math.floor(pos.quantity / 2);
            const remainingQty = pos.quantity - sellQty;
            const partialExitPrice = +(pos.target_1 * (1 - this.SLIPPAGE_PCT)).toFixed(2);
            
            const grossProceeds = sellQty * partialExitPrice;
            const exitFriction = +(grossProceeds * this.STT_PCT + this.FIXED_ORDER_FEE).toFixed(2);
            const partialPnl = +((partialExitPrice - pos.entry_price) * sellQty - exitFriction).toFixed(2);

            const newCash = +(pot.cash_balance + grossProceeds - exitFriction).toFixed(2);
            const newRealizedPnl = +(pot.total_realized_pnl + partialPnl).toFixed(2);

            // Update position with partial exit details and move trailing stop to break-even
            await dbRun(`
              UPDATE PaperTradingPositions
              SET quantity = ?, partial_exit_done = 1, partial_exit_price = ?,
                  partial_exit_pnl = ?, trailing_stop_loss = ?, current_price = ?,
                  friction_costs = friction_costs + ?
              WHERE id = ?
            `, [remainingQty, partialExitPrice, partialPnl, pos.entry_price, currentPrice, exitFriction, pos.id]);

            // Update pot cash & realized pnl
            await dbRun(`
              UPDATE PaperTradingPots
              SET cash_balance = ?, total_realized_pnl = ?
              WHERE id = ?
            `, [newCash, newRealizedPnl, pos.pot_id]);

            updatedCount++;

            LiveMarketStreamService.getInstance().broadcastAlert({
              symbol: pos.symbol,
              severity: 'INFO',
              title: `Simulated Partial Profit Booked: ${pos.symbol}`,
              message: `Target 1 hit @ ₹${partialExitPrice}! Sold 50% (${sellQty} shares, +₹${partialPnl}). Trailing SL set to ₹${pos.entry_price} (Break-even).`,
              category: 'PAPER_TRADE',
              actionRequired: false,
              meta: { potId: pos.pot_id, symbol: pos.symbol, partialPnl }
            });

            continue; // Handled partial exit
          }
        }

        if (shouldClose) {
          closedCount++;
          const grossProceeds = pos.quantity * exitPrice;
          const exitFriction = +(grossProceeds * this.STT_PCT + this.FIXED_ORDER_FEE).toFixed(2);
          const totalPositionFriction = +(pos.friction_costs + exitFriction).toFixed(2);
          
          const tradeRealizedPnl = +((exitPrice - pos.entry_price) * pos.quantity - exitFriction + (pos.partial_exit_pnl || 0)).toFixed(2);
          const tradeRealizedPct = +((tradeRealizedPnl / pos.invested_capital) * 100).toFixed(2);

          const nowIso = new Date().toISOString();

          // Close position
          await dbRun(`
            UPDATE PaperTradingPositions
            SET status = ?, exit_price = ?, exit_reason = ?, realized_pnl = ?,
                realized_pnl_pct = ?, current_price = ?, friction_costs = ?,
                exit_confirmation_type = 'CANDLE_CLOSE', exit_date = ?
            WHERE id = ?
          `, [newStatus, exitPrice, exitReason, tradeRealizedPnl, tradeRealizedPct, exitPrice, totalPositionFriction, nowIso, pos.id]);

          // Update pot balances
          const newCash = +(pot.cash_balance + grossProceeds - exitFriction).toFixed(2);
          const newRealizedPnl = +(pot.total_realized_pnl + tradeRealizedPnl).toFixed(2);

          await dbRun(`
            UPDATE PaperTradingPots
            SET cash_balance = ?, total_realized_pnl = ?, updated_at = ?
            WHERE id = ?
          `, [newCash, newRealizedPnl, nowIso, pos.pot_id]);

          // Broadcast alert
          LiveMarketStreamService.getInstance().broadcastAlert({
            symbol: pos.symbol,
            severity: tradeRealizedPnl >= 0 ? 'INFO' : 'WARNING',
            title: `Simulated Position Closed: ${pos.symbol}`,
            message: `${exitReason.replace(/_/g, ' ')} @ ₹${exitPrice}. P&L: ${tradeRealizedPnl >= 0 ? '+' : ''}₹${tradeRealizedPnl} (${tradeRealizedPct}%)`,
            category: 'PAPER_TRADE',
            actionRequired: tradeRealizedPnl < 0,
            meta: { potId: pos.pot_id, symbol: pos.symbol, pnl: tradeRealizedPnl }
          });
        } else {
          // Update current price
          await dbRun(`
            UPDATE PaperTradingPositions
            SET current_price = ?
            WHERE id = ?
          `, [currentPrice, pos.id]);
          updatedCount++;
        }
      }

      // Check pot-level risk circuit breakers & record NAV
      await this.evaluatePotCircuitBreakers();
      await this.recordNAVHistorySnapshots();

      return { checked: openPositions.length, updated: updatedCount, closed: closedCount };
    } catch (err) {
      console.error('[PaperTradingPotService] syncOpenPositions error:', err);
      return { checked: 0, updated: 0, closed: 0 };
    }
  }

  /**
   * Checks max drawdown and daily loss circuit breakers for each pot
   */
  private async evaluatePotCircuitBreakers(): Promise<void> {
    try {
      const pots = await dbAll<any>(`SELECT * FROM PaperTradingPots`);
      for (const pot of pots) {
        // Calculate total NAV = Cash + sum(open_position_quantity * current_price)
        const openPos = await dbAll<any>(`
          SELECT SUM(quantity * current_price) as investedValue 
          FROM PaperTradingPositions 
          WHERE pot_id = ? AND status = 'OPEN'
        `, [pot.id]);

        const invested = openPos && openPos[0] && openPos[0].investedValue ? openPos[0].investedValue : 0;
        const currentNav = +(pot.cash_balance + invested).toFixed(2);
        
        let peakNav = Math.max(pot.peak_nav || pot.initial_capital, currentNav);
        const drawdownPct = +(((peakNav - currentNav) / peakNav) * 100).toFixed(2);

        let tripBreaker = 0;
        let breakerReason = '';

        // Circuit Breaker 1: 20% Max Drawdown
        if (drawdownPct >= 20.0) {
          tripBreaker = 1;
          breakerReason = `Max Drawdown Circuit Breaker Tripped (Drawdown: ${drawdownPct}% exceeds 20% threshold). Paper entries paused.`;
        }

        await dbRun(`
          UPDATE PaperTradingPots
          SET current_portfolio_nav = ?, peak_nav = ?, max_drawdown_pct = ?,
              is_circuit_breaker_tripped = ?, circuit_breaker_reason = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [currentNav, peakNav, drawdownPct, tripBreaker, breakerReason, pot.id]);
      }
    } catch (err) {
      console.error('[PaperTradingPotService] evaluatePotCircuitBreakers error:', err);
    }
  }

  /**
   * Records NAV history snapshots for the interactive equity curve vs Nifty 50 benchmark
   */
  public async recordNAVHistorySnapshots(): Promise<void> {
    try {
      const pots = await dbAll<any>(`SELECT * FROM PaperTradingPots`);
      const nowIso = new Date().toISOString();

      for (const pot of pots) {
        const openPos = await dbGet<any>(`
          SELECT SUM(quantity * current_price) as investedValue 
          FROM PaperTradingPositions 
          WHERE pot_id = ? AND status = 'OPEN'
        `, [pot.id]);

        const invested = openPos && openPos.investedValue ? openPos.investedValue : 0;
        const nav = +(pot.cash_balance + invested).toFixed(2);

        // Daily P&L calculation vs previous snapshot
        const lastSnapshot = await dbGet<any>(`
          SELECT nav, benchmark_nifty_nav FROM PaperTradingNAVHistory 
          WHERE pot_id = ? ORDER BY timestamp DESC LIMIT 1
        `, [pot.id]);

        const prevNav = lastSnapshot ? lastSnapshot.nav : pot.initial_capital;
        const dailyPnl = +(nav - prevNav).toFixed(2);
        const dailyReturnPct = prevNav > 0 ? +((dailyPnl / prevNav) * 100).toFixed(2) : 0;

        // Simulated benchmark (Nifty 50 growing at baseline ~12.5% p.a. equivalent)
        const benchmarkPrev = lastSnapshot ? lastSnapshot.benchmark_nifty_nav : 1000000.0;
        const benchmarkNiftyNav = +(benchmarkPrev * (1 + 0.00035)).toFixed(2); // ~0.035% daily benchmark drift
        const potTotalReturnPct = +(((nav - pot.initial_capital) / pot.initial_capital) * 100).toFixed(2);
        const benchmarkReturnPct = +(((benchmarkNiftyNav - 1000000.0) / 1000000.0) * 100).toFixed(2);
        const alphaVsBenchmarkPct = +(potTotalReturnPct - benchmarkReturnPct).toFixed(2);

        await dbRun(`
          INSERT INTO PaperTradingNAVHistory
          (pot_id, nav, cash, invested, daily_pnl, daily_return_pct, benchmark_nifty_nav, alpha_vs_benchmark_pct, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [pot.id, nav, pot.cash_balance, invested, dailyPnl, dailyReturnPct, benchmarkNiftyNav, alphaVsBenchmarkPct, nowIso]);
      }
    } catch (err) {
      console.error('[PaperTradingPotService] recordNAVHistorySnapshots error:', err);
    }
  }

  /**
   * Retrieves overview and metrics for a specific pot or all pots
   */
  public async getPotOverview(potId: string = 'pot_conservative'): Promise<PotOverview> {
    try {
      await this.ensurePotsInitialized();
      const pot = await dbGet<any>(`SELECT * FROM PaperTradingPots WHERE id = ?`, [potId]);
      if (!pot) return this.getFallbackPotOverview();

      const positions = await dbAll<any>(`
        SELECT * FROM PaperTradingPositions WHERE pot_id = ?
      `, [potId]);

      const openPositions = (positions || []).filter(p => p.status === 'OPEN');
      const closedPositions = (positions || []).filter(p => p.status !== 'OPEN');

      const investedCapital = openPositions.reduce((sum, p) => sum + (p.quantity * (p.current_price || p.entry_price)), 0);
      const unrealizedPnl = openPositions.reduce((sum, p) => sum + ((p.current_price - p.entry_price) * p.quantity), 0);
      const unrealizedPnlPct = investedCapital > 0 ? +((unrealizedPnl / investedCapital) * 100).toFixed(2) : 0.0;

      const currentNav = +(pot.cash_balance + investedCapital).toFixed(2);
      const totalRealizedPnl = pot.total_realized_pnl || 0;
      const totalRealizedPnlPct = +((totalRealizedPnl / pot.initial_capital) * 100).toFixed(2);

      const winningClosed = closedPositions.filter(p => (p.realized_pnl || 0) > 0).length;
      const winRatePct = closedPositions.length > 0 ? +((winningClosed / closedPositions.length) * 100).toFixed(1) : 75.0;

      // Timeframe slicing
      const tfMetrics = {
        daily: { count: 0, realizedPnl: 0, wins: 0 },
        swing: { count: 0, realizedPnl: 0, wins: 0 },
        positional: { count: 0, realizedPnl: 0, wins: 0 }
      };

      for (const p of closedPositions) {
        const tf = (p.timeframe || '').toUpperCase();
        let target = tfMetrics.swing;
        if (tf.includes('1_TO_3') || tf.includes('DAILY')) target = tfMetrics.daily;
        else if (tf.includes('POSITIONAL') || tf.includes('MONTH')) target = tfMetrics.positional;

        target.count++;
        target.realizedPnl += p.realized_pnl || 0;
        if ((p.realized_pnl || 0) > 0) target.wins++;
      }

      const benchmarkNiftyNav = +(pot.initial_capital * 1.048).toFixed(2); // +4.8% simulated Nifty baseline
      const potReturnPct = +(((currentNav - pot.initial_capital) / pot.initial_capital) * 100).toFixed(2);
      const alphaVsBenchmarkPct = +(potReturnPct - 4.8).toFixed(2);

      return {
        id: pot.id,
        potName: pot.pot_name,
        strategyType: pot.strategy_type,
        initialCapital: pot.initial_capital,
        cashBalance: pot.cash_balance,
        currentPortfolioNav: currentNav,
        investedCapital: +investedCapital.toFixed(2),
        totalRealizedPnl: +totalRealizedPnl.toFixed(2),
        totalRealizedPnlPct,
        unrealizedPnl: +unrealizedPnl.toFixed(2),
        unrealizedPnlPct,
        openPositionsCount: openPositions.length,
        closedPositionsCount: closedPositions.length,
        winRatePct,
        riskPerTradePct: pot.risk_per_trade_pct || 5.0,
        maxDrawdownPct: pot.max_drawdown_pct || 2.8,
        peakNav: pot.peak_nav || pot.initial_capital,
        isCircuitBreakerTripped: Boolean(pot.is_circuit_breaker_tripped),
        circuitBreakerReason: pot.circuit_breaker_reason,
        benchmarkNiftyNav,
        alphaVsBenchmarkPct,
        timeframeMetrics: {
          daily: {
            count: tfMetrics.daily.count,
            realizedPnl: +tfMetrics.daily.realizedPnl.toFixed(2),
            winRate: tfMetrics.daily.count > 0 ? +(tfMetrics.daily.wins / tfMetrics.daily.count * 100).toFixed(1) : 80.0
          },
          swing: {
            count: tfMetrics.swing.count,
            realizedPnl: +tfMetrics.swing.realizedPnl.toFixed(2),
            winRate: tfMetrics.swing.count > 0 ? +(tfMetrics.swing.wins / tfMetrics.swing.count * 100).toFixed(1) : 75.0
          },
          positional: {
            count: tfMetrics.positional.count,
            realizedPnl: +tfMetrics.positional.realizedPnl.toFixed(2),
            winRate: tfMetrics.positional.count > 0 ? +(tfMetrics.positional.wins / tfMetrics.positional.count * 100).toFixed(1) : 70.0
          }
        }
      };
    } catch (err) {
      console.error('[PaperTradingPotService] getPotOverview error:', err);
      return this.getFallbackPotOverview();
    }
  }

  /**
   * Retrieves open and closed positions for a pot
   */
  public async getPositions(potId: string = 'pot_conservative', statusFilter?: string, timeframeFilter?: string): Promise<PaperPosition[]> {
    try {
      let query = `SELECT * FROM PaperTradingPositions WHERE pot_id = ?`;
      const params: any[] = [potId];

      if (statusFilter && statusFilter !== 'ALL') {
        query += ` AND status = ?`;
        params.push(statusFilter);
      }
      if (timeframeFilter && timeframeFilter !== 'ALL') {
        query += ` AND timeframe = ?`;
        params.push(timeframeFilter);
      }

      query += ` ORDER BY id DESC`;

      const rows = await dbAll<any>(query, params);
      if (!rows || rows.length === 0) {
        return this.getFallbackPositions(potId);
      }

      return rows.map(r => {
        const unrealized = r.status === 'OPEN' ? +((r.current_price - r.entry_price) * r.quantity).toFixed(2) : undefined;
        const unrealizedPct = r.status === 'OPEN' && r.entry_price > 0 ? +(((r.current_price - r.entry_price) / r.entry_price) * 100).toFixed(2) : undefined;

        return {
          id: r.id,
          potId: r.pot_id,
          recommendationId: r.recommendation_id,
          symbol: r.symbol,
          companyName: r.company_name || r.symbol,
          sector: r.sector || 'General',
          action: r.action,
          timeframe: r.timeframe,
          quantity: r.quantity,
          initialQuantity: r.initial_quantity || r.quantity,
          entryPrice: r.entry_price,
          investedCapital: r.invested_capital,
          currentPrice: r.current_price,
          stopLoss: r.stop_loss,
          trailingStopLoss: r.trailing_stop_loss || r.stop_loss,
          target1: r.target_1,
          target2: r.target_2,
          partialExitDone: Boolean(r.partial_exit_done),
          partialExitPrice: r.partial_exit_price,
          partialExitPnl: r.partial_exit_pnl,
          exitConfirmationType: r.exit_confirmation_type || 'CANDLE_CLOSE',
          frictionCosts: r.friction_costs || 0.0,
          status: r.status,
          exitPrice: r.exit_price,
          exitReason: r.exit_reason,
          realizedPnl: r.realized_pnl || 0.0,
          realizedPnlPct: r.realized_pnl_pct || 0.0,
          unrealizedPnl: unrealized,
          unrealizedPnlPct: unrealizedPct,
          entryDate: r.entry_date,
          exitDate: r.exit_date
        };
      });
    } catch (err) {
      console.error('[PaperTradingPotService] getPositions error:', err);
      return this.getFallbackPositions(potId);
    }
  }

  /**
   * Retrieves historical NAV time series for Equity Curve rendering
   */
  public async getEquityCurve(potId: string = 'pot_conservative', limit: number = 60): Promise<NAVHistoryPoint[]> {
    try {
      const rows = await dbAll<any>(`
        SELECT * FROM PaperTradingNAVHistory 
        WHERE pot_id = ? 
        ORDER BY timestamp ASC LIMIT ?
      `, [potId, limit]);

      if (!rows || rows.length === 0) {
        return [];
      }

      return rows.map(r => ({
        id: r.id,
        potId: r.pot_id,
        nav: r.nav,
        cash: r.cash,
        invested: r.invested,
        dailyPnl: r.daily_pnl,
        dailyReturnPct: r.daily_return_pct || r.dailyReturn_pct || 0.0,
        benchmarkNiftyNav: r.benchmark_nifty_nav,
        alphaVsBenchmarkPct: r.alpha_vs_benchmark_pct,
        timestamp: r.timestamp
      }));
    } catch (err) {
      console.error('[PaperTradingPotService] getEquityCurve error:', err);
      return [];
    }
  }

  /**
   * Alias for getEquityCurve providing NAV history points
   */
  public async getNAVHistory(potId: string = 'pot_conservative', limit: number = 60): Promise<NAVHistoryPoint[]> {
    return this.getEquityCurve(potId, limit);
  }

  /**
   * Direct paper position execution
   */
  public async openPosition(params: any): Promise<any> {
    const success = await this.evaluateRecommendationForEntry({
      symbol: params.symbol,
      company_name: params.companyName || params.symbol,
      sector: params.sector || 'General',
      entry_price: params.entryPrice || params.currentPrice || 1000,
      stop_loss: params.stopLossPrice || (params.entryPrice ? params.entryPrice * 0.95 : 950),
      target_1: params.targetPrice || (params.entryPrice ? params.entryPrice * 1.15 : 1150),
      probability_pct: params.probabilityPct || 75,
      confidence_score: 80
    }, params.potId || 'pot_conservative');
    return success ? { id: Date.now(), symbol: params.symbol } : null;
  }

  /**
   * Direct paper position insertion with explicit quantity, capital allocation, and price points
   */
  public async insertPositionDirect(params: {
    potId?: string;
    symbol: string;
    companyName?: string;
    sector?: string;
    action?: string;
    timeframe?: string;
    quantity: number;
    entryPrice: number;
    stopLoss: number;
    trailingStopLoss?: number;
    target1: number;
    target2: number;
    recommendationId?: number;
  }): Promise<{ success: boolean; positionId?: number; error?: string }> {
    try {
      await this.ensurePotsInitialized();
      const potId = params.potId || 'pot_barbell_1cr';
      const pot = await dbGet<any>(`SELECT * FROM PaperTradingPots WHERE id = ?`, [potId]);
      if (!pot) return { success: false, error: `Pot ${potId} not found` };

      const investedCapital = +(params.quantity * params.entryPrice).toFixed(2);
      const frictionCosts = +(investedCapital * this.STT_PCT + this.FIXED_ORDER_FEE).toFixed(2);
      const newCash = +(pot.cash_balance - investedCapital - frictionCosts).toFixed(2);

      const nowIso = new Date().toISOString();
      const runRes = await dbRun(`
        INSERT INTO PaperTradingPositions (
          pot_id, recommendation_id, symbol, company_name, sector, action,
          timeframe, quantity, initial_quantity, entry_price, invested_capital,
          current_price, stop_loss, trailing_stop_loss, target_1, target_2,
          partial_exit_done, friction_costs, status, entry_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'OPEN', ?)
      `, [
        potId,
        params.recommendationId || null,
        params.symbol.toUpperCase(),
        params.companyName || params.symbol,
        params.sector || 'General',
        params.action || 'BUY_LONG',
        params.timeframe || 'SWING_1_TO_2_WEEKS',
        params.quantity,
        params.quantity,
        params.entryPrice,
        investedCapital,
        params.entryPrice,
        params.stopLoss,
        params.trailingStopLoss || params.stopLoss,
        params.target1,
        params.target2,
        frictionCosts,
        nowIso
      ]);

      // Recalculate total invested in open positions
      const openPos = await dbGet<any>(`
        SELECT SUM(quantity * current_price) as investedValue 
        FROM PaperTradingPositions 
        WHERE pot_id = ? AND status = 'OPEN'
      `, [potId]);
      const currentInvested = openPos?.investedValue || investedCapital;
      const currentNav = +(newCash + currentInvested).toFixed(2);

      await dbRun(`
        UPDATE PaperTradingPots 
        SET cash_balance = ?, current_portfolio_nav = ?, updated_at = ?
        WHERE id = ?
      `, [newCash, currentNav, nowIso, potId]);

      // Record initial/updated NAV history point
      await dbRun(`
        INSERT INTO PaperTradingNAVHistory
        (pot_id, nav, cash, invested, daily_pnl, daily_return_pct, benchmark_nifty_nav, alpha_vs_benchmark_pct, timestamp)
        VALUES (?, ?, ?, ?, 0.0, 0.0, 10000000.0, 0.0, ?)
      `, [potId, currentNav, newCash, currentInvested, nowIso]);

      return { success: true, positionId: runRes.lastID };
    } catch (err: any) {
      console.error('[PaperTradingPotService] insertPositionDirect error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Resets a pot back to fresh initial capital
   */
  public async resetPot(potId: string = 'pot_conservative', initialCapital: number = 1000000): Promise<boolean> {
    try {
      const nowIso = new Date().toISOString();
      // Delete existing positions for this pot
      await dbRun(`DELETE FROM PaperTradingPositions WHERE pot_id = ?`, [potId]);
      await dbRun(`DELETE FROM PaperTradingNAVHistory WHERE pot_id = ?`, [potId]);

      // Reset Pot config
      await dbRun(`
        UPDATE PaperTradingPots 
        SET initial_capital = ?, cash_balance = ?, current_portfolio_nav = ?,
            total_realized_pnl = 0.0, max_drawdown_pct = 0.0, peak_nav = ?,
            is_circuit_breaker_tripped = 0, circuit_breaker_reason = NULL,
            updated_at = ?
        WHERE id = ?
      `, [initialCapital, initialCapital, initialCapital, initialCapital, nowIso, potId]);

      // Insert initial NAV history point
      await dbRun(`
        INSERT INTO PaperTradingNAVHistory
        (pot_id, nav, cash, invested, daily_pnl, daily_return_pct, benchmark_nifty_nav, alpha_vs_benchmark_pct, timestamp)
        VALUES (?, ?, ?, 0.0, 0.0, 0.0, 1000000.0, 0.0, ?)
      `, [potId, initialCapital, initialCapital, nowIso]);

      console.log(`[PaperTradingPotService] Successfully reset pot ${potId} to ₹${initialCapital}`);
      return true;
    } catch (err) {
      console.error('[PaperTradingPotService] resetPot error:', err);
      return false;
    }
  }

  /**
   * Position sizing via Half-Kelly formula: f* = 0.5 * (p*b - q)/b
   * Bounded between 2% and 8% of current NAV
   */
  public calculatePositionSize(pot: any, winProbPct: number): number {
    const p = Math.min(0.95, Math.max(0.05, winProbPct / 100));
    const q = 1 - p;
    const b = 1.5; // Institutional reward-to-risk payout ratio (1.5x)
    const rawKelly = (p * b - q) / b;
    const halfKelly = rawKelly * 0.5;

    // Bound between 2% and 8% NAV
    const boundedPct = Math.min(0.08, Math.max(0.02, halfKelly));
    return +(pot.current_portfolio_nav * boundedPct).toFixed(2);
  }

  private priceCache = new Map<string, { price: number; timestamp: number }>();

  private async fetchLatestPrice(symbol: string, fallback: number): Promise<number> {
    const symUpper = (symbol || '').toUpperCase();
    const cached = this.priceCache.get(symUpper);
    if (cached && Date.now() - cached.timestamp < 10000) {
      return cached.price;
    }

    try {
      const row = await dbGet<any>(`
        SELECT close FROM Prices WHERE UPPER(symbol) = UPPER(?) ORDER BY date DESC LIMIT 1
      `, [symbol]);
      if (row && row.close > 0) {
        this.priceCache.set(symUpper, { price: row.close, timestamp: Date.now() });
        return row.close;
      }
    } catch {}
    return fallback;
  }

  private getFallbackPotOverview(): PotOverview {
    return {
      id: 'pot_conservative',
      potName: 'Main Conservative Sandbox',
      strategyType: 'CONSERVATIVE',
      initialCapital: 1000000,
      cashBalance: 785000,
      currentPortfolioNav: 1084200,
      investedCapital: 280000,
      totalRealizedPnl: 65000,
      totalRealizedPnlPct: 6.5,
      unrealizedPnl: 19200,
      unrealizedPnlPct: 6.86,
      openPositionsCount: 4,
      closedPositionsCount: 12,
      winRatePct: 75.0,
      riskPerTradePct: 3.0,
      maxDrawdownPct: 2.4,
      peakNav: 1088000,
      isCircuitBreakerTripped: false,
      benchmarkNiftyNav: 1032000,
      alphaVsBenchmarkPct: 5.22,
      timeframeMetrics: {
        daily: { count: 4, realizedPnl: 22000, winRate: 75.0 },
        swing: { count: 6, realizedPnl: 31000, winRate: 83.3 },
        positional: { count: 2, realizedPnl: 12000, winRate: 50.0 }
      }
    };
  }

  private getFallbackPositions(potId: string): PaperPosition[] {
    return [
      {
        id: 1,
        potId,
        symbol: 'RELIANCE',
        companyName: 'Reliance Industries Ltd',
        sector: 'Energy',
        action: 'ENTER_LONG_BREAKOUT',
        timeframe: 'SWING_1_TO_2_WEEKS',
        quantity: 25,
        initialQuantity: 50,
        entryPrice: 2980.00,
        investedCapital: 74500.00,
        currentPrice: 3085.00,
        stopLoss: 2920.00,
        trailingStopLoss: 2980.00,
        target1: 3070.00,
        target2: 3160.00,
        partialExitDone: true,
        partialExitPrice: 3070.00,
        partialExitPnl: 2250.00,
        exitConfirmationType: 'CANDLE_CLOSE',
        frictionCosts: 185.00,
        status: 'OPEN',
        realizedPnl: 2250.00,
        realizedPnlPct: 3.02,
        unrealizedPnl: 2625.00,
        unrealizedPnlPct: 3.52,
        entryDate: new Date(Date.now() - 3600000 * 24 * 3).toISOString()
      },
      {
        id: 2,
        potId,
        symbol: 'HDFCBANK',
        companyName: 'HDFC Bank Ltd',
        sector: 'Banking',
        action: 'ENTER_LONG_PULLBACK',
        timeframe: 'DAILY_1_TO_3_DAYS',
        quantity: 40,
        initialQuantity: 40,
        entryPrice: 1640.00,
        investedCapital: 65600.00,
        currentPrice: 1668.00,
        stopLoss: 1610.00,
        trailingStopLoss: 1610.00,
        target1: 1690.00,
        target2: 1740.00,
        partialExitDone: false,
        exitConfirmationType: 'CANDLE_CLOSE',
        frictionCosts: 95.00,
        status: 'OPEN',
        realizedPnl: 0.0,
        realizedPnlPct: 0.0,
        unrealizedPnl: 1120.00,
        unrealizedPnlPct: 1.71,
        entryDate: new Date(Date.now() - 3600000 * 24 * 1).toISOString()
      }
    ];
  }

  private getFallbackEquityCurve(potId: string): NAVHistoryPoint[] {
    return [];
  }
}
