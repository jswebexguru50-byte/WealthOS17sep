import { getDB, dbAll } from '../database.js';
import { DuckDbAdjustedOhlcvService } from './DuckDbAdjustedOhlcvService.js';

export interface StressScenario {
  id: string;
  name: string;
  description: string;
  portfolioImpactINR: number;
  portfolioImpactPct: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface AssetRiskMetric {
  symbol: string;
  portfolio: string;
  currentValue: number;
  weightPct: number;
  volatilityAnnualPct: number;
  betaNifty: number;
  sharpeRatio: number;
  sortinoRatio: number;
  var95DailyINR: number;
  maxDrawdownPct: number;
}

export interface PortfolioRiskReport {
  portfolioAUM: number;
  portfolioVolatilityPct: number;
  portfolioBetaNifty: number;
  portfolioBetaSp500: number;
  sharpeRatio: number;
  sortinoRatio: number;
  var95DailyINR: number;
  var95MonthlyINR: number;
  cvar95MonthlyINR: number;
  maxDrawdownPct: number;
  top5ConcentrationPct: number;
  stressScenarios: StressScenario[];
  assetRiskBreakdown: AssetRiskMetric[];
}

export class RiskAnalyticsEngine {
  private static instance: RiskAnalyticsEngine;

  public static getInstance(): RiskAnalyticsEngine {
    if (!RiskAnalyticsEngine.instance) {
      RiskAnalyticsEngine.instance = new RiskAnalyticsEngine();
    }
    return RiskAnalyticsEngine.instance;
  }

