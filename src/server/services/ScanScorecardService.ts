/**
 * ScanScorecardService.ts
 *
 * Tracks historical scan signal outcomes for the OpportunityScannerEngine.
 * Records every scan signal and later resolves whether it led to a profitable trade.
 */

import crypto from 'node:crypto';
import { getDB } from '../database.js';
import type { StockInvestmentOpportunity } from './OpportunityScannerEngine.js';

// ── Public types ─────────────────────────────────────────────────────────────

export interface ScorecardRow {
  strategy_id: string;
  strategy_category: string;
  total_signals: number;
  win_count: number;
  loss_count: number;
  neutral_count: number;
  pending_count: number;
  win_rate: number;
  avg_return: number;
}

export interface PendingOutcome {
  signalId: string;
  symbol: string;
  signalDate: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSignalId(scanDate: string, symbol: string, strategyId: string): string {
  return crypto
    .createHash('sha256')
    .update(`${scanDate}|${symbol}|${strategyId}`)
    .digest('hex')
    .slice(0, 32);
}

function now(): string {
  return new Date().toISOString();
}

// ── Singleton service ────────────────────────────────────────────────────────

class ScanScorecardService {
  private static instance: ScanScorecardService | null = null;

  static getInstance(): ScanScorecardService {
    if (!ScanScorecardService.instance) {
      ScanScorecardService.instance = new ScanScorecardService();
    }
    return ScanScorecardService.instance;
  }

  /**
   * Inserts one row per opportunity using INSERT OR IGNORE.
   * Returns the number of rows actually inserted.
   */
  logSignals(scanDate: string, opportunities: StockInvestmentOpportunity[]): number {
    const db = getDB();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO scan_signal_log (
        signal_id,
        scan_date,
        symbol,
        strategy_id,
        strategy_category,
        convergence_count,
        signal_price,
        signal_rsi,
        signal_volume_ratio,
        signal_metadata,
        outcome_label,
        created_at,
        updated_at
      ) VALUES (
        @signal_id,
        @scan_date,
        @symbol,
        @strategy_id,
        @strategy_category,
        @convergence_count,
        @signal_price,
        @signal_rsi,
        @signal_volume_ratio,
        @signal_metadata,
        'PENDING',
        @created_at,
        @updated_at
      )
    `);

    let inserted = 0;
    const ts = now();

    const insertMany = db.transaction((opps: StockInvestmentOpportunity[]) => {
      for (const opp of opps) {
        const strategyId = opp.strategyCategory as string;
        const signalId = makeSignalId(scanDate, opp.symbol, strategyId);

        const rsi = opp.pillars?.technicals?.rsi14 ?? null;
        const volumeRatio = opp.deliverySurgeRatio ?? null;

        const metadata: Record<string, unknown> = {
          actionDirective: opp.actionDirective,
          confidenceLevel: opp.confidenceLevel,
          bullishProbabilityPct: opp.bullishProbabilityPct,
          upsidePotentialPct: opp.upsidePotentialPct,
          targetPrice: opp.targetPrice,
          stopLossPrice: opp.stopLossPrice,
        };

        const info = stmt.run({
          signal_id: signalId,
          scan_date: scanDate,
          symbol: opp.symbol,
          strategy_id: strategyId,
          strategy_category: opp.strategyCategory,
          convergence_count: opp.convergenceCount ?? 1,
          signal_price: opp.cmp,
          signal_rsi: rsi,
          signal_volume_ratio: volumeRatio,
          signal_metadata: JSON.stringify(metadata),
          created_at: ts,
          updated_at: ts,
        });

        inserted += Number(info.changes);
      }
    });

    insertMany(opportunities);
    return inserted;
  }

  /**
   * Computes pct_change vs signal_price and sets WIN/LOSS/NEUTRAL.
   * WIN: > 5%, LOSS: < -5%, NEUTRAL: otherwise.
   */
  updateOutcome(signalId: string, checkDate: string, currentPrice: number): void {
    const db = getDB();

    const row = db
      .prepare('SELECT signal_price FROM scan_signal_log WHERE signal_id = ?')
      .get(signalId) as { signal_price: number } | undefined;

    if (!row || row.signal_price == null || row.signal_price === 0) return;

    const pctChange = ((currentPrice - row.signal_price) / row.signal_price) * 100;
    let label: 'WIN' | 'LOSS' | 'NEUTRAL';

    if (pctChange > 5) {
      label = 'WIN';
    } else if (pctChange < -5) {
      label = 'LOSS';
    } else {
      label = 'NEUTRAL';
    }

    db.prepare(`
      UPDATE scan_signal_log
      SET outcome_check_date = ?,
          outcome_price = ?,
          outcome_pct_change = ?,
          outcome_label = ?,
          updated_at = ?
      WHERE signal_id = ?
    `).run(checkDate, currentPrice, pctChange, label, now(), signalId);
  }

  /**
   * Returns rows grouped by strategy with win_rate, avg_return, total_signals.
   */
  getScorecard(strategyId?: string, fromDate?: string): ScorecardRow[] {
    const db = getDB();

    const conditions: string[] = ["outcome_label != 'PENDING'"];
    const params: unknown[] = [];

    if (strategyId) {
      conditions.push('strategy_id = ?');
      params.push(strategyId);
    }
    if (fromDate) {
      conditions.push('scan_date >= ?');
      params.push(fromDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db
      .prepare(`
        SELECT
          strategy_id,
          strategy_category,
          COUNT(*) AS total_signals,
          SUM(CASE WHEN outcome_label = 'WIN'     THEN 1 ELSE 0 END) AS win_count,
          SUM(CASE WHEN outcome_label = 'LOSS'    THEN 1 ELSE 0 END) AS loss_count,
          SUM(CASE WHEN outcome_label = 'NEUTRAL' THEN 1 ELSE 0 END) AS neutral_count,
          SUM(CASE WHEN outcome_label = 'PENDING' THEN 1 ELSE 0 END) AS pending_count,
          ROUND(
            100.0 * SUM(CASE WHEN outcome_label = 'WIN' THEN 1 ELSE 0 END) / COUNT(*),
            2
          ) AS win_rate,
          ROUND(AVG(COALESCE(outcome_pct_change, 0)), 2) AS avg_return
        FROM scan_signal_log
        ${where}
        GROUP BY strategy_id, strategy_category
        ORDER BY win_rate DESC
      `)
      .all(...params) as ScorecardRow[];

    return rows;
  }

  /**
   * Returns PENDING signals older than daysOld (default 5) needing outcome updates.
   */
  getPendingOutcomes(daysOld = 5): PendingOutcome[] {
    const db = getDB();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const rows = db
      .prepare(`
        SELECT signal_id, symbol, scan_date
        FROM scan_signal_log
        WHERE outcome_label = 'PENDING'
          AND scan_date <= ?
        ORDER BY scan_date ASC
      `)
      .all(cutoffStr) as Array<{ signal_id: string; symbol: string; scan_date: string }>;

    return rows.map((r) => ({
      signalId: r.signal_id,
      symbol: r.symbol,
      signalDate: r.scan_date,
    }));
  }
}

// ── Singleton export ─────────────────────────────────────────────────────────

export const scanScorecardService = ScanScorecardService.getInstance();
export { ScanScorecardService };
