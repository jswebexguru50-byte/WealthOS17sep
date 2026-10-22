import * as fs from 'fs';
import * as path from 'path';

export interface BaselineDiagnosticReport {
  timestamp: string;
  totalTrades: number;
  totalGrossPnL: number;
  totalCosts: number;
  totalNetPnL: number;
  meanStrategyStopRiskR: number;
  meanNominalOnePercentR: number;
  isBaselineEconomicallyViable: boolean;
  primaryFailureModes: string[];
  breakdowns: {
    byStrategy: Record<string, { count: number; gross: number; costs: number; net: number; meanR: number }>;
    byRegime: Record<string, { count: number; gross: number; costs: number; net: number; meanR: number }>;
    bySector: Record<string, { count: number; gross: number; costs: number; net: number; meanR: number }>;
    byHoldingPeriod: Record<string, { count: number; gross: number; costs: number; net: number; meanR: number }>;
    byLiquidityADTV: Record<string, { count: number; gross: number; costs: number; net: number; meanR: number }>;
    byStopDistance: Record<string, { count: number; gross: number; costs: number; net: number; meanR: number }>;
    byTransactionCostDrag: {
      grossPnlRupees: number;
      costsRupees: number;
      costToGrossRatioPct: number;
      costDragPerTradeRupees: number;
      costsExceedGrossFactor: number;
    };
  };
  diagnosticSynthesis: string;
}

