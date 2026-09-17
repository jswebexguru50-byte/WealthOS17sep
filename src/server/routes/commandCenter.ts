import { Router } from 'express';
import { getDB, dbAll, dbGet, dbRun } from '../database.js';
import { BankAndFDService } from '../services/BankAndFDService.js';
import { UnifiedValuationService } from '../services/UnifiedValuationService.js';

const router = Router();

// GET /api/command-center — Family Office Intelligence Command Center Aggregation
router.get('/', async (req, res) => {
  try {
    const db = getDB();

    // Determine target member: strictly default to 1 (Gopal) so Brother's portfolios never mix with Gopal's
    const memberIdRaw = req.query.member_id || req.headers['x-member-id'];
    const valuation = await UnifiedValuationService.getInstance().getUnifiedValuation(db, memberIdRaw);

    const memberId = valuation.memberId;
    const allowedPortNames = valuation.allowedPortfolios;
    const holdings = valuation.holdings;
    const totalBankAndFdVal = valuation.totalBankAndFdValINR;
    const pmsCashInHand = valuation.pmsCashInHand;
    const unallocatedPmsCash = valuation.unallocatedPmsCash;
    const pmsBaselineCost = valuation.pmsBaselineCost;
    const totalNetWorthINR = valuation.totalNetWorthINR;
    const totalPortfolioValINR = valuation.totalPortfolioValINR;
    const totalCostBasisINR = valuation.totalCostBasisINR;
    const totalTaxCostBasisINR = valuation.totalTaxCostBasisINR;
    const totalDayChangeINR = valuation.totalDayChangeINR;
    const totalDayChangePct = valuation.totalDayChangePct;
    const totalUnrealizedGainINR = valuation.totalUnrealizedGainINR;
    const totalUnrealizedGainPct = valuation.totalUnrealizedGainPct;

    // 1. Fetch Currency conversion rates to INR using BankAndFDService
    const fxRates = await BankAndFDService.getInstance().getCurrencyRates();
    const usdRate = fxRates.USD || 84.0;

    // 2. Fetch Bank Accounts & FDs count
    let bankFdsCount = 0;
    if (memberId === 1 || memberId === 'all') {
      const bankFds = await BankAndFDService.getInstance().getAllBankAndFDs();
      bankFdsCount = bankFds.length;
    }

    // 4. Breakdown Collections
    const assetClassBreakdown: Record<string, { value: number; cost: number; count: number }> = {
      'Indian Direct Equity': { value: 0, cost: 0, count: 0 },
      'PMS & Institutional': { value: 0, cost: 0, count: 0 },
      'Mutual Funds': { value: 0, cost: 0, count: 0 },
      'AIF (Smart Horizon)': { value: 0, cost: 0, count: 0 },
      'Unlisted Securities': { value: 0, cost: 0, count: 0 },
      'US Equities & ETFs': { value: 0, cost: 0, count: 0 },
      'Cash & Fixed Deposits': { value: totalBankAndFdVal, cost: totalBankAndFdVal, count: bankFdsCount }
    };

    const portfolioBreakdown: Record<string, { value: number; cost: number; dayChange: number; holdingsCount: number }> = {};
    const stockMap: Record<string, { symbol: string; value: number; cost: number; dayChange: number; dayChangePct: number; portfolios: string[] }> = {};

    holdings.forEach((h: any) => {
      const curVal = Number(h.current_value || (h.quantity * (h.ltp || h.avg_buy_price)) || 0);
      const isUsAsset = h.currency === 'USD' || h.portfolio === 'US - IBKR' || h.portfolio === 'Sarwa';
      const rawCost = Number(h.total_cost || (h.quantity * h.avg_buy_price) || 0);
      const costVal = isUsAsset && rawCost < 1000000 ? (rawCost * usdRate) : rawCost;
      const rawTaxCost = Number(h.tax_cost_basis || rawCost);
      const taxCost = isUsAsset && rawTaxCost < 1000000 ? (rawTaxCost * usdRate) : rawTaxCost;
      const dayChg = Number(h.day_change || 0);
      const prevVal = curVal - dayChg;


      // Asset Class Category
      let cat = 'Indian Direct Equity';
      const pName = (h.portfolio || '').toLowerCase();
      const symUpper = (h.symbol || '').toUpperCase();
      const isinUpper = (h.isin || '').toUpperCase();
      const hType = (h.holding_type || '').toUpperCase();

      if (hType === 'CASH' || symUpper === 'CASH' || isinUpper.startsWith('CASH')) {
        cat = 'Cash & Fixed Deposits';
      } else if (['VOO', 'QQQ', 'SCHG', 'SPY', 'IVV', 'VTI'].includes(symUpper) || h.currency === 'USD' || pName.includes('ibkr') || pName.includes('us') || pName.includes('sarwa')) {
        cat = 'US Equities & ETFs';
      } else if (symUpper.includes('SONU') || symUpper === 'SONUINFRA') {
        cat = 'Indian Direct Equity';
      } else if (hType === 'AIF' || symUpper.includes('SMART') || symUpper.includes('HORIZON') || isinUpper.includes('HORIZON')) {
        cat = 'AIF (Smart Horizon)';
      } else if (hType === 'UNLISTED' || pName.includes('unlisted') || symUpper.startsWith('UL') || symUpper.includes('UNLISTED') || isinUpper.startsWith('CUSTOM_')) {
        cat = 'Unlisted Securities';
      } else if (hType === 'MUTUAL_FUND' || pName.includes('mf') || pName.includes('mutual fund') || h.portfolio_type === 'MF' || isinUpper.startsWith('INF')) {
        cat = 'Mutual Funds';
      } else if (pName.includes('cc9') || pName.includes('complete circle') || pName.includes('iifl') || h.portfolio_type === 'PMS') {
        cat = 'PMS & Institutional';
      }

      assetClassBreakdown[cat].value += curVal;
      assetClassBreakdown[cat].cost += costVal;
      assetClassBreakdown[cat].count += 1;

      // Portfolio aggregation
      if (!portfolioBreakdown[h.portfolio]) {
        portfolioBreakdown[h.portfolio] = { value: 0, cost: 0, dayChange: 0, holdingsCount: 0 };
      }
      portfolioBreakdown[h.portfolio].value += curVal;
      portfolioBreakdown[h.portfolio].cost += costVal;
      portfolioBreakdown[h.portfolio].dayChange += dayChg;
      portfolioBreakdown[h.portfolio].holdingsCount += 1;

      // Stock Consolidation across family
      const sym = h.symbol;
      if (!stockMap[sym]) {
        stockMap[sym] = { symbol: sym, value: 0, cost: 0, dayChange: 0, dayChangePct: 0, portfolios: [] };
      }
      stockMap[sym].value += curVal;
      stockMap[sym].cost += costVal;
      stockMap[sym].dayChange += dayChg;
    });

    // If cc9 has verified baseline injected capital, align portfolio cost with dashboard
    if (portfolioBreakdown['cc9'] && pmsBaselineCost > 0) {
      const pmsDiff = pmsBaselineCost - portfolioBreakdown['cc9'].cost;
      portfolioBreakdown['cc9'].cost = pmsBaselineCost;
      if (assetClassBreakdown['PMS & Institutional']) {
        assetClassBreakdown['PMS & Institutional'].cost += pmsDiff;
      }
    }


    // Top Movers
    const allConsolidatedStocks = Object.values(stockMap).map(s => ({
      ...s,
      dayChangePct: s.value - s.dayChange > 0 ? (s.dayChange / (s.value - s.dayChange)) * 100 : 0
    }));

    const topGainers = [...allConsolidatedStocks]
      .filter(s => s.dayChange > 0)
      .sort((a, b) => b.dayChange - a.dayChange)
      .slice(0, 5);

    const topLosers = [...allConsolidatedStocks]
      .filter(s => s.dayChange < 0)
      .sort((a, b) => a.dayChange - b.dayChange)
      .slice(0, 5);

    // Top 10 Concentration Risk Calculation
    const sortedByVal = [...allConsolidatedStocks].sort((a, b) => b.value - a.value);
    const top10Val = sortedByVal.slice(0, 10).reduce((acc, cur) => acc + cur.value, 0);
    const top10ConcentrationPct = totalNetWorthINR > 0 ? (top10Val / totalNetWorthINR) * 100 : 0;

    // Health Score Algorithm
    // Score factors:
    // 1. Concentration (Lower top10 % -> Higher score, target < 50%)
    const concentrationScore = Math.max(0, Math.min(100, 100 - (top10ConcentrationPct - 30) * 2));
    // 2. Diversification across asset classes (Target: at least 4 active asset classes)
    const activeAssetClasses = Object.values(assetClassBreakdown).filter(a => a.value > 0).length;
    const assetClassScore = Math.min(100, activeAssetClasses * 20);
    // 3. Liquidity Score (Direct Equity + MFs + Cash vs Unlisted)
    const usVal = assetClassBreakdown['US Equities & ETFs'] ? assetClassBreakdown['US Equities & ETFs'].value : 0;
    const liquidVal = (assetClassBreakdown['Indian Direct Equity'].value + assetClassBreakdown['Mutual Funds'].value + assetClassBreakdown['Cash & Fixed Deposits'].value + usVal);
    const liquidityPct = totalNetWorthINR > 0 ? (liquidVal / totalNetWorthINR) * 100 : 100;
    const liquidityScore = Math.min(100, liquidityPct);

    const compositeHealthScore = Math.round((concentrationScore * 0.4) + (assetClassScore * 0.3) + (liquidityScore * 0.3));

    // 5. Fetch Latest Recorded XIRR for each Portfolio from PortfolioHistory
    const xirrRows = await dbAll(db, `
      SELECT p1.portfolio, p1.xirr 
      FROM PortfolioHistory p1
      INNER JOIN (
        SELECT portfolio, MAX(date) as max_date
        FROM PortfolioHistory
        WHERE xirr IS NOT NULL AND xirr != 0
        GROUP BY portfolio
      ) p2 ON p1.portfolio = p2.portfolio AND p1.date = p2.max_date
    `).catch(() => []);

    const xirrMap: Record<string, number> = {};
    xirrRows.forEach((r: any) => {
      if (r.portfolio && r.xirr !== null && !isNaN(r.xirr)) {
        xirrMap[r.portfolio.toLowerCase().trim()] = Math.round(r.xirr * 100) / 100;
      }
    });

    // 6. Calculate PMS Injected Capital & Cash adjustments for PMS portfolios
    const pmsTxns = await dbAll(db, `
      SELECT portfolio, type, net_amount, quantity, price, is_cash_flow, is_ca 
      FROM Transactions 
      WHERE (LOWER(portfolio) LIKE '%pms%' OR LOWER(portfolio) LIKE '%cc9%' OR LOWER(portfolio) LIKE '%iifl%')
    `).catch(() => []);

    const pmsCashMap: Record<string, number> = {};
    const pmsCapMap: Record<string, number> = {};

    pmsTxns.forEach((tx: any) => {
      const p = tx.portfolio;
      const type = String(tx.type || '').toUpperCase();
      const amt = Math.abs(tx.net_amount || (tx.quantity * tx.price) || 0);
      const isCashFlow = (tx.is_cash_flow ?? 1) === 1;
      const isCa = (tx.is_ca || 0) === 1;

      if (!pmsCashMap[p]) pmsCashMap[p] = 0;
      if (!pmsCapMap[p]) pmsCapMap[p] = 0;

      if (!isCa && isCashFlow) {
        if (type === 'DEPOSIT' || type === 'TRANSFER IN' || type === 'SECURITY IN') {
          pmsCapMap[p] += amt;
        } else if (type === 'WITHDRAWAL' || type === 'TRANSFER OUT' || type === 'SECURITY OUT') {
          pmsCapMap[p] -= amt;
        }
      }

      if (type === 'DEPOSIT') pmsCashMap[p] += amt;
      else if (type === 'WITHDRAWAL') pmsCashMap[p] -= amt;
      else if (type === 'BUY' || type.includes('PURCHASE')) pmsCashMap[p] -= amt;
      else if (type === 'SELL' || type.includes('SALE') || type === 'BUYBACK') pmsCashMap[p] += amt;
      else if (type === 'EXPENSE' || type === 'TAX' || type.includes('FEE') || type === 'TDS' || type.includes('CUSTODY') || type.includes('CHARGE')) pmsCashMap[p] -= amt;
    });      
    Object.keys(pmsCapMap).forEach(p => {
      if (portfolioBreakdown[p]) {
        if (p === 'cc9' && pmsBaselineCost > 0) {
          portfolioBreakdown[p].cost = pmsBaselineCost;
        } else if (pmsCapMap[p] > 0) {
          portfolioBreakdown[p].cost = pmsCapMap[p];
        }
      }
    });

    // 7. Process Closed / Fully Liquidated Portfolios
    const closedPortfoliosList = ['IIFL360', 'Maa HDFC Sky', 'DBFS', 'Self HDFC Securities', 'Self Mutual Fund'];
    const closedPortfoliosData: any[] = [];

    for (const cp of closedPortfoliosList) {
      const pKey = cp.toLowerCase().trim();
      const ltdXirr = xirrMap[pKey] !== undefined ? xirrMap[pKey] : (cp === 'IIFL360' ? 21.10 : null);
      
      const realStats = await dbAll(db, `
        SELECT 
          ROUND(SUM(buy_cost), 2) as cost, 
          ROUND(SUM(sell_proceeds), 2) as sales, 
          ROUND(SUM(realized_pnl), 2) as pnl,
          MIN(buy_date) as start_date,
          MAX(sell_date) as end_date
        FROM RealizedGains 
        WHERE portfolio = ?
      `, [cp]).catch(() => []);

      const stat = realStats[0] || {};
      const cost = Number(stat.cost) || (cp === 'IIFL360' ? 4000000 : 0);
      const sales = Number(stat.sales) || (cp === 'IIFL360' ? 10340953.69 : 0);
      const pnl = Number(stat.pnl) || (sales - cost);
      const roiPct = cost > 0 ? Math.round(((sales - cost) / cost) * 10000) / 100 : 0;

      closedPortfoliosData.push({
        name: cp,
        status: 'CLOSED',
        value: 0,
        cost,
        realizedProceeds: sales,
        realizedGain: pnl,
        gainPct: roiPct,
        ltdXirr: ltdXirr !== null ? ltdXirr : 0,
        startDate: stat.start_date || '2019-06-25',
        endDate: stat.end_date || '2024-08-30'
      });
    }

    // 5. Valuation Integrity & Drift Status
    let valuationIntegrity = {
      isStable: true,
      lastAuditTimestamp: new Date().toISOString(),
      driftAlerts: [] as string[],
      recentSnapshotsCount: 0
    };
    try {
      let recentDrifts: any[] = [];
      if (allowedPortNames.length > 0) {
        const placeholders = allowedPortNames.map(() => '?').join(',');
        recentDrifts = await dbAll(db, `
          SELECT vs.portfolio, vs.drift_pct, vs.drift_alert, vs.trigger_source, vs.created_at 
          FROM ValuationSnapshots vs
          INNER JOIN (
            SELECT portfolio, MAX(id) as max_id
            FROM ValuationSnapshots
            WHERE portfolio IN (${placeholders})
            GROUP BY portfolio
          ) latest ON vs.id = latest.max_id
          WHERE vs.drift_alert IS NOT NULL AND vs.drift_alert != ''
          ORDER BY vs.id DESC
        `, allowedPortNames);
      }
      const totalSnaps = await dbGet(db, "SELECT COUNT(*) as count, MAX(created_at) as last_ts FROM ValuationSnapshots");

      if (recentDrifts && recentDrifts.length > 0) {
        valuationIntegrity.driftAlerts = recentDrifts.map((d: any) => `${d.portfolio}: ${d.drift_alert} (${d.trigger_source} on ${d.created_at})`);
        valuationIntegrity.isStable = recentDrifts.length === 0;
      }
      if (totalSnaps?.last_ts) {
        valuationIntegrity.lastAuditTimestamp = totalSnaps.last_ts;
      }
      valuationIntegrity.recentSnapshotsCount = totalSnaps?.count || 0;
    } catch (e) {
      console.warn("Could not query ValuationSnapshots:", e);
    }

    res.json({
      success: true,
      summary: {
        totalNetWorthINR,
        totalPortfolioValINR,
        totalBankAndFdVal,
        totalCostBasisINR,
        totalTaxCostBasisINR,
        totalUnrealizedGainINR,
        totalUnrealizedGainPct,
        totalDayChangeINR,
        totalDayChangePct,
        usdRate,
        holdingsCount: holdings.length,
        portfoliosCount: Object.keys(portfolioBreakdown).length,
        bankAccountsCount: bankFdsCount,
        compositeHealthScore,
        top10ConcentrationPct
      },
      valuationIntegrity,
      assetClassBreakdown: Object.entries(assetClassBreakdown).map(([name, data]) => ({
        name,
        value: data.value,
        cost: data.cost,
        count: data.count,
        allocationPct: totalNetWorthINR > 0 ? (data.value / totalNetWorthINR) * 100 : 0
      })),
      portfolioBreakdown: Object.entries(portfolioBreakdown).map(([name, data]) => {
        const gain = data.value - data.cost;
        const gainPct = data.cost > 0 ? (gain / data.cost) * 100 : 0;
        const pKey = name.toLowerCase().trim();
        const ltdXirr = xirrMap[pKey] !== undefined ? xirrMap[pKey] : null;

        return {
          name,
          value: data.value,
          cost: data.cost,
          gain: Math.round(gain * 100) / 100,
          gainPct: Math.round(gainPct * 100) / 100,
          ltdXirr,
          dayChange: data.dayChange,
          holdingsCount: data.holdingsCount,
          allocationPct: totalNetWorthINR > 0 ? (data.value / totalNetWorthINR) * 100 : 0
        };
      }).sort((a, b) => b.value - a.value),
      closedPortfolios: closedPortfoliosData,
      topMovers: {
        gainers: topGainers,
        losers: topLosers
      },
      topHoldings: sortedByVal.slice(0, 10).map(h => ({
        symbol: h.symbol,
        value: h.value,
        cost: h.cost,
        portfolios: h.portfolios,
        weightPct: totalNetWorthINR > 0 ? (h.value / totalNetWorthINR) * 100 : 0
      }))
    });
  } catch (err: any) {
    console.error("Command Center API Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Acknowledge and dismiss historical valuation drift alerts
router.post('/dismiss-drift', async (req, res) => {
  try {
    const { portfolios } = req.body;
    const db = getDB();
    if (portfolios && Array.isArray(portfolios) && portfolios.length > 0) {
      const placeholders = portfolios.map(() => '?').join(',');
      await dbRun(db, `UPDATE ValuationSnapshots SET drift_alert = NULL WHERE portfolio IN (${placeholders})`, portfolios);
    } else {
      await dbRun(db, `UPDATE ValuationSnapshots SET drift_alert = NULL`);
    }
    res.json({ success: true, message: 'Valuation drift notice dismissed.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
