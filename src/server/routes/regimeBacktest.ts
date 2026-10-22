/**
 * regimeBacktest.ts
 *
 * Express REST API Router for Full-Universe Dynamic Regime Multi-Period Backtesting.
 * Supports multi-strategy selection, dynamic universe sizing, and per-strategy exports.
 */

import { Router, Request, Response } from 'express';
import { getDB, dbAll } from '../database.js';
import { RegimeBacktestEngine, STRATEGIES, REGIMES } from '../services/RegimeBacktestEngine.js';

export const regimeBacktestRouter = Router();

// GET /api/v1/regime-backtest/universe-count
regimeBacktestRouter.get('/universe-count', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const engine = RegimeBacktestEngine.getInstance();
    const count = await engine.getUniverseCount(db);

    res.json({
      success: true,
      count,
      message: `Current full universe contains ${count} distinct symbols`
    });
  } catch (error: any) {
    console.error('[RegimeBacktestRouter] Universe count error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/regime-backtest/summary
regimeBacktestRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const engine = RegimeBacktestEngine.getInstance();
    let summaries = await engine.getSummariesFromDb(db);

    // If DB is empty, run initial backtest
    if (!summaries || summaries.length === 0) {
      const result = await engine.executeCompleteBacktest(db);
      summaries = result.summaries;
    }

    res.json({
      success: true,
      count: summaries.length,
      data: summaries
    });
  } catch (error: any) {
    console.error('[RegimeBacktestRouter] Summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/regime-backtest/trades
regimeBacktestRouter.get('/trades', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const engine = RegimeBacktestEngine.getInstance();
    const { regime, strategyId, symbol } = req.query;

    const trades = await engine.getTradesFromDb(db, {
      regime: regime ? String(regime) : undefined,
      strategyId: strategyId ? String(strategyId) : undefined,
      symbol: symbol ? String(symbol) : undefined
    });

    res.json({
      success: true,
      count: trades.length,
      data: trades
    });
  } catch (error: any) {
    console.error('[RegimeBacktestRouter] Trades error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/regime-backtest/ledger
regimeBacktestRouter.get('/ledger', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const engine = RegimeBacktestEngine.getInstance();
    const { regimeId, symbol, minAgreement, limit, offset } = req.query;

    let rows = await engine.getFullMatrixRows(db, {
      regimeId: regimeId ? String(regimeId) : undefined,
      symbol: symbol ? String(symbol) : undefined,
      minAgreement: minAgreement ? Number(minAgreement) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    });

    // If table is empty, auto-generate the full universe matrix
    if (!rows || rows.length === 0) {
      const universeCount = await engine.getUniverseCount(db);
      console.log(`[RegimeBacktestRouter] Ledger empty, executing full universe matrix backtest (${universeCount} scrips × ${REGIMES.length} regimes)...`);
      await engine.executeFullMatrixBacktest(db);
      rows = await engine.getFullMatrixRows(db, {
        regimeId: regimeId ? String(regimeId) : undefined,
        symbol: symbol ? String(symbol) : undefined,
        minAgreement: minAgreement ? Number(minAgreement) : undefined,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined
      });
    }

    res.json({
      success: true,
      totalRows: rows.length,
      data: rows
    });
  } catch (error: any) {
    console.error('[RegimeBacktestRouter] Ledger error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/regime-backtest/run
regimeBacktestRouter.post('/run', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const engine = RegimeBacktestEngine.getInstance();
    const { strategyIds, regimes, universeLimit } = req.body;

    const universeCount = universeLimit || (await engine.getUniverseCount(db));
    const idAliasMap: Record<string, string> = {
      'S1': 'S1_VPA_BASE_BREAKOUT',
      'S2': 'S2_INSTITUTIONAL_FVG_CE',
      'S3': 'S3_HH_HL_COMPACTION',
      'S4': 'S4_HH_HL_SMA200_VPA',
      'S5': 'S5_50EMA_PULLBACK_VCP',
      'S6': 'S6_RS_BREAKOUT',
      'S7': 'S7_RSI_MEAN_REVERSION',
      'S8': 'S8_HIGH_TIGHT_FLAG',
      'S9': 'S9_VOLUME_DRYUP_RS',
      'S10': 'S10_TRENDLINE_ORB',
    };
    const selectedStrategies = strategyIds
      ? strategyIds.map((id: string) => idAliasMap[id] || id)
      : STRATEGIES.map(s => s.id);
    const selectedRegimes = regimes || REGIMES.map(r => r.id);

    const [compResult, fullMatrixResult] = await Promise.all([
      engine.executeCompleteBacktest(db, { strategyIds: selectedStrategies, universeLimit }),
      engine.executeFullMatrixBacktest(db, { strategyIds: selectedStrategies, regimes: selectedRegimes, universeLimit })
    ]);

    res.json({
      success: true,
      message: `Full Universe Multi-Regime Matrix completed! Generated ${fullMatrixResult.totalRows} matrix rows (${universeCount} scrips x ${selectedRegimes.length} regimes x ${selectedStrategies.length} strategies) and ${compResult.summaries.length} summaries.`,
      universeCount,
      matrixRowsCount: fullMatrixResult.totalRows,
      summariesCount: compResult.summaries.length,
      tradesCount: compResult.trades.length,
      strategiesCount: selectedStrategies.length,
      regimesCount: selectedRegimes.length
    });
  } catch (error: any) {
    console.error('[RegimeBacktestRouter] Run error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/regime-backtest/export-csv
regimeBacktestRouter.get('/export-csv', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const engine = RegimeBacktestEngine.getInstance();

    // Check if full matrix table is populated
    let rows = await engine.getFullMatrixRows(db, { limit: 10 });
    if (!rows || rows.length === 0) {
      await engine.executeFullMatrixBacktest(db);
    }

    const universeCount = await engine.getUniverseCount(db);
    const csv = await engine.exportFullMatrixCsv(db);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Full_Universe_${universeCount}Scrips_${REGIMES.length}Regimes_Matrix_Ledger.csv"`);
    res.send(csv);
  } catch (error: any) {
    console.error('[RegimeBacktestRouter] CSV error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/regime-backtest/export-csv/:strategyId
regimeBacktestRouter.get('/export-csv/:strategyId', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const { strategyId } = req.params;

    // Validate strategyId
    const validStrategy = STRATEGIES.find(s => s.id === strategyId);
    if (!validStrategy) {
      return res.status(400).json({ success: false, error: `Invalid strategy ID: ${strategyId}` });
    }

    // Get all trades for this strategy
    const engine = RegimeBacktestEngine.getInstance();
    const trades = await engine.getTradesFromDb(db, { strategyId });

    let csv = [
      'Symbol',
      'CompanyName',
      'Tier',
      'Regime',
      'StrategyID',
      'StrategyName',
      'SignalDate',
      'InitialEntryDate',
      'InitialEntryPrice',
      'StopLoss',
      'TargetPrice',
      'FinalExitDate',
      'FinalExitPrice',
      'TradeStatus',
      'GrossReturnPct',
      'NetReturnPct',
      'HoldingDays',
      'MFEPct',
      'MAEPct',
      'ReEntriesCount',
      'RulesSummary'
    ].join(',') + '\n';

    const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    for (const t of trades) {
      csv += [
        t.symbol,
        escape(t.companyName),
        t.tier,
        t.regime,
        t.strategyId,
        t.strategyName,
        t.signalDate,
        t.initialEntryDate,
        t.initialEntryPrice,
        t.stopLoss,
        t.targetPrice,
        t.finalExitDate,
        t.finalExitPrice,
        t.tradeStatus,
        t.grossReturnPct,
        t.netReturnPct,
        t.holdingDays,
        t.mfePct,
        t.maePct,
        t.reEntriesCount,
        escape(t.rulesPassedSummary)
      ].join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${strategyId}_Trades.csv"`);
    res.send(csv);
  } catch (error: any) {
    console.error('[RegimeBacktestRouter] Strategy export CSV error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/regime-backtest/export-trades-csv
regimeBacktestRouter.get('/export-trades-csv', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const engine = RegimeBacktestEngine.getInstance();
    const { strategyIds, regimeId } = req.query;

    // Parse strategyIds from query string
    let selectedStrategies = STRATEGIES.map(s => s.id);
    if (strategyIds && typeof strategyIds === 'string') {
      selectedStrategies = strategyIds.split(',').filter(id => STRATEGIES.find(s => s.id === id));
    }

    // Get all trades matching filters
    let allTrades: any[] = [];
    for (const stratId of selectedStrategies) {
      const trades = await engine.getTradesFromDb(db, {
        strategyId: stratId,
        regime: regimeId ? String(regimeId) : undefined
      });
      allTrades = allTrades.concat(trades);
    }

    let csv = [
      'Symbol',
      'CompanyName',
      'Tier',
      'Regime',
      'StrategyID',
      'StrategyName',
      'SignalDate',
      'InitialEntryDate',
      'InitialEntryPrice',
      'StopLoss',
      'TargetPrice',
      'FinalExitDate',
      'FinalExitPrice',
      'TradeStatus',
      'GrossReturnPct',
      'NetReturnPct',
      'HoldingDays',
      'MFEPct',
      'MAEPct',
      'ReEntriesCount',
      'RulesSummary'
    ].join(',') + '\n';

    const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    for (const t of allTrades) {
      csv += [
        t.symbol,
        escape(t.companyName),
        t.tier,
        t.regime,
        t.strategyId,
        t.strategyName,
        t.signalDate,
        t.initialEntryDate,
        t.initialEntryPrice,
        t.stopLoss,
        t.targetPrice,
        t.finalExitDate,
        t.finalExitPrice,
        t.tradeStatus,
        t.grossReturnPct,
        t.netReturnPct,
        t.holdingDays,
        t.mfePct,
        t.maePct,
        t.reEntriesCount,
        escape(t.rulesPassedSummary)
      ].join(',') + '\n';
    }

    const filename = regimeId
      ? `Multi_Strategy_Trades_${regimeId}.csv`
      : 'Multi_Strategy_Trades_AllRegimes.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error: any) {
    console.error('[RegimeBacktestRouter] Multi-strategy trades export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