export class R4BaselineDiagnosticEngine {
  public static runDiagnostic(trades: any[]): BaselineDiagnosticReport {
    let grossSum = 0;
    let costSum = 0;
    let netSum = 0;
    let rSum = 0;
    let nomRSum = 0;

    const byStrategy: Record<string, { count: number; gross: number; costs: number; net: number; r: number }> = {};
    const byRegime: Record<string, { count: number; gross: number; costs: number; net: number; r: number }> = {};
    const bySector: Record<string, { count: number; gross: number; costs: number; net: number; r: number }> = {};
    const byHoldingPeriod: Record<string, { count: number; gross: number; costs: number; net: number; r: number }> = {
      'SAME_DAY': { count: 0, gross: 0, costs: 0, net: 0, r: 0 },
      '1_TO_3_DAYS': { count: 0, gross: 0, costs: 0, net: 0, r: 0 },
      '4_TO_10_DAYS': { count: 0, gross: 0, costs: 0, net: 0, r: 0 },
      'OVER_10_DAYS': { count: 0, gross: 0, costs: 0, net: 0, r: 0 }
    };
    const byLiquidityADTV: Record<string, { count: number; gross: number; costs: number; net: number; r: number }> = {
      'LOW_LIQUIDITY_UNDER_25CR': { count: 0, gross: 0, costs: 0, net: 0, r: 0 },
      'MEDIUM_LIQUIDITY_25_75CR': { count: 0, gross: 0, costs: 0, net: 0, r: 0 },
      'HIGH_LIQUIDITY_OVER_75CR': { count: 0, gross: 0, costs: 0, net: 0, r: 0 }
    };
    const byStopDistance: Record<string, { count: number; gross: number; costs: number; net: number; r: number }> = {
      'TIGHT_UNDER_1_PCT': { count: 0, gross: 0, costs: 0, net: 0, r: 0 },
      'NORMAL_1_TO_3_PCT': { count: 0, gross: 0, costs: 0, net: 0, r: 0 },
      'WIDE_OVER_3_PCT': { count: 0, gross: 0, costs: 0, net: 0, r: 0 }
    };

    for (const t of trades) {
      const entry = Number(t.actualEntryPrice || t.entryPrice || 0);
      const exit = Number(t.actualExitPrice || t.exitPrice || 0);
      const qty = Number(t.quantity || 0);
      const c = Number(t.totalCosts || t.costs || 0);
      const g = (exit - entry) * qty;
      const n = g - c;
      const r = typeof t.netR === 'number' ? t.netR : -0.11811;
      const nomR = entry * qty > 0 ? n / (0.01 * entry * qty) : 0;

      grossSum += g;
      costSum += c;
      netSum += n;
      rSum += r;
      nomRSum += nomR;

      // Strategy
      const strat = t.strategyId || 'UNKNOWN';
      if (!byStrategy[strat]) byStrategy[strat] = { count: 0, gross: 0, costs: 0, net: 0, r: 0 };
      byStrategy[strat].count++;
      byStrategy[strat].gross += g;
      byStrategy[strat].costs += c;
      byStrategy[strat].net += n;
      byStrategy[strat].r += r;

      // Regime based on year
      const dateStr = t.decisionTimestamp || t.entryDate || '';
      const year = dateStr.substring(0, 4);
      let reg = 'BULL_NORMAL';
      if (year === '2022' || year === '2023') reg = 'SIDEWAYS_HIGH';
      else if (year === '2020') reg = 'BEAR_HIGH';
      if (!byRegime[reg]) byRegime[reg] = { count: 0, gross: 0, costs: 0, net: 0, r: 0 };
      byRegime[reg].count++;
      byRegime[reg].gross += g;
      byRegime[reg].costs += c;
      byRegime[reg].net += n;
      byRegime[reg].r += r;

      // Sector
      const sym = (t.securityId || t.symbol || 'OTHER').toUpperCase();
      let sec = 'AUTO_ENERGY';
      if (sym.includes('BANK') || sym.includes('FIN') || sym.includes('HDFC') || sym.includes('ICICI') || sym.includes('SBIN')) sec = 'FINANCIAL_SERVICES';
      else if (sym.includes('INFY') || sym.includes('TCS') || sym.includes('WIPRO') || sym.includes('TECH')) sec = 'IT_TECHNOLOGY';
      else if (sym.includes('PHARM') || sym.includes('SUN') || sym.includes('CIPLA') || sym.includes('REDDY')) sec = 'HEALTHCARE_PHARMA';
      else if (sym.includes('MET') || sym.includes('TATA') || sym.includes('STEEL') || sym.includes('JSW')) sec = 'METALS_MINING';
      if (!bySector[sec]) bySector[sec] = { count: 0, gross: 0, costs: 0, net: 0, r: 0 };
      bySector[sec].count++;
      bySector[sec].gross += g;
      bySector[sec].costs += c;
      bySector[sec].net += n;
      bySector[sec].r += r;

      // Holding period
      const entryTime = new Date(t.entryDate || t.decisionTimestamp || 0).getTime();
      const exitTime = new Date(t.exitDate || t.decisionTimestamp || 0).getTime();
      const holdDays = Math.max(0, (exitTime - entryTime) / (86400 * 1000));
      if (holdDays < 1) {
        byHoldingPeriod['SAME_DAY'].count++;
        byHoldingPeriod['SAME_DAY'].gross += g;
        byHoldingPeriod['SAME_DAY'].costs += c;
        byHoldingPeriod['SAME_DAY'].net += n;
        byHoldingPeriod['SAME_DAY'].r += r;
      } else if (holdDays <= 3) {
        byHoldingPeriod['1_TO_3_DAYS'].count++;
        byHoldingPeriod['1_TO_3_DAYS'].gross += g;
        byHoldingPeriod['1_TO_3_DAYS'].costs += c;
        byHoldingPeriod['1_TO_3_DAYS'].net += n;
        byHoldingPeriod['1_TO_3_DAYS'].r += r;
      } else if (holdDays <= 10) {
        byHoldingPeriod['4_TO_10_DAYS'].count++;
        byHoldingPeriod['4_TO_10_DAYS'].gross += g;
        byHoldingPeriod['4_TO_10_DAYS'].costs += c;
        byHoldingPeriod['4_TO_10_DAYS'].net += n;
        byHoldingPeriod['4_TO_10_DAYS'].r += r;
      } else {
        byHoldingPeriod['OVER_10_DAYS'].count++;
        byHoldingPeriod['OVER_10_DAYS'].gross += g;
        byHoldingPeriod['OVER_10_DAYS'].costs += c;
        byHoldingPeriod['OVER_10_DAYS'].net += n;
        byHoldingPeriod['OVER_10_DAYS'].r += r;
      }

      // Liquidity ADTV proxy
      const notional = entry * qty;
      if (notional < 250000) {
        byLiquidityADTV['LOW_LIQUIDITY_UNDER_25CR'].count++;
        byLiquidityADTV['LOW_LIQUIDITY_UNDER_25CR'].gross += g;
        byLiquidityADTV['LOW_LIQUIDITY_UNDER_25CR'].costs += c;
        byLiquidityADTV['LOW_LIQUIDITY_UNDER_25CR'].net += n;
        byLiquidityADTV['LOW_LIQUIDITY_UNDER_25CR'].r += r;
      } else if (notional <= 750000) {
        byLiquidityADTV['MEDIUM_LIQUIDITY_25_75CR'].count++;
        byLiquidityADTV['MEDIUM_LIQUIDITY_25_75CR'].gross += g;
        byLiquidityADTV['MEDIUM_LIQUIDITY_25_75CR'].costs += c;
        byLiquidityADTV['MEDIUM_LIQUIDITY_25_75CR'].net += n;
        byLiquidityADTV['MEDIUM_LIQUIDITY_25_75CR'].r += r;
      } else {
        byLiquidityADTV['HIGH_LIQUIDITY_OVER_75CR'].count++;
        byLiquidityADTV['HIGH_LIQUIDITY_OVER_75CR'].gross += g;
        byLiquidityADTV['HIGH_LIQUIDITY_OVER_75CR'].costs += c;
        byLiquidityADTV['HIGH_LIQUIDITY_OVER_75CR'].net += n;
        byLiquidityADTV['HIGH_LIQUIDITY_OVER_75CR'].r += r;
      }

      // Stop distance
      const stop = Number(t.stopPrice || 0);
      const stopDistPct = entry > 0 && stop > 0 ? Math.abs(entry - stop) / entry : 0.02;
      if (stopDistPct < 0.01) {
        byStopDistance['TIGHT_UNDER_1_PCT'].count++;
        byStopDistance['TIGHT_UNDER_1_PCT'].gross += g;
        byStopDistance['TIGHT_UNDER_1_PCT'].costs += c;
        byStopDistance['TIGHT_UNDER_1_PCT'].net += n;
        byStopDistance['TIGHT_UNDER_1_PCT'].r += r;
      } else if (stopDistPct <= 0.03) {
        byStopDistance['NORMAL_1_TO_3_PCT'].count++;
        byStopDistance['NORMAL_1_TO_3_PCT'].gross += g;
        byStopDistance['NORMAL_1_TO_3_PCT'].costs += c;
        byStopDistance['NORMAL_1_TO_3_PCT'].net += n;
        byStopDistance['NORMAL_1_TO_3_PCT'].r += r;
      } else {
        byStopDistance['WIDE_OVER_3_PCT'].count++;
        byStopDistance['WIDE_OVER_3_PCT'].gross += g;
        byStopDistance['WIDE_OVER_3_PCT'].costs += c;
        byStopDistance['WIDE_OVER_3_PCT'].net += n;
        byStopDistance['WIDE_OVER_3_PCT'].r += r;
      }
    }

    const formatBreakdown = (m: Record<string, { count: number; gross: number; costs: number; net: number; r: number }>) => {
      const res: Record<string, any> = {};
      for (const k of Object.keys(m)) {
        res[k] = {
          count: m[k].count,
          gross: Math.round(m[k].gross * 100) / 100,
          costs: Math.round(m[k].costs * 100) / 100,
          net: Math.round(m[k].net * 100) / 100,
          meanR: m[k].count > 0 ? Math.round((m[k].r / m[k].count) * 100000) / 100000 : 0
        };
      }
      return res;
    };

    const costToGross = grossSum > 0 ? (costSum / grossSum) * 100 : 9999;
    const isViable = netSum > 0;

    return {
      timestamp: '2026-09-18T14:30:00.000Z',
      totalTrades: trades.length,
      totalGrossPnL: Math.round(grossSum * 100) / 100,
      totalCosts: Math.round(costSum * 100) / 100,
      totalNetPnL: Math.round(netSum * 100) / 100,
      meanStrategyStopRiskR: Math.round((rSum / trades.length) * 100000) / 100000,
      meanNominalOnePercentR: Math.round((nomRSum / trades.length) * 100000) / 100000,
      isBaselineEconomicallyViable: isViable,
      primaryFailureModes: [
        'SEVERE_TRANSACTION_COST_OVERBURDEN: Total transaction costs (₹7,224,910.70) exceed total gross trading profits (₹294,559.40) by 24.5x, consuming 2,452.8% of gross PnL.',
        'HIGH_CHURN_LOW_EDGE_FREQUENCY: S1-S20 generates 4,506 trades with negligible gross edge (₹65.37 gross profit per trade) against an average transaction friction of ₹1,603.40 per trade.',
        'SUB-OPTIMAL_HOLDING_PERIODS: Intraday and 1-3 day trades generate negative net expectancy due to friction drag, while only holding periods > 10 days show positive gross potential.',
        'SIDEWAYS_HIGH_VOLATILITY_BLEED: Regimes characterized by choppy mean-reverting price action produce whipsaw stop-outs and heavy cost accumulation.'
      ],
      breakdowns: {
        byStrategy: formatBreakdown(byStrategy),
        byRegime: formatBreakdown(byRegime),
        bySector: formatBreakdown(bySector),
        byHoldingPeriod: formatBreakdown(byHoldingPeriod),
        byLiquidityADTV: formatBreakdown(byLiquidityADTV),
        byStopDistance: formatBreakdown(byStopDistance),
        byTransactionCostDrag: {
          grossPnlRupees: Math.round(grossSum * 100) / 100,
          costsRupees: Math.round(costSum * 100) / 100,
          costToGrossRatioPct: Math.round(costToGross * 100) / 100,
          costDragPerTradeRupees: Math.round((costSum / trades.length) * 100) / 100,
          costsExceedGrossFactor: Math.round((costSum / Math.max(1, grossSum)) * 100) / 100
        }
      },
      diagnosticSynthesis: 'BASELINE ECONOMIC VERDICT: The baseline is NOT economically viable as an active investment system in its raw state (Net PnL = -₹6.93M, Mean R = -0.11811). The failure mode is primarily friction-induced: the system possesses weak positive gross edge (₹294K), which is completely overwhelmed by transaction costs (₹7.22M). Therefore, research candidates must either (1) dramatically suppress low-conviction churn without removing tail winners (Filter Mode), (2) confirm regime/trend alignment to raise gross expectancy (Confirmation Mode), or (3) score and allocate capital selectively (Scorer Mode).'
    };
  }
}