  public async computeRiskReport(selectedPortfolios: string[] | null): Promise<PortfolioRiskReport> {
    const db = getDB();
    let query = `
      SELECT symbol, portfolio, quantity, current_value, total_cost, currency, day_change, prev_close, ltp, avg_buy_price
      FROM Holdings
      WHERE quantity > 0
    `;
    let params: any[] = [];

    if (selectedPortfolios && selectedPortfolios.length > 0) {
      const placeholders = selectedPortfolios.map(() => 'LOWER(TRIM(?))').join(',');
      query += ` AND LOWER(TRIM(portfolio)) IN (${placeholders})`;
      params.push(...selectedPortfolios);
    }

    const holdings = await dbAll(db, query, params);
    let totalAUM = 0;
    holdings.forEach((h: any) => { totalAUM += Number(h.current_value || h.total_cost || 0); });

    if (totalAUM === 0) totalAUM = 1;

    // Preload historical daily prices for all holdings & Nifty 50 for actual statistical computation
    const histPricesMap = new Map<string, Array<{ date: string; close: number }>>();
    const niftyDailyReturns = new Map<string, number>();

    try {
      // Canonical adjusted catalog first. SQLite fills only symbols absent from DuckDB.
      const requestedSymbols = [...new Set(holdings.map((h: any) => String(h.symbol || '').toUpperCase().trim()).filter(Boolean))];
      for (let i = 0; i < requestedSymbols.length; i += 500) {
        const adjusted = await DuckDbAdjustedOhlcvService.getDailyBarsForSymbols(requestedSymbols.slice(i, i + 500), 10_000);
        adjusted.forEach((bars, symbol) => histPricesMap.set(symbol, bars.map(r => ({ date: r.trade_date, close: Number(r.close_adjusted) }))));
      }
      const rawHist = await dbAll(db, `
        SELECT symbol, date, close_price 
        FROM HistoricalPrices 
        WHERE close_price > 0 
        ORDER BY symbol, date ASC
      `).catch(() => []);

      for (const row of rawHist) {
        const sym = String(row.symbol || '').toUpperCase().trim();
        if (histPricesMap.has(sym) || histPricesMap.has(sym.replace(/\.(NS|BO)$/, ''))) continue;
        if (!histPricesMap.has(sym)) histPricesMap.set(sym, []);
        histPricesMap.get(sym)!.push({ date: row.date, close: Number(row.close_price) });
      }

      // Compute Nifty 50 benchmark daily returns
      const niftyPrices = histPricesMap.get('^NSEI') || histPricesMap.get('NIFTY50.NS') || histPricesMap.get('NIFTY 50') || [];
      for (let i = 1; i < niftyPrices.length; i++) {
        const prev = niftyPrices[i - 1].close;
        const cur = niftyPrices[i].close;
        if (prev > 0) {
          niftyDailyReturns.set(niftyPrices[i].date, (cur - prev) / prev);
        }
      }
    } catch (e) {
      console.warn('[RiskAnalyticsEngine] Failed to load historical prices:', e);
    }

    // Weighted aggregates
    let weightedBeta = 0;
    let weightedVol = 0;
    let weightedSharpe = 0;
    let weightedSortino = 0;
    let totalVar95Daily = 0;

    const assetRiskBreakdown: AssetRiskMetric[] = holdings.map((h: any) => {
      const val = Number(h.current_value || h.total_cost || 0);
      const weight = (val / totalAUM) * 100;
      const isUs = h.currency === 'USD' || h.portfolio === 'US - IBKR';
      const isSME = (h.portfolio || '').toLowerCase().includes('maa') || val < 10000000;

      // Default proxy values
      let volAnnual = isSME ? 32.5 : isUs ? 18.2 : 22.4;
      let beta = isUs ? 0.35 : isSME ? 1.35 : 1.05;

      // Actual statistical calculation from historical prices if >= 20 daily points available
      const cleanSym = String(h.symbol || '').toUpperCase().trim();
      const priceSeries = histPricesMap.get(cleanSym) || histPricesMap.get(`${cleanSym}.NS`) || histPricesMap.get(`${cleanSym}.BO`) || [];

      if (priceSeries.length >= 20) {
        const assetDailyReturns: Array<{ date: string; ret: number }> = [];
        for (let i = 1; i < priceSeries.length; i++) {
          const pPrev = priceSeries[i - 1].close;
          const pCur = priceSeries[i].close;
          if (pPrev > 0) {
            assetDailyReturns.push({ date: priceSeries[i].date, ret: (pCur - pPrev) / pPrev });
          }
        }

        if (assetDailyReturns.length >= 19) {
          const meanRet = assetDailyReturns.reduce((sum, r) => sum + r.ret, 0) / assetDailyReturns.length;
          const variance = assetDailyReturns.reduce((sum, r) => sum + Math.pow(r.ret - meanRet, 2), 0) / (assetDailyReturns.length - 1);
          const dailyStdDev = Math.sqrt(variance);
          const computedVol = dailyStdDev * Math.sqrt(252) * 100;

          if (computedVol > 1 && computedVol < 200) {
            volAnnual = Number(computedVol.toFixed(2));
          }

          // Compute Beta vs Nifty 50 if overlapping dates exist
          if (niftyDailyReturns.size > 0) {
            let covSum = 0;
            let niftyVarSum = 0;
            let count = 0;

            const pairedNiftyMean = (() => {
              let sum = 0, c = 0;
              for (const r of assetDailyReturns) {
                if (niftyDailyReturns.has(r.date)) {
                  sum += niftyDailyReturns.get(r.date)!;
                  c++;
                }
              }
              return c > 0 ? sum / c : 0;
            })();

            for (const r of assetDailyReturns) {
              if (niftyDailyReturns.has(r.date)) {
                const nRet = niftyDailyReturns.get(r.date)!;
                covSum += (r.ret - meanRet) * (nRet - pairedNiftyMean);
                niftyVarSum += Math.pow(nRet - pairedNiftyMean, 2);
                count++;
              }
            }

            if (count >= 15 && niftyVarSum > 0) {
              const computedBeta = covSum / niftyVarSum;
              if (computedBeta > -2 && computedBeta < 5) {
                beta = Number(computedBeta.toFixed(2));
              }
            }
          }
        }
      }
      
      const unrlzPct = h.total_cost > 0 ? ((val - h.total_cost) / h.total_cost) * 100 : 15;
      const annualizedReturn = Math.max(-20, Math.min(80, unrlzPct * 1.2));
      const rf = isUs ? 4.35 : 6.85;

      const sharpe = Number(((annualizedReturn - rf) / Math.max(1, volAnnual)).toFixed(2));
      const sortino = Number((sharpe * 1.45).toFixed(2));
      const dailyVar = Number((val * (volAnnual / Math.sqrt(252) * 1.645) / 100).toFixed(0));
      const maxDd = Number(Math.min(90, Math.max(5, volAnnual * 0.85)).toFixed(2));

      weightedBeta += (beta * (weight / 100));
      weightedVol += (volAnnual * (weight / 100));
      weightedSharpe += (sharpe * (weight / 100));
      weightedSortino += (sortino * (weight / 100));
      totalVar95Daily += dailyVar;

      return {
        symbol: h.symbol,
        portfolio: h.portfolio,
        currentValue: val,
        weightPct: Number(weight.toFixed(2)),
        volatilityAnnualPct: volAnnual,
        betaNifty: beta,
        sharpeRatio: sharpe,
        sortinoRatio: sortino,
        var95DailyINR: dailyVar,
        maxDrawdownPct: maxDd
      };
    }).sort((a, b) => b.currentValue - a.currentValue);

    // Top 5 Concentration
    const top5Concentration = assetRiskBreakdown.slice(0, 5).reduce((acc, curr) => acc + curr.weightPct, 0);

    // Monthly VaR = Daily VaR * sqrt(21)
    const var95Monthly = Number((totalVar95Daily * Math.sqrt(21)).toFixed(0));
    const cvar95Monthly = Number((var95Monthly * 1.25).toFixed(0));

    // Stress Testing Scenarios
    const usExposure = assetRiskBreakdown.filter(a => a.portfolio === 'US - IBKR').reduce((acc, curr) => acc + curr.currentValue, 0);
    const inrEquityExposure = totalAUM - usExposure;

    const stressScenarios: StressScenario[] = [
      {
        id: 'NIFTY_CORRECTION_10',
        name: 'Broad Market Drop (-10% Nifty Correction)',
        description: 'Simulates a 10% benchmark drawdown on Indian domestic equities based on portfolio beta.',
        portfolioImpactINR: Number((inrEquityExposure * 0.10 * weightedBeta * -1).toFixed(0)),
        portfolioImpactPct: Number((-10 * weightedBeta * (inrEquityExposure / totalAUM)).toFixed(2)),
        severity: 'MEDIUM'
      },
      {
        id: 'NASDAQ_SELLOFF_15',
        name: 'US Tech Sector Selloff (-15% Nasdaq Drop)',
        description: 'Simulates a 15% drawdown in US Growth & Tech ETFs (VGT, QQQ, SCHG, VOO).',
        portfolioImpactINR: Number((usExposure * 0.15 * -1).toFixed(0)),
        portfolioImpactPct: Number((-15 * (usExposure / totalAUM)).toFixed(2)),
        severity: 'HIGH'
      },
      {
        id: 'USD_INR_DEPRECIATION',
        name: 'Rupee Depreciation (-3% USD/INR move to ₹98.6)',
        description: 'Foreign exchange tailwind benefiting USD-denominated assets in US - IBKR.',
        portfolioImpactINR: Number((usExposure * 0.03).toFixed(0)),
        portfolioImpactPct: Number((3 * (usExposure / totalAUM)).toFixed(2)),
        severity: 'LOW'
      },
      {
        id: 'GLOBAL_STAGFLATION_CRASH',
        name: 'Global Stagflation Tail Risk (-20% Equities + High Rates)',
        description: 'Simultaneous 20% drawdown across domestic and international equity holdings.',
        portfolioImpactINR: Number((totalAUM * -0.20).toFixed(0)),
        portfolioImpactPct: -20.0,
        severity: 'CRITICAL'
      }
    ];

    return {
      portfolioAUM: totalAUM,
      portfolioVolatilityPct: Number(weightedVol.toFixed(2)),
      portfolioBetaNifty: Number(weightedBeta.toFixed(2)),
      portfolioBetaSp500: Number((weightedBeta * 0.75).toFixed(2)),
      sharpeRatio: Number(weightedSharpe.toFixed(2)),
      sortinoRatio: Number(weightedSortino.toFixed(2)),
      var95DailyINR: totalVar95Daily,
      var95MonthlyINR: var95Monthly,
      cvar95MonthlyINR: cvar95Monthly,
      maxDrawdownPct: Number((weightedVol * 0.85).toFixed(2)),
      top5ConcentrationPct: Number(top5Concentration.toFixed(2)),
      stressScenarios,
      assetRiskBreakdown
    };
  }
}
