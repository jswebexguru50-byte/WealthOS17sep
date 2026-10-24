/**
 * FX Hedging Service
 * Manages FX exposure identification, hedge setup, P&L tracking, and liquidation
 */

import { Database } from 'sqlite3';
import { dbAll, dbGet, dbRun } from '../database.js';

export interface FxExposure {
  currency: string;
  amount: number;
  inrEquivalent: number;
  fxRate: number;
}

export interface HedgePosition {
  id: string;
  currency: string;
  exposure: number;
  hedgeSize: number;
  hedgeRatio: number;
  instrument: string;
  entryPrice: number;
  entryDate: string;
  exitPrice?: number;
  exitDate?: string;
  pnl?: number;
  coverage: number; // percentage
  status: 'ACTIVE' | 'LIQUIDATED';
  auditLog: string;
}

export class FxHedgingService {
  private static instance: FxHedgingService;

  static getInstance(): FxHedgingService {
    if (!FxHedgingService.instance) {
      FxHedgingService.instance = new FxHedgingService();
    }
    return FxHedgingService.instance;
  }

  /**
   * Identify FX exposure in portfolio
   */
  async identifyExposure(
    db: Database,
    portfolioId: string
  ): Promise<FxExposure[]> {
    // Query holdings with foreign currency
    const holdings = await dbAll(
      db,
      `
      SELECT symbol, quantity, currency, current_price
      FROM Holdings
      WHERE portfolio_id = ? AND currency != 'INR'
    `,
      [portfolioId]
    );

    const exposures: FxExposure[] = [];
    for (const h of holdings) {
      const amount = h.quantity * h.current_price;
      const fxRate = await this.getFxRate(db, h.currency, 'INR');
      exposures.push({
        currency: h.currency,
        amount,
        inrEquivalent: amount * fxRate,
        fxRate,
      });
    }
    return exposures;
  }

