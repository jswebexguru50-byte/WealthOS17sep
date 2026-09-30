/**
 * TrendlyneQuotaManager.ts — Trendlyne MCP Max Quota & Rate-Limit Tracking
 * WealthOS V2 Mandatory Amendment — Trendlyne MCP Max Enrichment
 *
 * Implements:
 * - Max plan limits: 1,000 calls/day, 10,000 calls/month.
 * - Configurable reserves: default 100 daily reserve (10%) and 1,000 monthly reserve (10%)
 *   to guarantee interactive requests never get blocked by background enrichment.
 * - Persistent ledger in trendlyne_quota_ledger.
 */

import { getDB, dbRun, dbGet } from '../../../database.js';
import { TrendlyneQuotaState } from './TrendlyneContracts.js';

export class TrendlyneQuotaManager {
  private static instance: TrendlyneQuotaManager;

  private dailyLimit: number;
  private monthlyLimit: number;
  private dailyReserve: number;
  private monthlyReserve: number;

  private dailyUsed = 0;
  private monthlyUsed = 0;
  private lastResetDate = '';

  private constructor() {
    this.dailyLimit = Number(process.env.TRENDLYNE_DAILY_CALL_LIMIT) || 1000;
    this.monthlyLimit = Number(process.env.TRENDLYNE_MONTHLY_CALL_LIMIT) || 10000;
    this.dailyReserve = Number(process.env.TRENDLYNE_DAILY_RESERVE) || 100;
    this.monthlyReserve = Number(process.env.TRENDLYNE_MONTHLY_RESERVE) || 1000;
    this.lastResetDate = new Date().toISOString().substring(0, 10);
  }

  public static getInstance(): TrendlyneQuotaManager {
    if (!TrendlyneQuotaManager.instance) {
      TrendlyneQuotaManager.instance = new TrendlyneQuotaManager();
    }
    return TrendlyneQuotaManager.instance;
  }

  public async initialize(): Promise<void> {
    const today = new Date().toISOString().substring(0, 10);
    this.lastResetDate = today;

    const db = getDB();
    if (db) {
      try {
        const row = await dbGet<any>(
          db,
          `SELECT * FROM trendlyne_quota_ledger WHERE period_date = ?`,
          [today]
        );
        if (row) {
          this.dailyUsed = row.daily_used;
          this.monthlyUsed = row.monthly_used;
        } else {
          // Initialize for today
          await dbRun(
            db,
            `INSERT OR IGNORE INTO trendlyne_quota_ledger
             (period_date, daily_used, monthly_used, daily_limit, monthly_limit, last_updated)
             VALUES (?, 0, 0, ?, ?, ?)`,
            [today, this.dailyLimit, this.monthlyLimit, new Date().toISOString()]
          );
        }
      } catch (err) {
        // Mock fallback
      }
    }
  }

  public getQuotaState(): TrendlyneQuotaState {
    this.checkDailyReset();
    return {
      dailyUsed: this.dailyUsed,
      monthlyUsed: this.monthlyUsed,
      dailyLimit: this.dailyLimit,
      monthlyLimit: this.monthlyLimit,
      dailyReserve: this.dailyReserve,
      monthlyReserve: this.monthlyReserve,
      lastResetAt: this.lastResetDate,
    };
  }

  /**
   * Checks if quota is available for background daemon without infringing on interactive reserve.
   */
  public hasAvailableBackgroundQuota(callsNeeded = 1): boolean {
    this.checkDailyReset();
    const safeDailyLimit = this.dailyLimit - this.dailyReserve;
    const safeMonthlyLimit = this.monthlyLimit - this.monthlyReserve;

    return (
      this.dailyUsed + callsNeeded <= safeDailyLimit &&
      this.monthlyUsed + callsNeeded <= safeMonthlyLimit
    );
  }

  /**
   * Consumes quota units and updates ledger.
   */
  public async consumeQuota(calls = 1): Promise<boolean> {
    this.checkDailyReset();
    if (this.dailyUsed + calls > this.dailyLimit || this.monthlyUsed + calls > this.monthlyLimit) {
      return false;
    }

    this.dailyUsed += calls;
    this.monthlyUsed += calls;

    const today = new Date().toISOString().substring(0, 10);
    const db = getDB();
    if (db) {
      try {
        await dbRun(
          db,
          `UPDATE trendlyne_quota_ledger
           SET daily_used = ?, monthly_used = ?, last_updated = ?
           WHERE period_date = ?`,
          [this.dailyUsed, this.monthlyUsed, new Date().toISOString(), today]
        );
      } catch (err) {
        // Fallback
      }
    }

    return true;
  }

  private checkDailyReset(): void {
    const today = new Date().toISOString().substring(0, 10);
    if (today !== this.lastResetDate) {
      this.dailyUsed = 0;
      this.lastResetDate = today;
    }
  }

  public resetForTesting(): void {
    this.dailyUsed = 0;
    this.monthlyUsed = 0;
    this.lastResetDate = new Date().toISOString().substring(0, 10);
  }
}
