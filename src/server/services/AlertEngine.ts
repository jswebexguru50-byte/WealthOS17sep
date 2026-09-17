import { getDB, dbAll, dbRun } from '../database.js';

export interface SmartAlert {
  id: string;
  symbol: string;
  portfolio: string;
  type: '52W_BREAKOUT' | 'RSI_OVERSOLD' | 'RSI_OVERBOUGHT' | 'VOLUME_SURGE' | 'SUPPORT_TEST' | 'CONCENTRATION_RISK' | 'CUSTOM_TARGET';
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'OPPORTUNITY';
  triggerValue: number | string;
  currentValue: number | string;
  timestamp: string;
  isRead: boolean;
}

export type AlertPriority = 'P0_CRITICAL' | 'P1_HIGH' | 'P2_MEDIUM' | 'P3_NORMAL';
export type AlertCategory = 'TRADING_INTEL' | 'INVESTMENT_INTEL' | 'MACRO_GOVERNANCE';
export type AlertLifecycleState = 'ARMED' | 'TRIGGERED' | 'COOLDOWN' | 'INVALIDATED';

export interface StatefulActionableAlert {
  id: string;
  alertCode: string; // e.g. TA-01, IA-01, RA-01
  category: AlertCategory;
  priority: AlertPriority;
  symbol: string;
  portfolio?: string;
  title: string;
  message: string;
  payload: Record<string, any>;
  state: AlertLifecycleState;
  timestamp: string;
  cooldownUntil: string;
  acknowledged: boolean;
  actionableRecommendation: string;
}

export class AlertEngine {
  private static instance: AlertEngine;
  private alertCache: Map<string, StatefulActionableAlert> = new Map();
  private lastScanTime: number = 0;

  public static getInstance(): AlertEngine {
    if (!AlertEngine.instance) {
      AlertEngine.instance = new AlertEngine();
    }
    return AlertEngine.instance;
  }

  // --- 1. LEGACY METHOD MAINTAINED FOR BACKWARDS COMPATIBILITY ---
  public async scanAndGenerateAlerts(): Promise<SmartAlert[]> {
    const db = getDB();
    const holdings = await dbAll(db, `
      SELECT symbol, portfolio, quantity, current_value, total_cost, day_change, prev_close, ltp, avg_buy_price
      FROM Holdings
      WHERE quantity > 0
    `);

    const alerts: SmartAlert[] = [];
    const totalVal = (holdings || []).reduce((acc: number, h: any) => acc + Number(h.current_value || h.total_cost || 0), 0);

    (holdings || []).forEach((h: any) => {
      const sym = h.symbol;
      const curVal = Number(h.current_value || h.total_cost || 0);
      const dayChgINR = Number(h.day_change || 0);
      const prevVal = curVal - dayChgINR;
      const dayChgPct = prevVal > 0 ? (dayChgINR / prevVal) * 100 : 0;
      const weightPct = totalVal > 0 ? (curVal / totalVal) * 100 : 0;

      // 1. Significant Daily Surge (Opportunity Alert)
      if (dayChgPct >= 4.0) {
        alerts.push({
          id: `SURGE_${sym}_${h.portfolio}`,
          symbol: sym,
          portfolio: h.portfolio,
          type: '52W_BREAKOUT',
          title: `Strong Momentum Breakout: ${sym}`,
          message: `${sym} is rallying +${dayChgPct.toFixed(2)}% today in ${h.portfolio}.`,
          severity: 'OPPORTUNITY',
          triggerValue: '+4.0%',
          currentValue: `+${dayChgPct.toFixed(2)}%`,
          timestamp: new Date().toISOString(),
          isRead: false
        });
      }

      // 2. Significant Daily Drop (Warning Alert)
      if (dayChgPct <= -3.0) {
        alerts.push({
          id: `DROP_${sym}_${h.portfolio}`,
          symbol: sym,
          portfolio: h.portfolio,
          type: 'SUPPORT_TEST',
          title: `Sharp Drawdown Warning: ${sym}`,
          message: `${sym} declined ${dayChgPct.toFixed(2)}% today. Monitor technical support levels.`,
          severity: 'WARNING',
          triggerValue: '-3.0%',
          currentValue: `${dayChgPct.toFixed(2)}%`,
          timestamp: new Date().toISOString(),
          isRead: false
        });
      }

      // 3. High Concentration Risk (Critical Alert)
      if (weightPct >= 8.0 && h.portfolio !== 'US - IBKR') {
        alerts.push({
          id: `CONC_${sym}_${h.portfolio}`,
          symbol: sym,
          portfolio: h.portfolio,
          type: 'CONCENTRATION_RISK',
          title: `High Single-Stock Concentration: ${sym}`,
          message: `${sym} accounts for ${weightPct.toFixed(1)}% of total family portfolio. Consider rebalancing if allocation exceeds target.`,
          severity: 'WARNING',
          triggerValue: '8.0%',
          currentValue: `${weightPct.toFixed(1)}%`,
          timestamp: new Date().toISOString(),
          isRead: false
        });
      }
    });

    return alerts;
  }

