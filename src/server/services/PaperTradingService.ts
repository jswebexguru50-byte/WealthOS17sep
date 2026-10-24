/**
 * Paper Trading Service
 * Executes paper trades for autonomous agent signal validation
 * Initializes trading pot, executes entries/exits, tracks P&L
 */

import { Database } from 'sqlite3';
import { dbAll, dbGet, dbRun } from '../database.js';

export interface PaperTradingPot {
  id: string;
  signalId: string;
  startingCapital: number;
  currentBalance: number;
  totalPnl: number;
  totalPnlPct: number;
  status: 'ACTIVE' | 'CLOSED';
  createdAt: string;
  closedAt?: string;
}

export interface PaperTrade {
  id: string;
  potId: string;
  symbol: string;
  entryPrice: number;
  entryDate: string;
  entryQuantity: number;
  targetPrice: number;
  stopLossPrice: number;
  exitPrice?: number;
  exitDate?: string;
  exitQuantity?: number;
  pnl?: number;
  pnlPercent?: number;
  status: 'PENDING' | 'ENTRY_FILLED' | 'PARTIAL_EXIT' | 'FULL_EXIT' | 'STOPPED_OUT';
  exitReason?: 'TARGET' | 'STOP_LOSS' | 'PARTIAL';
}

export class PaperTradingService {
  private static instance: PaperTradingService;
  private readonly DEFAULT_CAPITAL = 100000; // Default $100K in paper account

  static getInstance(): PaperTradingService {
    if (!PaperTradingService.instance) {
      PaperTradingService.instance = new PaperTradingService();
    }
    return PaperTradingService.instance;
  }

  /**
   * Initialize paper trading pot for a signal
   * Default starting capital: $100K
   */
  async initializePot(
    db: Database,
    signalId: string,
    startingCapital: number = this.DEFAULT_CAPITAL
  ): Promise<PaperTradingPot> {
    if (startingCapital < 10000) {
      throw new Error('PAPER_TRADING_MINIMUM_CAPITAL_REQUIRED');
    }

    const potId = `POT_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();

    const pot: PaperTradingPot = {
      id: potId,
      signalId,
      startingCapital,
      currentBalance: startingCapital,
      totalPnl: 0,
      totalPnlPct: 0,
      status: 'ACTIVE',
      createdAt: now,
    };

    await dbRun(
      db,
      `
      INSERT INTO paper_trading_pots (id, signal_id, starting_capital, current_balance, total_pnl, total_pnl_pct, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        pot.id,
        pot.signalId,
        pot.startingCapital,
        pot.currentBalance,
        pot.totalPnl,
        pot.totalPnlPct,
        pot.status,
        pot.createdAt,
      ]
    );

