/**
 * EntryPlanOutcomeService.ts
 *
 * Tracks entry plan outcomes for opportunity scanner signals.
 * Records: planned entry → actual entry → actual exit → P&L computation.
 * Provides win-rate and average-P&L summary per strategy.
 */

import crypto from 'node:crypto';
import { getDB } from '../database.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type OutcomeLabel = 'OPEN' | 'HIT_TARGET' | 'HIT_STOP' | 'MANUAL_EXIT' | 'EXPIRED';

export interface CreatePlanInput {
  symbol: string;
  strategyId?: string;
  signalDate?: string;
  signalPrice?: number;
  signalConvergence?: number;
  plannedEntryPrice?: number;
  stopLossPrice?: number;
  targetPrice?: number;
  notes?: string;
}

export interface EntryPlanOutcome {
  planId: string;
  symbol: string;
  strategyId?: string;
  signalDate?: string;
  signalPrice?: number;
  signalConvergence?: number;
  plannedEntryPrice?: number;
  actualEntryPrice?: number;
  entryDate?: string;
  plannedExitPrice?: number;
  actualExitPrice?: number;
  exitDate?: string;
  stopLossPrice?: number;
  targetPrice?: number;
  pnlPct?: number;
  pnlInr?: number;
  quantity?: number;
  outcomeLabel?: OutcomeLabel;
  holdingDays?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Internal DB row type ─────────────────────────────────────────────────────

interface PlanRow {
  plan_id: string;
  symbol: string;
  strategy_id: string | null;
  signal_date: string | null;
  signal_price: number | null;
  signal_convergence: number | null;
  planned_entry_price: number | null;
  actual_entry_price: number | null;
  entry_date: string | null;
  planned_exit_price: number | null;
  actual_exit_price: number | null;
  exit_date: string | null;
  stop_loss_price: number | null;
  target_price: number | null;
  pnl_pct: number | null;
  pnl_inr: number | null;
  quantity: number | null;
  outcome_label: string | null;
  holding_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rowToPlan(row: PlanRow): EntryPlanOutcome {
  return {
    planId: row.plan_id,
    symbol: row.symbol,
    strategyId: row.strategy_id ?? undefined,
    signalDate: row.signal_date ?? undefined,
    signalPrice: row.signal_price ?? undefined,
    signalConvergence: row.signal_convergence ?? undefined,
    plannedEntryPrice: row.planned_entry_price ?? undefined,
    actualEntryPrice: row.actual_entry_price ?? undefined,
    entryDate: row.entry_date ?? undefined,
    plannedExitPrice: row.planned_exit_price ?? undefined,
    actualExitPrice: row.actual_exit_price ?? undefined,
    exitDate: row.exit_date ?? undefined,
    stopLossPrice: row.stop_loss_price ?? undefined,
    targetPrice: row.target_price ?? undefined,
    pnlPct: row.pnl_pct ?? undefined,
    pnlInr: row.pnl_inr ?? undefined,
    quantity: row.quantity ?? undefined,
    outcomeLabel: (row.outcome_label as OutcomeLabel) ?? undefined,
    holdingDays: row.holding_days ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generatePlanId(): string {
  return 'acq_' + crypto.randomBytes(8).toString('hex');
}

function now(): string {
  return new Date().toISOString();
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

// ── Service ──────────────────────────────────────────────────────────────────

export class EntryPlanOutcomeService {
  private static instance: EntryPlanOutcomeService;

  static getInstance(): EntryPlanOutcomeService {
    if (!this.instance) this.instance = new EntryPlanOutcomeService();
    return this.instance;
  }

  private get db(): any {
    return getDB();
  }

  /**
   * Creates a new entry plan from a signal. Returns the plan_id (acq_ prefix + 16 hex).
   */
  createPlan(plan: CreatePlanInput): string {
    const planId = generatePlanId();
    const ts = now();

    try {
      this.db.run(
        `INSERT INTO entry_plan_outcomes
           (plan_id, symbol, strategy_id, signal_date, signal_price, signal_convergence,
            planned_entry_price, stop_loss_price, target_price, notes,
            outcome_label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
        [
          planId,
          plan.symbol,
          plan.strategyId ?? null,
          plan.signalDate ?? null,
          plan.signalPrice ?? null,
          plan.signalConvergence ?? null,
          plan.plannedEntryPrice ?? null,
          plan.stopLossPrice ?? null,
          plan.targetPrice ?? null,
          plan.notes ?? null,
          ts,
          ts,
        ]
      );
    } catch (e: any) {
      if (/no such table/i.test(e.message)) {
        console.warn('[EntryPlanOutcomeService] Table not yet created — migration pending');
        return planId;
      }
      throw e;
    }

    return planId;
  }

  /**
   * Records the actual entry for a plan (price, date, quantity).
   */
  recordEntry(planId: string, actualPrice: number, date: string, qty: number): void {
    const ts = now();
    try {
      this.db.run(
        `UPDATE entry_plan_outcomes
         SET actual_entry_price = ?,
             entry_date = ?,
             quantity = ?,
             updated_at = ?
         WHERE plan_id = ?`,
        [actualPrice, date, qty, ts, planId]
      );
    } catch (e: any) {
      if (!/no such table/i.test(e.message)) throw e;
    }
  }

  /**
   * Records the actual exit for a plan. Computes pnl_pct, pnl_inr, holding_days.
   */
  recordExit(
    planId: string,
    exitType: 'HIT_TARGET' | 'HIT_STOP' | 'MANUAL_EXIT',
    actualPrice: number,
    date: string
  ): void {
    const ts = now();

    try {
      const row = this.db.get(
        `SELECT actual_entry_price, quantity, entry_date FROM entry_plan_outcomes WHERE plan_id = ?`,
        [planId]
      ) as { actual_entry_price: number | null; quantity: number | null; entry_date: string | null } | undefined;

      if (!row) return;

      const entryPrice = row.actual_entry_price;
      const qty = row.quantity;
      const entryDate = row.entry_date;

      let pnlPct: number | null = null;
      let pnlInr: number | null = null;
      let holdingDays: number | null = null;

      if (entryPrice != null && entryPrice !== 0) {
        pnlPct = ((actualPrice - entryPrice) / entryPrice) * 100;
      }
      if (entryPrice != null && qty != null) {
        pnlInr = (actualPrice - entryPrice) * qty;
      }
      if (entryDate) {
        holdingDays = daysBetween(entryDate, date);
      }

      this.db.run(
        `UPDATE entry_plan_outcomes
         SET actual_exit_price = ?,
             exit_date = ?,
             outcome_label = ?,
             pnl_pct = ?,
             pnl_inr = ?,
             holding_days = ?,
             updated_at = ?
         WHERE plan_id = ?`,
        [actualPrice, date, exitType, pnlPct, pnlInr, holdingDays, ts, planId]
      );
    } catch (e: any) {
      if (!/no such table/i.test(e.message)) throw e;
    }
  }

  /**
   * Lists open entry plans, optionally filtered by symbol.
   */
  listOpen(symbol?: string): EntryPlanOutcome[] {
    try {
      let query = `SELECT * FROM entry_plan_outcomes WHERE outcome_label = 'OPEN'`;
      const params: unknown[] = [];

      if (symbol) {
        query += ` AND symbol = ?`;
        params.push(symbol);
      }

      query += ` ORDER BY created_at DESC`;

      const rows = this.db.all(query, params) as PlanRow[];
      return (rows || []).map(rowToPlan);
    } catch (e: any) {
      if (/no such table/i.test(e.message)) return [];
      throw e;
    }
  }

  /**
   * Lists all entry plans with optional filters.
   */
  listPlans(opts: { symbol?: string; strategyId?: string; status?: string } = {}): EntryPlanOutcome[] {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (opts.symbol) {
        conditions.push('symbol = ?');
        params.push(opts.symbol);
      }
      if (opts.strategyId) {
        conditions.push('strategy_id = ?');
        params.push(opts.strategyId);
      }
      if (opts.status) {
        conditions.push('outcome_label = ?');
        params.push(opts.status.toUpperCase());
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = this.db.all(
        `SELECT * FROM entry_plan_outcomes ${where} ORDER BY created_at DESC`,
        params
      ) as PlanRow[];

      return (rows || []).map(rowToPlan);
    } catch (e: any) {
      if (/no such table/i.test(e.message)) return [];
      throw e;
    }
  }

  /**
   * Returns win rate, average P&L %, and total plans for a strategy (or all strategies).
   */
  getOutcomeSummary(strategyId?: string): { winRate: number; avgPnlPct: number; totalPlans: number } {
    try {
      const params: unknown[] = [];
      let where = `WHERE outcome_label IN ('HIT_TARGET','HIT_STOP','MANUAL_EXIT','EXPIRED')`;
      if (strategyId) {
        where += ` AND strategy_id = ?`;
        params.push(strategyId);
      }

      const row = this.db.get(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN pnl_pct > 0 THEN 1 ELSE 0 END) AS wins,
           AVG(pnl_pct) AS avg_pnl_pct
         FROM entry_plan_outcomes
         ${where}`,
        params
      ) as { total: number; wins: number; avg_pnl_pct: number | null } | undefined;

      if (!row || row.total === 0) {
        return { winRate: 0, avgPnlPct: 0, totalPlans: 0 };
      }

      return {
        winRate: (row.wins / row.total) * 100,
        avgPnlPct: row.avg_pnl_pct ?? 0,
        totalPlans: row.total,
      };
    } catch (e: any) {
      if (/no such table/i.test(e.message)) return { winRate: 0, avgPnlPct: 0, totalPlans: 0 };
      throw e;
    }
  }

  /**
   * Marks OPEN plans older than N days (default 90) as EXPIRED.
   * Returns the number of plans expired.
   */
  expireOldPlans(olderThanDays = 90): number {
    const ts = now();
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

    try {
      const result = this.db.run(
        `UPDATE entry_plan_outcomes
         SET outcome_label = 'EXPIRED', updated_at = ?
         WHERE outcome_label = 'OPEN' AND created_at < ?`,
        [ts, cutoff]
      );
      return result?.changes ?? 0;
    } catch (e: any) {
      if (/no such table/i.test(e.message)) return 0;
      throw e;
    }
  }
}
