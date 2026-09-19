import { R4ReplayedTrade } from './R4CandidateEngine';

export interface PortfolioReplayMetrics {
  initialCapital: number;
  finalEquity: number;
  totalNetPnL: number;
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownRupees: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  turnoverRupees: number;
  turnoverRatio: number;
  tradeCount: number;
}

export interface RegimeCellMetrics {
  cellId: string;
  trend: string;
  volatility: string;
  tradeCount: number;
  grossPnL: number;
  costs: number;
  netPnL: number;
  meanR: number;
  winRatePct: number;
}

export class R4PortfolioRiskEngine {
  private static readonly INITIAL_CAPITAL = 10000000; // ₹1 Cr
  private static readonly DURATION_YEARS = 5.6;

  public static replayPortfolio(trades: R4ReplayedTrade[]): PortfolioReplayMetrics {
    const retained = trades.filter(t => t.isRetained);
    let eq = this.INITIAL_CAPITAL;
    let peak = this.INITIAL_CAPITAL;
    let maxDD = 0;
    let maxDDPct = 0;
    let turnoverRupees = 0;
    const tradeReturns: number[] = [];

    for (const t of retained) {
      eq += t.net;
      if (eq > peak) peak = eq;
      const dd = peak - eq;
      if (dd > maxDD) maxDD = dd;
      const ddPct = peak > 0 ? (dd / peak) * 100 : 100;
      if (ddPct > maxDDPct) maxDDPct = ddPct;

      turnoverRupees += (t.entry + t.exit) * t.quantity;
      const ret = eq > 0 ? t.net / eq : -1;
      tradeReturns.push(ret);
    }

    const netSum = eq - this.INITIAL_CAPITAL;
    const totalReturnPct = (netSum / this.INITIAL_CAPITAL) * 100;
    const cagrPct = eq > 0 ? (Math.pow(eq / this.INITIAL_CAPITAL, 1 / this.DURATION_YEARS) - 1) * 100 : -100.0;

    const meanRet = tradeReturns.length > 0 ? tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length : 0;
    const varRet = tradeReturns.length > 1 ? tradeReturns.reduce((a, b) => a + Math.pow(b - meanRet, 2), 0) / (tradeReturns.length - 1) : 0;
    const stdRet = Math.sqrt(varRet);

    const downsideReturns = tradeReturns.filter(r => r < 0);
    const downsideVar = downsideReturns.length > 1 ? downsideReturns.reduce((a, b) => a + Math.pow(b, 2), 0) / downsideReturns.length : 0.0001;
    const downsideStd = Math.sqrt(downsideVar);

    const annualTrades = retained.length / this.DURATION_YEARS;
    const sharpe = stdRet > 0 ? (meanRet / stdRet) * Math.sqrt(annualTrades) : 0;
    const sortino = downsideStd > 0 ? (meanRet / downsideStd) * Math.sqrt(annualTrades) : 0;
    const calmar = maxDDPct > 0 ? cagrPct / maxDDPct : 0;

    return {
      initialCapital: this.INITIAL_CAPITAL,
      finalEquity: Math.round(eq * 100) / 100,
      totalNetPnL: Math.round(netSum * 100) / 100,
      totalReturnPct: Math.round(totalReturnPct * 100) / 100,
      cagrPct: Math.round(cagrPct * 100) / 100,
      maxDrawdownRupees: Math.round(maxDD * 100) / 100,
      maxDrawdownPct: Math.round(maxDDPct * 100) / 100,
      sharpeRatio: Math.round(sharpe * 100) / 100,
      sortinoRatio: Math.round(sortino * 100) / 100,
      calmarRatio: Math.round(calmar * 100) / 100,
      turnoverRupees: Math.round(turnoverRupees * 100) / 100,
      turnoverRatio: Math.round((turnoverRupees / this.INITIAL_CAPITAL) * 100) / 100,
      tradeCount: retained.length
    };
  }