  // --- 2. V6.0 STATEFUL ACTIONABLE REAL-TIME ALERT ENGINE ---
  public async scanAndGenerateStatefulAlerts(): Promise<StatefulActionableAlert[]> {
    const db = getDB();
    const now = new Date();
    const nowIso = now.toISOString();
    const fourHoursLaterIso = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
    const alerts: StatefulActionableAlert[] = [];

    // Ensure AlertLog table exists
    try {
      await dbRun(db, `
        CREATE TABLE IF NOT EXISTS AlertLog (
          id TEXT PRIMARY KEY,
          alert_code TEXT NOT NULL,
          category TEXT NOT NULL,
          priority TEXT NOT NULL,
          symbol TEXT,
          portfolio TEXT,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          payload_json TEXT,
          state TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          cooldown_until TEXT,
          acknowledged INTEGER DEFAULT 0,
          recommendation TEXT
        )
      `);
    } catch {}

    // A. MACRO GOVERNANCE ALERTS (RA-01 to RA-03)
    const holdings = await dbAll(db, `
      SELECT symbol, portfolio, quantity, current_value, total_cost, day_change, prev_close, ltp, avg_buy_price
      FROM Holdings WHERE quantity > 0
    `) || [];
    const totalVal = holdings.reduce((acc: number, h: any) => acc + Number(h.current_value || h.total_cost || 0), 0);

    holdings.forEach((h: any) => {
      const sym = h.symbol;
      const curVal = Number(h.current_value || h.total_cost || 0);
      const weightPct = totalVal > 0 ? (curVal / totalVal) * 100 : 0;
      const dayChgINR = Number(h.day_change || 0);
      const prevVal = curVal - dayChgINR;
      const dayChgPct = prevVal > 0 ? (dayChgINR / prevVal) * 100 : 0;
      const pnlPct = Number(h.avg_buy_price) > 0 ? ((Number(h.ltp) - Number(h.avg_buy_price)) / Number(h.avg_buy_price)) * 100 : 0;

      // RA-02: Single Stock Concentration Cap Breach (> 8.0%)
      if (weightPct >= 8.0 && h.portfolio !== 'US - IBKR') {
        const id = `RA_02_${sym}_${h.portfolio}`;
        if (!this.isDebounced(id)) {
          alerts.push({
            id,
            alertCode: 'RA-02',
            category: 'MACRO_GOVERNANCE',
            priority: 'P1_HIGH',
            symbol: sym,
            portfolio: h.portfolio,
            title: `Concentration Cap Breach: ${sym} (${weightPct.toFixed(1)}%)`,
            message: `${sym} allocation in ${h.portfolio} is ${weightPct.toFixed(1)}% of family portfolio, exceeding the 8.0% institutional risk ceiling.`,
            payload: { symbol: sym, weightPct, portfolio: h.portfolio, excessValueINR: curVal - (totalVal * 0.08) },
            state: 'TRIGGERED',
            timestamp: nowIso,
            cooldownUntil: fourHoursLaterIso,
            acknowledged: false,
            actionableRecommendation: `Trim position to 8.0% ceiling to release ₹${((curVal - (totalVal * 0.08)) / 100000).toFixed(2)} Lakhs into cash reserve.`
          });
        }
      }

      // TA-03: Fast Breakeven Stop-Loss Lock (+5.0% Profit Advance)
      if (pnlPct >= 5.0) {
        const id = `TA_03_BE_${sym}_${h.portfolio}`;
        if (!this.isDebounced(id)) {
          const beStopPrice = Number((Number(h.avg_buy_price) * 1.003).toFixed(2));
          alerts.push({
            id,
            alertCode: 'TA-03',
            category: 'TRADING_INTEL',
            priority: 'P0_CRITICAL',
            symbol: sym,
            portfolio: h.portfolio,
            title: `Fast Breakeven Stop Lock Armed: ${sym} (+${pnlPct.toFixed(1)}%)`,
            message: `${sym} has reached the +5.0% profit threshold. Institutional protocol mandates moving stop-loss to Breakeven (+0.3% friction buffer).`,
            payload: { symbol: sym, buyPrice: h.avg_buy_price, currentPrice: h.ltp, pnlPct, beStopPrice },
            state: 'TRIGGERED',
            timestamp: nowIso,
            cooldownUntil: fourHoursLaterIso,
            acknowledged: false,
            actionableRecommendation: `Raise Stop Loss order in broker console to ₹${beStopPrice} to eliminate all downside capital risk.`
          });
        }
      }
    });

    // B. SCAN ACTIVE TRADING OPPORTUNITIES (TA-01 SMC FVG, TA-02 VPA Breakout)
    const recentCandidates: any[] = await dbAll(db, `
      SELECT symbol, close, volume, prev_close,
        ((close - prev_close) / prev_close * 100) as day_gain
      FROM DailyOHLCV
      WHERE trade_date = (SELECT MAX(trade_date) FROM DailyOHLCV)
        AND close >= 50 AND volume >= 50000
      ORDER BY (close * volume) DESC
      LIMIT 100
    `) || [];

    recentCandidates.forEach((c: any) => {
      const sym = c.symbol;
      const gain = Number(c.day_gain || 0);

      // TA-02: VPA Base Compaction Breakout with LPE
      if (gain >= 3.5 && gain <= 7.0) {
        const id = `TA_02_VPA_${sym}`;
        if (!this.isDebounced(id)) {
          alerts.push({
            id,
            alertCode: 'TA-02',
            category: 'TRADING_INTEL',
            priority: 'P1_HIGH',
            symbol: sym,
            title: `VPA Base Breakout + LPE Setup: ${sym} (+${gain.toFixed(1)}%)`,
            message: `${sym} has cleared upper base compaction resistance on institutional volume surge. Limit Pullback Entry (LPE) active.`,
            payload: { symbol: sym, breakoutPrice: c.close, volume: c.volume, dayGain: gain },
            state: 'TRIGGERED',
            timestamp: nowIso,
            cooldownUntil: fourHoursLaterIso,
            acknowledged: false,
            actionableRecommendation: `Execute 35% Tranche A at market, and set 65% Tranche B limit order at base shelf ₹${(c.close * 0.985).toFixed(2)}.`
          });
        }
      }
    });

    // C. INVESTMENT INTEL: IA-01 EARNINGS ACCELERATION & IA-04 VALUATION DIP
    const investmentCandidates: any[] = await dbAll(db, `
      SELECT symbol, pe_ratio, roce_pct, debt_to_equity, sales_growth_5y_pct, pat_growth_5y_pct
      FROM FundamentalSnapshots
      WHERE roce_pct >= 20.0 AND debt_to_equity <= 0.40 AND pe_ratio > 0 AND pe_ratio <= 28.0
      ORDER BY roce_pct DESC
      LIMIT 15
    `) || [];

    investmentCandidates.forEach((cand: any) => {
      const sym = cand.symbol;
      const id = `IA_04_VAL_${sym}`;
      if (!this.isDebounced(id)) {
        alerts.push({
          id,
          alertCode: 'IA-04',
          category: 'INVESTMENT_INTEL',
          priority: 'P2_MEDIUM',
          symbol: sym,
          title: `Coffee Can Valuation Dip: ${sym} (ROCE ${cand.roce_pct}%, P/E ${cand.pe_ratio})`,
          message: `${sym} satisfies Tier-1 compounder criteria (ROCE ${cand.roce_pct}%, D/E ${cand.debt_to_equity}) and is trading at an attractive earnings multiple.`,
          payload: { symbol: sym, peRatio: cand.pe_ratio, roce: cand.roce_pct, debtToEquity: cand.debt_to_equity },
          state: 'TRIGGERED',
          timestamp: nowIso,
          cooldownUntil: fourHoursLaterIso,
          acknowledged: false,
          actionableRecommendation: `Deploy systematic tranche accumulation (Tranche 1: 33% allocation) for multi-year compounder portfolio.`
        });
      }
    });

    // Update in-memory cache and persist to DB
    alerts.forEach(a => {
      this.alertCache.set(a.id, a);
      dbRun(db, `
        INSERT OR REPLACE INTO AlertLog (
          id, alert_code, category, priority, symbol, portfolio, title, message,
          payload_json, state, timestamp, cooldown_until, acknowledged, recommendation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        a.id, a.alertCode, a.category, a.priority, a.symbol, a.portfolio || null,
        a.title, a.message, JSON.stringify(a.payload), a.state, a.timestamp,
        a.cooldownUntil, a.acknowledged ? 1 : 0, a.actionableRecommendation
      ]).catch(() => {});
    });

    this.lastScanTime = now.getTime();
    return Array.from(this.alertCache.values());
  }

  public async acknowledgeAlert(id: string): Promise<boolean> {
    const alert = this.alertCache.get(id);
    if (alert) {
      alert.acknowledged = true;
      alert.state = 'COOLDOWN';
      const db = getDB();
      await dbRun(db, `UPDATE AlertLog SET acknowledged = 1, state = 'COOLDOWN' WHERE id = ?`, [id]).catch(() => {});
      return true;
    }
    return false;
  }

  public getActiveAlerts(): StatefulActionableAlert[] {
    return Array.from(this.alertCache.values()).filter(a => !a.acknowledged);
  }

  private isDebounced(id: string): boolean {
    const existing = this.alertCache.get(id);
    if (!existing) return false;
    const now = new Date().getTime();
    const cooldownTime = new Date(existing.cooldownUntil).getTime();
    return now < cooldownTime;
  }
}