  /**
   * Setup hedge for FX exposure
   * Validates hedge ratio and size constraints
   */
  async setupHedge(
    db: Database,
    portfolioId: string,
    currency: string,
    exposure: number,
    hedgeRatio: number,
    instrument: string,
    entryPrice: number
  ): Promise<HedgePosition> {
    // Validate currency pair is standard (INR/USD, INR/GBP, INR/JPY, etc.)
    if (!this.isValidCurrencyPair(currency, 'INR')) {
      throw new Error('INVALID_CURRENCY_PAIR');
    }

    // Validate hedge ratio (0 < ratio <= 1 for over-hedge guard)
    if (hedgeRatio <= 0 || hedgeRatio > 1) {
      throw new Error('INVALID_HEDGE_RATIO');
    }

    const hedgeSize = exposure * hedgeRatio;

    // Create hedge position record
    const hedgeId = `HDG_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString().split('T')[0];

    const hedge: HedgePosition = {
      id: hedgeId,
      currency,
      exposure,
      hedgeSize,
      hedgeRatio,
      instrument,
      entryPrice,
      entryDate: now,
      coverage: hedgeRatio * 100,
      status: 'ACTIVE',
      auditLog: JSON.stringify({
        action: 'HEDGE_SETUP',
        timestamp: new Date().toISOString(),
        exposure,
        hedgeRatio,
        instrument,
        entryPrice,
      }),
    };

    await dbRun(
      db,
      `
      INSERT INTO fx_hedges (id, portfolio_id, currency, exposure, hedge_size, hedge_ratio, instrument, entry_price, entry_date, status, audit_log)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        hedge.id,
        portfolioId,
        hedge.currency,
        hedge.exposure,
        hedge.hedgeSize,
        hedge.hedgeRatio,
        hedge.instrument,
        hedge.entryPrice,
        hedge.entryDate,
        hedge.status,
        hedge.auditLog,
      ]
    );

    return hedge;
  }

  /**
   * Track daily marked-to-market P&L delta
   */
  async trackDailyPnl(
    db: Database,
    hedgeId: string,
    currentPrice: number
  ): Promise<number> {
    const hedge = await dbGet(
      db,
      `SELECT entry_price, hedge_size FROM fx_hedges WHERE id = ?`,
      [hedgeId]
    );

    if (!hedge) throw new Error('HEDGE_NOT_FOUND');

    const pnlDelta = (currentPrice - hedge.entry_price) * hedge.hedge_size;

    // Record daily P&L snapshot
    await dbRun(
      db,
      `
      INSERT INTO fx_hedge_pnl_log (hedge_id, price, pnl_delta, recorded_at)
      VALUES (?, ?, ?, datetime('now'))
    `,
      [hedgeId, currentPrice, pnlDelta]
    );

    return pnlDelta;
  }

  /**
   * Execute hedge liquidation when coverage target reached
   */
  async liquidateHedge(
    db: Database,
    hedgeId: string,
    exitPrice: number
  ): Promise<HedgePosition> {
    const hedge = await dbGet(
      db,
      `SELECT * FROM fx_hedges WHERE id = ?`,
      [hedgeId]
    );

    if (!hedge) throw new Error('HEDGE_NOT_FOUND');

    const pnl = (exitPrice - hedge.entry_price) * hedge.hedge_size;
    const exitDate = new Date().toISOString().split('T')[0];

    const updatedAuditLog = JSON.stringify({
      ...JSON.parse(hedge.audit_log),
      liquidation: {
        timestamp: new Date().toISOString(),
        exitPrice,
        exitDate,
        pnl,
        durationDays: Math.floor(
          (new Date(exitDate).getTime() - new Date(hedge.entry_date).getTime()) /
            (1000 * 60 * 60 * 24)
        ),
      },
    });

    await dbRun(
      db,
      `
      UPDATE fx_hedges
      SET status = 'LIQUIDATED', exit_price = ?, exit_date = ?, pnl = ?, audit_log = ?
      WHERE id = ?
    `,
      [exitPrice, exitDate, pnl, updatedAuditLog, hedgeId]
    );

    return {
      ...hedge,
      exitPrice,
      exitDate,
      pnl,
      status: 'LIQUIDATED',
      auditLog: updatedAuditLog,
    };
  }

  /**
   * Calculate net FX exposure after hedge
   * Supports 100% hedge (1:1 ratio) → zero net exposure
   * Supports partial hedge (0.5:1) → reduces by exactly half
   * Supports micro positions and multi-currency
   */
  async calculateNetExposure(
    db: Database,
    portfolioId: string,
    currencyPair?: string
  ): Promise<Map<string, number>> {
    const exposures = await this.identifyExposure(db, portfolioId);
    const hedges = await dbAll(
      db,
      `SELECT * FROM fx_hedges WHERE portfolio_id = ? AND status = 'ACTIVE'`,
      [portfolioId]
    );

    const netExposure = new Map<string, number>();

    for (const exp of exposures) {
      if (currencyPair && !currencyPair.includes(exp.currency)) continue;

      const hedgedAmount = hedges
        .filter((h) => h.currency === exp.currency)
        .reduce((sum, h) => sum + h.hedge_size, 0);

      netExposure.set(exp.currency, exp.inrEquivalent - hedgedAmount);
    }

    return netExposure;
  }

  /**
   * Validate FX currency pair
   */
  private isValidCurrencyPair(currency: string, baseCurrency: string): boolean {
    const validCurrencies = [
      'USD',
      'GBP',
      'EUR',
      'JPY',
      'AUD',
      'CAD',
      'SGD',
      'HKD',
      'CNY',
    ];
    return validCurrencies.includes(currency) && validCurrencies.includes(baseCurrency);
  }

  /**
   * Get FX rate for currency pair
   */
  private async getFxRate(
    db: Database,
    fromCurrency: string,
    toCurrency: string
  ): Promise<number> {
    // Mock implementation - in production would fetch from market data service
    const rates: Record<string, number> = {
      'USD-INR': 83.5,
      'GBP-INR': 105.0,
      'JPY-INR': 0.55,
      'EUR-INR': 90.0,
    };
    return rates[`${fromCurrency}-${toCurrency}`] || 1;
  }
}

export default FxHedgingService;