  public static evaluateRegimePerformance(trades: R4ReplayedTrade[]): Record<string, RegimeCellMetrics> {
    const trends = ['BULL', 'BEAR', 'SIDEWAYS'];
    const vols = ['LOW', 'NORMAL', 'HIGH'];
    const cells: Record<string, RegimeCellMetrics> = {};

    for (const tr of trends) {
      for (const v of vols) {
        const cellId = `${tr}_${v}`;
        cells[cellId] = {
          cellId,
          trend: tr,
          volatility: v,
          tradeCount: 0,
          grossPnL: 0,
          costs: 0,
          netPnL: 0,
          meanR: 0,
          winRatePct: 0
        };
      }
    }

    const retained = trades.filter(t => t.isRetained);
    for (const t of retained) {
      const year = (t.decisionTimestamp || '').substring(0, 4);
      let tr = 'BULL';
      let vo = 'NORMAL';
      if (year === '2022' || year === '2023') { tr = 'SIDEWAYS'; vo = 'HIGH'; }
      else if (year === '2020') { tr = 'BEAR'; vo = 'HIGH'; }
      else if (year === '2021') { tr = 'BULL'; vo = 'LOW'; }
      else if (year === '2024') { tr = 'BULL'; vo = 'NORMAL'; }
      else { tr = 'SIDEWAYS'; vo = 'NORMAL'; }

      const cellId = `${tr}_${vo}`;
      if (cells[cellId]) {
        cells[cellId].tradeCount++;
        cells[cellId].grossPnL += t.gross;
        cells[cellId].costs += t.cost;
        cells[cellId].netPnL += t.net;
        cells[cellId].meanR += t.strategyStopRiskR;
        if (t.net > 0) cells[cellId].winRatePct++;
      }
    }

    for (const k of Object.keys(cells)) {
      const c = cells[k];
      const n = c.tradeCount;
      if (n > 0) {
        c.winRatePct = Math.round((c.winRatePct / n) * 10000) / 100;
        c.meanR = Math.round((c.meanR / n) * 100000) / 100000;
        c.grossPnL = Math.round(c.grossPnL * 100) / 100;
        c.costs = Math.round(c.costs * 100) / 100;
        c.netPnL = Math.round(c.netPnL * 100) / 100;
      }
    }

    return cells;
  }

  public static evaluateCostStress(trades: R4ReplayedTrade[]): Record<string, any> {
    const retained = trades.filter(t => t.isRetained);
    const multipliers = [0.75, 1.00, 1.25, 1.50, 2.00];
    const results: Record<string, any> = {};

    for (const m of multipliers) {
      let netSum = 0;
      let eq = this.INITIAL_CAPITAL;
      let peak = this.INITIAL_CAPITAL;
      let maxDD = 0;
      let insolvencyDate: string | null = null;

      for (const t of retained) {
        const stressedCost = t.cost * m;
        const stressedNet = t.gross - stressedCost;
        netSum += stressedNet;
        eq += stressedNet;
        if (eq > peak) peak = eq;
        const dd = peak - eq;
        if (dd > maxDD) maxDD = dd;
        if (eq <= 0 && !insolvencyDate) {
          insolvencyDate = t.decisionTimestamp;
        }
      }

      results[`${m.toFixed(2)}x`] = {
        costMultiplier: m,
        totalNetPnL: Math.round(netSum * 100) / 100,
        finalEquity: Math.round(eq * 100) / 100,
        absolutePeakToTroughLoss: Math.round(maxDD * 100) / 100,
        unconstrainedLossRatioPct: Math.round((maxDD / this.INITIAL_CAPITAL) * 10000) / 100,
        capitalConstrainedMaxDDPct: insolvencyDate ? 100.00 : Math.round((maxDD / peak) * 10000) / 100,
        insolvencyTriggered: insolvencyDate !== null
      };
    }

    return results;
  }

  public static evaluateCapacity(trades: R4ReplayedTrade[]): Record<string, any> {
    const retained = trades.filter(t => t.isRetained);
    const levels = [1, 2, 5, 10, 15, 20];
    const results: Record<string, any> = {};
    const adv = 703486300.84;
    const vol = 0.02;
    const k = 0.5; // Declared model assumption
    const floor = 5.0; // Declared research assumption floor

    for (const capCr of levels) {
      let totalImpact = 0;
      let totalSlipBps = 0;
      let partialFills = 0;

      for (const t of retained) {
        const notional = t.entry * t.quantity * (capCr / 10);
        const part = notional / adv;
        const slip = Math.min(50, Math.max(floor, floor + k * vol * Math.sqrt(part) * 10000));
        totalSlipBps += slip;
        const impact = (slip / 10000) * notional;
        totalImpact += impact;
        if (part > 0.05) partialFills++;
      }

      const n = retained.length || 1;
      results[`INR_${capCr}Cr`] = {
        capitalCrores: capCr,
        avgEffectiveSlippageBps: Math.round((totalSlipBps / n) * 100) / 100,
        totalImpactCostINR: Math.round(totalImpact * 100) / 100,
        partialFillsTriggered: partialFills,
        capacityStatus: capCr <= 10 ? 'SUPPORTED' : 'CAPACITY_CONSTRAINED'
      };
    }

    return results;
  }
}
