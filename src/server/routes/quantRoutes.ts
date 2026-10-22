import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  classifyMacroRegimeV5,
  calculatePositionSizeV5,
  calculateEPVValuationV5,
  evaluateOrderBookImbalanceV5,
  evaluateEpisodicPivotS12,
  calculateLimitPullbackEntryV6,
  evaluateDisplacementQualityScoreV6,
  evaluateS13EarningsAccelerationV6,
} from '../quantEngine.js';
import { AlertEngine } from '../services/AlertEngine.js';
import { ResearchExperienceAgent } from '../services/ResearchExperienceAgent.js';
import { NEoWaveEngine } from '../quant/NEoWaveEngine.js';
import { getDB, dbRun, dbAll } from '../database.js';
import { randomBytes } from 'crypto';

export const quantRouter = Router();

// 1. Get Current Macro Regime & Strategy Activation Status
quantRouter.get('/macro-regime', (req: Request, res: Response) => {
  try {
    const defaultMetrics = {
      nifty50: 24500,
      nifty50Ema50: 24200,
      nifty50Sma200: 23100,
      breadthAbove200SmaPct: 68.5,
      advanceDeclineRatio: 1.35,
      indiaVix: 14.8,
      vixTermStructure: 'CONTANGO' as const,
      fiiNetFlow10DayCr: 8400,
      us10YRealYieldPct: 1.85,
      macroLiquidityIndex: 0,
    };

    const regimeState = classifyMacroRegimeV5(defaultMetrics);
    res.json({ success: true, regimeState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Calculate Fractional Kelly & ATR Risk Parity Position Size
quantRouter.post('/position-size', (req: Request, res: Response) => {
  try {
    const input = req.body;
    const sizeResult = calculatePositionSizeV5(input);
    res.json({ success: true, sizing: sizeResult });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. EPV vs DCF Intrinsic Valuation Endpoint
quantRouter.post('/valuation-epv', (req: Request, res: Response) => {
  try {
    const input = req.body;
    const valuationResult = calculateEPVValuationV5(input);
    res.json({ success: true, valuation: valuationResult });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Microstructure Level-2 OBI Gate Evaluator
quantRouter.post('/microstructure-obi', (req: Request, res: Response) => {
  try {
    const orderBook = req.body;
    const obiResult = evaluateOrderBookImbalanceV5(orderBook);
    res.json({ success: true, obi: obiResult });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Strategy S12 Episodic Pivot Evaluator
quantRouter.post('/strategy-s12', (req: Request, res: Response) => {
  try {
    const input = req.body;
    const s12Result = evaluateEpisodicPivotS12(input);
    res.json({ success: true, setup: s12Result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// V6.0 INSTITUTIONAL ENDPOINTS
// ============================================================================

// 6. Get 3-Way Backtest Comparison (v4.2 vs v5.0 vs v6.0)
quantRouter.get('/backtest-comparison', (req: Request, res: Response) => {
  try {
    const filePath = path.join(process.cwd(), 'backtest_comparison_v4_v5_v6.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return res.json({ success: true, comparison: data });
    }
    return res.status(404).json({ success: false, error: 'Comparison benchmark dataset not generated yet.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Get Stateful Actionable Alerts (P0 to P4 priority)
quantRouter.get('/alerts', async (req: Request, res: Response) => {
  try {
    const alertEngine = AlertEngine.getInstance();
    const alerts = await alertEngine.scanAndGenerateStatefulAlerts();
    res.json({ success: true, count: alerts.length, alerts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Acknowledge Alert
quantRouter.post('/alerts/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const alertEngine = AlertEngine.getInstance();
    const success = await alertEngine.acknowledgeAlert(id);
    res.json({ success, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Strategy S1 LPE Evaluator
quantRouter.post('/strategy-s1-lpe', (req: Request, res: Response) => {
  try {
    const { breakoutPrice, baseHigh, atr14, stockReturn63d, indexReturn63d, ema21 } = req.body;
    const lpeResult = calculateLimitPullbackEntryV6(
      Number(breakoutPrice || 100),
      Number(baseHigh || 98),
      Number(atr14 || 3.5),
      Number(stockReturn63d || 15),
      Number(indexReturn63d || 8),
      Number(ema21 || 95)
    );
    res.json({ success: true, lpe: lpeResult });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Strategy S13 Earnings Acceleration Evaluator
quantRouter.post('/strategy-s13', (req: Request, res: Response) => {
  try {
    const input = req.body;
    const s13Result = evaluateS13EarningsAccelerationV6(input);
    res.json({ success: true, evaluation: s13Result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 11. Live Intraday Pipeline Status Endpoint
quantRouter.get('/intraday-status', (req: Request, res: Response) => {
  try {
    const progressPath = path.join(process.cwd(), 'scratch', 'intraday_ingest_progress.json');
    if (fs.existsSync(progressPath)) {
      const data = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      return res.json({ success: true, progress: data });
    }
    return res.json({
      success: true,
      progress: {
        isRunning: false,
        percentComplete: 0,
        completedStocks: 0,
        totalStocks: 1257,
        totalCandlesStored: 0,
        message: 'Pipeline not started or idle'
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Institutional Research & Experience Agent (IREA) Scrip Dossier Endpoint
quantRouter.get('/research-dossier/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const agent = ResearchExperienceAgent.getInstance();
    const dossier = await agent.generateDossier(symbol);
    res.json({ success: true, dossier });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. Standalone Glenn Neely NEoWave Analysis Endpoint
quantRouter.get('/neowave/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const agent = ResearchExperienceAgent.getInstance();
    const dossier = await agent.generateDossier(symbol);
    res.json({
      success: true,
      symbol,
      waveAnalysis: dossier.waveAnalysis,
      chartMarkers: dossier.chartVisualization.waveMarkers
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// V7.0 OPPORTUNITY ENGINE FUNNEL ENDPOINTS
// ============================================================================

// 14. Add Paper Trade
quantRouter.post('/paper-trades', async (req: Request, res: Response) => {
  try {
    const { symbol, company_name, strategy_ids, gate_snapshot, entry_price, stop_loss, target_1, target_2, position_size, position_inr, notes } = req.body;
    const db = getDB();
    const id = `pt_${randomBytes(6).toString('hex')}`;
    const entry_date = new Date().toISOString();
    await dbRun(
      db,
      `INSERT INTO paper_trades 
       (id, symbol, company_name, strategy_ids, gate_snapshot, entry_date, entry_price, stop_loss, target_1, target_2, position_size, position_inr, status, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      [id, symbol, company_name, strategy_ids, gate_snapshot, entry_date, entry_price, stop_loss, target_1, target_2, position_size, position_inr, notes]
    );
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 15. Get Paper Trades
quantRouter.get('/paper-trades', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const trades = await dbAll(db, `SELECT * FROM paper_trades ORDER BY created_at DESC`);
    res.json({ success: true, trades });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 16. Update Paper Trade Status
quantRouter.patch('/paper-trades/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, exit_price, pnl_pct, pnl_inr, holding_days, max_gain_pct, max_loss_pct, verdict, notes } = req.body;
    const db = getDB();
    const exit_date = new Date().toISOString();
    await dbRun(
      db,
      `UPDATE paper_trades 
       SET status = ?, exit_date = ?, exit_price = ?, pnl_pct = ?, pnl_inr = ?, holding_days = ?, max_gain_pct = ?, max_loss_pct = ?, verdict = ?, notes = ?
       WHERE id = ?`,
      [status, exit_date, exit_price, pnl_pct, pnl_inr, holding_days, max_gain_pct, max_loss_pct, verdict, notes, id]
    );
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 17. Save Funnel Preset
quantRouter.post('/funnel-presets', async (req: Request, res: Response) => {
  try {
    const { name, strategy_ids_json, gate_config_json } = req.body;
    const db = getDB();
    const id = `fp_${randomBytes(6).toString('hex')}`;
    await dbRun(
      db,
      `INSERT INTO funnel_presets (id, name, strategy_ids_json, gate_config_json) VALUES (?, ?, ?, ?)`,
      [id, name, strategy_ids_json, gate_config_json]
    );
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 18. Get Funnel Presets
quantRouter.get('/funnel-presets', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const presets = await dbAll(db, `SELECT * FROM funnel_presets ORDER BY created_at DESC`);
    res.json({ success: true, presets });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 19. Elliott Wave & NEoWave Corrective Pullback Indicator for a specific stock
quantRouter.get('/elliott-wave/pullback/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = (req.params.symbol || '').toUpperCase().trim();
    const db = getDB();
    const rows = await dbAll(
      db,
      `SELECT trade_date as date, open, high, low, close, volume 
       FROM DailyOHLCV 
       WHERE symbol = ? 
       ORDER BY trade_date ASC`,
      [symbol]
    );

    if (!rows || rows.length < 10) {
      return res.status(404).json({
        success: false,
        error: `Insufficient historical candle data for symbol ${symbol} (found ${rows ? rows.length : 0} bars).`
      });
    }

    const bars = rows.map((r: any) => ({
      date: r.date,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume || 0)
    }));

    const neoEngine = NEoWaveEngine.getInstance();
    const correctiveIndicator = neoEngine.detectCorrectivePatternCompletion(bars, undefined, symbol);
    const waveAnalysis = neoEngine.analyzeNEoWave(symbol, bars);

    res.json({
      success: true,
      symbol,
      correctiveIndicator,
      waveAnalysis
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 20. Elliott Wave Corrective Pullback Universe Screener
quantRouter.get('/elliott-wave/pullback-screener', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const symbolsRows = await dbAll(
      db,
      `SELECT DISTINCT symbol FROM DailyOHLCV ORDER BY symbol ASC`
    );
    const symbols = symbolsRows.map((r: any) => r.symbol);
    const neoEngine = NEoWaveEngine.getInstance();
    const completedMatches: any[] = [];
    const developingMatches: any[] = [];

    for (const sym of symbols) {
      const rows = await dbAll(
        db,
        `SELECT trade_date as date, open, high, low, close, volume 
         FROM DailyOHLCV 
         WHERE symbol = ? 
         ORDER BY trade_date ASC`,
        [sym]
      );
      if (!rows || rows.length < 15) continue;

      const bars = rows.map((r: any) => ({
        date: r.date,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume || 0)
      }));

      const ind = neoEngine.detectCorrectivePatternCompletion(bars, undefined, sym);
      if (ind.isCompleted || ind.completionStatus === 'CONFIRMED_COMPLETED' || ind.completionStatus === 'EARLY_REVERSAL') {
        completedMatches.push(ind);
      } else if (ind.completionStatus === 'DEVELOPING') {
        developingMatches.push(ind);
      }
    }

    res.json({
      success: true,
      totalScanned: symbols.length,
      completedCount: completedMatches.length,
      completedMatches,
      developingMatches: developingMatches.slice(0, 10)
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