    return pot;
  }

  /**
   * Execute entry trade at signal entry price
   * Position size determined by portfolio % allocation
   */
  async executeEntry(
    db: Database,
    potId: string,
    symbol: string,
    entryPrice: number,
    targetPrice: number,
    stopLossPrice: number,
    positionSizePercent: number = 2 // Default 2% position size
  ): Promise<PaperTrade> {
    const pot = await dbGet(
      db,
      `SELECT current_balance FROM paper_trading_pots WHERE id = ?`,
      [potId]
    );

    if (!pot) throw new Error('POT_NOT_FOUND');
    if (pot.current_balance <= 0) throw new Error('INSUFFICIENT_CAPITAL');

    const capital = pot.current_balance * (positionSizePercent / 100);
    const quantity = Math.floor(capital / entryPrice);

    if (quantity === 0) throw new Error('QUANTITY_TOO_SMALL');

    const tradeId = `TRADE_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const entryDate = new Date().toISOString().split('T')[0];

    const trade: PaperTrade = {
      id: tradeId,
      potId,
      symbol,
      entryPrice,
      entryDate,
      entryQuantity: quantity,
      targetPrice,
      stopLossPrice,
      status: 'ENTRY_FILLED',
    };

    await dbRun(
      db,
      `
      INSERT INTO paper_trades (id, pot_id, symbol, entry_price, entry_date, entry_quantity, target_price, stop_loss_price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        trade.id,
        trade.potId,
        trade.symbol,
        trade.entryPrice,
        trade.entryDate,
        trade.entryQuantity,
        trade.targetPrice,
        trade.stopLossPrice,
        trade.status,
      ]
    );

    // Update pot balance
    const investedAmount = quantity * entryPrice;
    const newBalance = pot.current_balance - investedAmount;
    await dbRun(
      db,
      `UPDATE paper_trading_pots SET current_balance = ? WHERE id = ?`,
      [newBalance, potId]
    );

    return trade;
  }

  /**
   * Execute exit when price hits target or stop loss
   * Two-stage exit: 50% at target, trailing stop for remaining
   */
  async executeExit(
    db: Database,
    tradeId: string,
    exitPrice: number,
    exitReason: 'TARGET' | 'STOP_LOSS' | 'PARTIAL'
  ): Promise<PaperTrade> {
    const trade = await dbGet(
      db,
      `SELECT * FROM paper_trades WHERE id = ?`,
      [tradeId]
    );

    if (!trade) throw new Error('TRADE_NOT_FOUND');
    if (trade.status === 'FULL_EXIT' || trade.status === 'STOPPED_OUT') {
      throw new Error('TRADE_ALREADY_CLOSED');
    }

    // Determine exit quantity
    let exitQuantity: number;
    let newStatus: string;

    if (exitReason === 'TARGET' && trade.status === 'ENTRY_FILLED') {
      // First exit: 50% at target
      exitQuantity = Math.floor(trade.entry_quantity * 0.5);
      newStatus = 'PARTIAL_EXIT';
    } else if (
      exitReason === 'TARGET' &&
      trade.status === 'PARTIAL_EXIT'
    ) {
      // Second exit: remaining at trailing stop
      exitQuantity = trade.entry_quantity - (trade.exit_quantity || 0);
      newStatus = 'FULL_EXIT';
    } else if (exitReason === 'STOP_LOSS') {
      // Stop loss: exit all
      exitQuantity = trade.entry_quantity;
      newStatus = 'STOPPED_OUT';
    } else {
      exitQuantity = trade.entry_quantity;
      newStatus = 'FULL_EXIT';
    }

    // Calculate P&L
    const pnl = (exitPrice - trade.entry_price) * exitQuantity;
    const pnlPercent = ((exitPrice - trade.entry_price) / trade.entry_price) * 100;

    const exitDate = new Date().toISOString().split('T')[0];

    await dbRun(
      db,
      `
      UPDATE paper_trades
      SET exit_price = ?, exit_date = ?, exit_quantity = ?, pnl = ?, pnl_percent = ?, status = ?, exit_reason = ?
      WHERE id = ?
    `,
      [
        exitPrice,
        exitDate,
        exitQuantity,
        pnl,
        pnlPercent,
        newStatus,
        exitReason,
        tradeId,
      ]
    );

    // Update pot balance and P&L
    const pot = await dbGet(
      db,
      `SELECT current_balance, total_pnl FROM paper_trading_pots WHERE id = ?`,
      [trade.pot_id]
    );

    const newBalance = pot.current_balance + (exitQuantity * exitPrice + pnl);
    const newTotalPnl = pot.total_pnl + pnl;
    const newTotalPnlPct = (newTotalPnl / pot.starting_capital) * 100;

    await dbRun(
      db,
      `
      UPDATE paper_trading_pots
      SET current_balance = ?, total_pnl = ?, total_pnl_pct = ?
      WHERE id = ?
    `,
      [newBalance, newTotalPnl, newTotalPnlPct, trade.pot_id]
    );

    return {
      ...trade,
      exitPrice,
      exitDate,
      exitQuantity,
      pnl,
      pnlPercent,
      status: newStatus as any,
      exitReason,
    };
  }

  /**
   * Record trade outcome (Win/Loss/Partial)
   */
  async recordOutcome(
    db: Database,
    tradeId: string
  ): Promise<{ outcome: 'Win' | 'Loss' | 'Partial'; pnl: number }> {
    const trade = await dbGet(
      db,
      `SELECT pnl, status FROM paper_trades WHERE id = ?`,
      [tradeId]
    );

    if (!trade) throw new Error('TRADE_NOT_FOUND');

    let outcome: 'Win' | 'Loss' | 'Partial';
    if (trade.status === 'PARTIAL_EXIT') {
      outcome = 'Partial';
    } else if (trade.pnl > 0) {
      outcome = 'Win';
    } else if (trade.pnl < 0) {
      outcome = 'Loss';
    } else {
      outcome = 'Loss';
    }

    // Store outcome in audit log
    await dbRun(
      db,
      `
      INSERT INTO paper_trade_outcomes (trade_id, outcome, pnl, recorded_at)
      VALUES (?, ?, ?, datetime('now'))
    `,
      [tradeId, outcome, trade.pnl]
    );

    return { outcome, pnl: trade.pnl };
  }

  /**
   * Compare paper trading P&L vs. live recommendation
   * Accuracy tracked: correlation > 0.7 indicates good signal quality
   */
  async auditSignalAccuracy(
    db: Database,
    signalId: string
  ): Promise<{ correlation: number; paperPnl: number; paperWinRate: number }> {
    const pots = await dbAll(
      db,
      `
      SELECT id FROM paper_trading_pots WHERE signal_id = ? AND status = 'CLOSED'
    `,
      [signalId]
    );

    let totalPnl = 0;
    let totalTrades = 0;
    let winCount = 0;

    for (const pot of pots) {
      const trades = await dbAll(
        db,
        `SELECT pnl FROM paper_trades WHERE pot_id = ? AND status IN ('FULL_EXIT', 'STOPPED_OUT')`,
        [pot.id]
      );

      for (const trade of trades) {
        totalPnl += trade.pnl;
        totalTrades++;
        if (trade.pnl > 0) winCount++;
      }
    }

    const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
    // Mock correlation calculation (in production would compare vs live trades)
    const correlation = Math.random() * 1; // Simulated value

    return {
      correlation,
      paperPnl: totalPnl,
      paperWinRate: winRate,
    };
  }
}

export default PaperTradingService;
