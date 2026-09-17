import { Router } from 'express';
import { randomBytes } from 'crypto';
import { getDB } from '../database.js';
import { dbAll, dbGet, dbRun } from '../database.js';
import {
  seedBuiltInPresets,
  getDefaultsForStrategy,
  STRATEGY_CATALOG,
  StrategyId
} from '../services/StrategyParameterConfig.js';
import {
  EVIDENCE_BUCKETS,
  getIndependentEvidenceBuckets,
  calculateSignalQuality,
  evaluateSignalQualityOverlay,
  calculateDeliveryZScore,
  generateSignalAuditRecord
} from '../services/SignalQualityOverlay.js';
import {
  calculateAdaptivePositionSize,
  evaluatePositionExit,
  evaluateCapitalPreservationState,
  evaluatePortfolioCorrelationGuard
} from '../services/CapitalProtectionEngine.js';
import {
  activeFlags,
  evaluateS8B_ClassicalBullFlag,
  evaluateS21_CupAndHandle,
  evaluateS22_VolatilitySqueeze,
  evaluateS23_DoubleBottom,
  evaluateS24_DistributionExit,
  evaluateS10_IntradayORBConfirmation
} from '../services/NewTechnicalStrategiesEngine.js';

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

const router = Router();

/**
 * GET /strategies/library
 * Returns combined list of built-in presets + custom strategies
 */
router.get('/library', async (req, res) => {
  try {
    const db = getDB();

    // Seed presets if not already done
    await seedBuiltInPresets(db);

    // Fetch all strategies (presets + custom)
    const strategies = await dbAll<any>(
      db,
      `SELECT
         id, name, short_name, description, category,
         is_preset, preset_order, color_accent,
         is_active, parameters_json, base_template_id,
         last_backtest_at, backtest_win_rate, backtest_sharpe, backtest_total_signals
       FROM CustomStrategies
       ORDER BY is_preset DESC, preset_order ASC, created_at DESC`
    );

    // Parse parameters_json for each strategy
    const enriched = strategies.map(s => ({
      ...s,
      parameters: s.parameters_json ? JSON.parse(s.parameters_json) : {},
      canDelete: s.is_preset === 0,
    }));

    res.json({
      success: true,
      data: {
        total: enriched.length,
        presets: enriched.filter(s => s.is_preset === 1),
        custom: enriched.filter(s => s.is_preset === 0),
        all: enriched,
      },
      message: `Loaded ${enriched.length} strategies`,
    });
  } catch (err: any) {
    console.error('[StrategyLibraryEndpoint] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to load strategy library',
    });
  }
});

/**
 * GET /strategies/:id/parameters
 * Returns full parameters config for a specific strategy
 */
router.get('/:id/parameters', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDB();

    const strategy = await dbGet<any>(
      db,
      `SELECT * FROM CustomStrategies WHERE id = ?`,
      [id]
    );

    if (!strategy) {
      return res.status(404).json({
        success: false,
        message: `Strategy ${id} not found`,
      });
    }

    res.json({
      success: true,
      data: {
        id: strategy.id,
        name: strategy.name,
        parameters: strategy.parameters_json ? JSON.parse(strategy.parameters_json) : {},
        isPreset: strategy.is_preset === 1,
      },
      message: 'Parameters loaded',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to load parameters',
    });
  }
});

/**
 * POST /strategies/save
 * Create or update a strategy (custom only, not presets)
 * Body: { id?, name, description, category, parameters, baseTemplateId }
 */
router.post('/save', async (req, res) => {
  try {
    const {
      id,
      name,
      description,
      category,
      parameters,
      baseTemplateId,
    } = req.body;

    if (!name || !parameters) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, parameters',
      });
    }

    const db = getDB();
    const strategyId = id || generateId('custom');
    const parametersJson = JSON.stringify(parameters);

    // Check if strategy with this name already exists (and it's not the one we're updating)
    const existing = await dbGet<any>(
      db,
      `SELECT id FROM CustomStrategies WHERE name = ? AND id != ?`,
      [name, strategyId]
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Strategy name "${name}" already exists`,
      });
    }

    // Insert or update
    const now = new Date().toISOString();
    if (id) {
      // Update existing
      const existing = await dbGet<any>(db, `SELECT * FROM CustomStrategies WHERE id = ?`, [id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: `Strategy ${id} not found`,
        });
      }

      if (existing.is_preset === 1) {
        return res.status(403).json({
          success: false,
          message: 'Cannot modify built-in presets',
        });
      }

      await dbRun(
        db,
        `UPDATE CustomStrategies
         SET name = ?, description = ?, category = ?, parameters_json = ?, updated_at = ?
         WHERE id = ?`,
        [name, description, category, parametersJson, now, id]
      );
    } else {
      // Create new custom strategy
      await dbRun(
        db,
        `INSERT INTO CustomStrategies
         (id, name, description, category, parameters_json, base_template_id, is_preset, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        [strategyId, name, description, category, parametersJson, baseTemplateId, now, now]
      );
    }

    res.json({
      success: true,
      data: {
        id: strategyId,
        name,
        message: id ? 'Strategy updated' : 'Strategy created',
      },
      message: id ? 'Strategy updated successfully' : 'Strategy created successfully',
    });
  } catch (err: any) {
    console.error('[StrategyCreateUpdateEndpoint] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to save strategy',
    });
  }
});

/**
 * DELETE /strategies/:id
 * Delete a custom strategy (not allowed for presets)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDB();

    const strategy = await dbGet<any>(
      db,
      `SELECT id, is_preset FROM CustomStrategies WHERE id = ?`,
      [id]
    );

    if (!strategy) {
      return res.status(404).json({
        success: false,
        message: `Strategy ${id} not found`,
      });
    }

    // Prevent deletion of presets
    if (strategy.is_preset === 1) {
      return res.status(403).json({
        success: false,
        message: 'Built-in presets cannot be deleted',
      });
    }

    // Delete related backtest results first (foreign key constraint)
    await dbRun(
      db,
      `DELETE FROM strategy_run_results WHERE strategy_id = ?`,
      [id]
    );

    // Delete the strategy
    await dbRun(
      db,
      `DELETE FROM CustomStrategies WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: { id },
      message: 'Strategy deleted successfully',
    });
  } catch (err: any) {
    console.error('[StrategyDeleteEndpoint] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete strategy',
    });
  }
});

/**
 * POST /strategies/:id/duplicate
 * Clone an existing strategy (preset or custom)
 * Body: { newName? }
 */
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const { newName } = req.body;
    const db = getDB();

    const source = await dbGet<any>(
      db,
      `SELECT * FROM CustomStrategies WHERE id = ?`,
      [id]
    );

    if (!source) {
      return res.status(404).json({
        success: false,
        message: `Strategy ${id} not found`,
      });
    }

    // Generate new ID and name
    const newId = generateId('custom');
    const defaultName = `${source.name} (Copy)`;
    const finalName = newName || defaultName;
    const now = new Date().toISOString();

    // Check if name already exists
    const existing = await dbGet<any>(
      db,
      `SELECT id FROM CustomStrategies WHERE name = ?`,
      [finalName]
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Strategy name "${finalName}" already exists`,
      });
    }

    // Create clone as a custom strategy (is_preset = 0)
    await dbRun(
      db,
      `INSERT INTO CustomStrategies
       (id, name, short_name, description, category, parameters_json, base_template_id,
        is_preset, preset_order, color_accent, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, 1, ?, ?)`,
      [
        newId,
        finalName,
        source.short_name,
        source.description,
        source.category,
        source.parameters_json,
        source.base_template_id || source.id,
        source.color_accent,
        now,
        now,
      ]
    );

    res.json({
      success: true,
      data: {
        id: newId,
        name: finalName,
        sourceId: id,
      },
      message: 'Strategy cloned successfully',
    });
  } catch (err: any) {
    console.error('[StrategyDuplicateEndpoint] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to duplicate strategy',
    });
  }
});

/**
 * GET /strategies/presets/catalog
 * Returns metadata for all built-in strategies (for UI reference)
 */
router.get('/presets/catalog', (req, res) => {
  try {
    res.json({
      success: true,
      data: STRATEGY_CATALOG,
      message: `Loaded ${STRATEGY_CATALOG.length} strategy definitions`,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to load strategy catalog',
    });
  }
});

/**
 * POST /strategies/scan-strategy
 * Single strategy scan across universe and regimes.
 * Body: { strategyId, universeLimit?, regimeIds? }
 */
router.post('/scan-strategy', async (req, res) => {
  try {
    const { strategyId, universeLimit, regimeIds } = req.body;

    if (!strategyId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: strategyId',
      });
    }

    const db = getDB();
    const { RegimeBacktestEngine, STRATEGIES } = await import('../services/RegimeBacktestEngine.js');
    const engine = RegimeBacktestEngine.getInstance();

    // Validate strategy exists
    const strategy = STRATEGIES.find(s => s.id === strategyId);
    if (!strategy) {
      return res.status(400).json({
        success: false,
        message: `Invalid strategy ID: ${strategyId}`,
      });
    }

    // Run backtest with single strategy
    const result = await engine.executeCompleteBacktest(db, {
      strategyIds: [strategyId],
      universeLimit,
    });

    res.json({
      success: true,
      data: {
        strategyId,
        strategyName: strategy.name,
        tradesCount: result.trades.length,
        summariesCount: result.summaries.length,
        summaries: result.summaries,
        topTrades: result.trades.slice(0, 20),
      },
      message: `Scan completed for strategy ${strategy.name}`,
    });
  } catch (err: any) {
    console.error('[StrategyScanEndpoint] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to scan strategy',
    });
  }
});

/**
 * POST /strategies/scan-multi
 * Multi-strategy scan across universe and regimes.
 * Body: { strategyIds[], universeLimit?, regimeIds? }
 */
router.post('/scan-multi', async (req, res) => {
  try {
    const { strategyIds, universeLimit, regimeIds } = req.body;

    if (!strategyIds || !Array.isArray(strategyIds) || strategyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: strategyIds (array)',
      });
    }

    const db = getDB();

    // Validate all strategy IDs against the DB (CustomStrategies is the source of truth)
    const placeholders = strategyIds.map(() => '?').join(',');
    const dbStrategies = await dbAll<any>(
      db,
      `SELECT id, name, short_name, parameters_json FROM CustomStrategies WHERE id IN (${placeholders}) AND is_active = 1`,
      strategyIds
    );
    const foundIds = new Set(dbStrategies.map((s: any) => s.id));
    const invalidIds = strategyIds.filter(id => !foundIds.has(id));

    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Strategy IDs not found in library: ${invalidIds.join(', ')}. Available strategies are from /api/strategies/library`,
      });
    }

    // For now, return a structured response with strategy metadata
    // (full backtest engine integration is Phase 4 — this provides the multi-scan response shape)
    const strategyNames = dbStrategies.map((s: any) => s.name);

    res.json({
      success: true,
      data: {
        runId: `run_${Date.now()}`,
        strategyIds,
        strategyNames,
        strategies: Object.fromEntries(
          dbStrategies.map((s: any) => [s.id, {
            id: s.id,
            name: s.name,
            shortName: s.short_name,
            parameters: s.parameters_json ? JSON.parse(s.parameters_json) : {},
            status: 'READY',  // Will be RUNNING/COMPLETE when engine is connected
            totalUniverseScanned: 0,
            strategy1Matches: [],
            strategy2Matches: [],
            strategy3Matches: [],
            strategy4Matches: [],
            strategy5Matches: [],
            strategy6Matches: [],
            strategy7Matches: [],
            strategy8Matches: [],
            strategy9Matches: [],
            strategy10Matches: [],
            multiConvergenceMatches: [],
          }])
        ),
        comparisonMatrix: [],
        convergenceMatches: [],
        generatedAt: new Date().toISOString(),
      },
      message: `Multi-strategy scan initiated for ${strategyNames.length} strategies`,
    });
  } catch (err: any) {
    console.error('[StrategyMultiScanEndpoint] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to scan multiple strategies',
    });
  }
});

/**
 * GET /strategies/universe-count
 * Returns the current full universe count from MasterTickers
 */
router.get('/universe-count', async (req, res) => {
  try {
    const db = getDB();
    const { RegimeBacktestEngine } = await import('../services/RegimeBacktestEngine.js');
    const engine = RegimeBacktestEngine.getInstance();

    const count = await engine.getUniverseCount(db);

    res.json({
      success: true,
      count,
      message: `Current full universe contains ${count} distinct symbols`,
    });
  } catch (err: any) {
    console.error('[UniverseCountEndpoint] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to get universe count',
    });
  }
});

/**
 * GET /scan-cache/latest
 * Returns the instantly available pre-calculated scan results
 */
router.get('/scan-cache/latest', async (req, res) => {
  try {
    const { StrategyPreCalculationService } = await import('../services/StrategyPreCalculationService.js');
    const service = StrategyPreCalculationService.getInstance();
    const data = await service.getCachedResults();

    res.json({
      success: true,
      cached: true,
      data: {
        results: data.results || [],
        metadata: data.metadata
      }
    });
  } catch (err: any) {
    console.error('[ScanCacheEndpoint] Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /scan-multi/background
 * Triggers a background recalculation asynchronously
 */
router.post('/scan-multi/background', async (req, res) => {
  try {
    const { StrategyPreCalculationService } = await import('../services/StrategyPreCalculationService.js');
    const service = StrategyPreCalculationService.getInstance();
    const result = await service.triggerManualScan();

    res.json({
      success: true,
      jobId: result.scanId,
      status: 'QUEUED',
      message: result.message
    });
  } catch (err: any) {
    console.error('[ScanBackgroundEndpoint] Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /progress
 * Returns the current progress of the background scan
 */
router.get('/progress', async (req, res) => {
  try {
    const { StrategyPreCalculationService } = await import('../services/StrategyPreCalculationService.js');
    const service = StrategyPreCalculationService.getInstance();
    const progress = await service.getScanProgress();
    res.json(progress);
  } catch (err: any) {
    res.status(500).json({ status: 'IDLE', percent: 0 });
  }
});

/**
 * GET /scan-progress
 * Returns progress data formatted for frontend ScanProgressItem[] and live progress
 */
router.get('/scan-progress', async (req, res) => {
  try {
    const { StrategyPreCalculationService } = await import('../services/StrategyPreCalculationService.js');
    const service = StrategyPreCalculationService.getInstance();
    const progress = await service.getScanProgress();
    
    const stratNames: { [k: string]: string } = {
      'S1_VPA_BASE_BREAKOUT': 'VPA Base Breakout',
      'S2_INSTITUTIONAL_FVG_CE': 'Institutional FVG/CE',
      'S3_HH_HL_COMPACTION': 'HH/HL Compaction',
      'S4_HH_HL_SMA200_VPA': 'HH/HL + SMA200 + VPA',
      'S5_50EMA_PULLBACK_VCP': '50 EMA Pullback VCP',
      'S6_RS_BREAKOUT': 'RS Breakout (Nifty 500)',
      'S7_RSI_MEAN_REVERSION': 'RSI Mean-Reversion Dip',
      'S8_HIGH_TIGHT_FLAG': 'High Tight Flag (HTF)',
      'S9_VOLUME_DRYUP_RS': 'Volume Dry-Up + RS',
      'S10_TRENDLINE_ORB': 'Trendline ORB'
    };

    const data = Object.keys(stratNames).map(id => ({
      strategyId: id,
      strategyName: stratNames[id],
      status: progress.status === 'RUNNING' ? 'running' : 'completed',
      qualified: (progress.strategy_matches && progress.strategy_matches[id]) || 0,
      total: progress.scanned || progress.total || 3000
    }));

    res.json({ success: true, data, progress });
  } catch (err: any) {
    res.json({ success: false, data: [] });
  }
});

/**
 * GET /export/excel
 * Generates offline Excel comparison matrix from cache
 */
router.get('/export/excel', async (req, res) => {
  try {
    const excelModule: any = await import('exceljs');
    const ExcelJS = excelModule.default || excelModule;
    const WorkbookClass = ExcelJS.Workbook || excelModule.Workbook;
    const { StrategyPreCalculationService } = await import('../services/StrategyPreCalculationService.js');
    const service = StrategyPreCalculationService.getInstance();
    
    // Get latest results
    const data = await service.getCachedResults();
    if (!data || !data.results || data.results.length === 0) {
      return res.status(404).send('No cached scan data found to export.');
    }

    const workbook = new WorkbookClass();
    workbook.creator = 'ITAS Platform';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Convergence Matrix');
    sheet.columns = [
      { header: 'Symbol', key: 'symbol', width: 15 },
      { header: 'Convergence Count', key: 'convergence', width: 20 },
      { header: 'Target 1', key: 'target1', width: 12 },
      { header: 'Stop Loss', key: 'stopLoss', width: 12 },
      { header: 'Max R:R', key: 'rr', width: 10 }
    ];

    // Group by symbol
    const symbolMap = new Map<string, any>();
    for (const row of data.results) {
      if (row.qualified === 1) {
        if (!symbolMap.has(row.symbol)) {
          symbolMap.set(row.symbol, { symbol: row.symbol, count: 0, target1: 0, stopLoss: 0, rr: 0 });
        }
        const s = symbolMap.get(row.symbol);
        s.count += 1;
        s.target1 = Math.max(s.target1, row.target1 || 0);
        s.stopLoss = row.stop_loss || s.stopLoss;
        s.rr = Math.max(s.rr, row.rr_ratio || 0);
      }
    }

    const rows = Array.from(symbolMap.values()).sort((a, b) => b.count - a.count);
    for (const r of rows) {
      sheet.addRow({
        symbol: r.symbol,
        convergence: r.count,
        target1: r.target1,
        stopLoss: r.stopLoss,
        rr: r.rr
      });
    }

    // Styling
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=ITAS_Convergence_Matrix_${new Date().toISOString().split('T')[0]}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('[ExcelExportEndpoint] Error:', err);
    res.status(500).send('Error generating Excel file');
  }
});

/**
 * GET /strategies/evidence-buckets
 * Returns all 6 independent evidence buckets and associated strategy definitions
 */
router.get('/evidence-buckets', (req, res) => {
  res.json({
    success: true,
    data: {
      buckets: EVIDENCE_BUCKETS,
      totalBuckets: Object.keys(EVIDENCE_BUCKETS).length
    }
  });
});

/**
 * POST /strategies/evaluate-overlay
 * Evaluates candidate strategy triggers against Independent Evidence Buckets and Quality overlay
 */
router.post('/evaluate-overlay', (req, res) => {
  try {
    const { strategyIds, input } = req.body;
    const ids = Array.isArray(strategyIds) && strategyIds.length > 0 ? strategyIds : ['S6', 'S9'];
    const bucketInfo = getIndependentEvidenceBuckets(ids);
    const overlayInput = {
      strategyCount: ids.length,
      independentBuckets: bucketInfo.bucketCount,
      relativeStrengthPercentile: input?.relativeStrengthPercentile ?? 78,
      volumeRatio: input?.volumeRatio ?? 1.6,
      regimeScore: input?.regimeScore ?? 1.0,
      liquidityScore: input?.liquidityScore ?? 1.0,
      eventRiskScore: input?.eventRiskScore ?? 1.0,
      forensicScore: input?.forensicScore ?? 1.0,
      valuationScore: input?.valuationScore ?? 0.8,
      riskReward: input?.riskReward ?? 2.8
    };
    const overlayResult = evaluateSignalQualityOverlay({
      symbol: req.body.symbol || 'TATAMOTORS',
      companyName: req.body.companyName || 'Tata Motors Limited',
      strategyIds: ids,
      strategyTriggered: true,
      regimeAllowed: input?.regimeAllowed ?? true,
      forensicClean: input?.forensicClean ?? true,
      liquidityPass: input?.liquidityPass ?? true,
      eventRiskPass: input?.eventRiskPass ?? true,
      riskReward: input?.riskReward ?? 2.8,
      gapRiskTooHigh: input?.gapRiskTooHigh ?? false,
      portfolioConcentrationTooHigh: input?.portfolioConcentrationTooHigh ?? false,
      positionRiskTooHigh: input?.positionRiskTooHigh ?? false,
      qualityInput: overlayInput
    });
    res.json({
      success: true,
      data: {
        bucketInfo,
        overlayResult
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /strategies/adaptive-position-size
 * Multi-constraint position sizing (minimum of risk, liquidity, concentration, and gap risk)
 */
router.post('/adaptive-position-size', (req, res) => {
  try {
    const decision = calculateAdaptivePositionSize(req.body);
    res.json({ success: true, data: decision });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /strategies/evaluate-exit
 * 4-Tier Exit Engine evaluation (Hard stop, thesis failure, trailing ATR, parabolic exhaustion)
 */
router.post('/evaluate-exit', (req, res) => {
  try {
    const exitResult = evaluatePositionExit(req.body);
    res.json({ success: true, data: exitResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /strategies/new-strategies-status
 * Status of modular new technical strategies (S8B, S21, S22, S23, S24)
 */
router.get('/new-strategies-status', (req, res) => {
  res.json({
    success: true,
    data: {
      flags: activeFlags,
      newStrategies: [
        { id: 'S8B_CLASSICAL_BULL_FLAG', name: 'Classical Bull Flag', enabled: activeFlags.ENABLE_S8B, bucket: 'BUCKET_A_TREND' },
        { id: 'S21_CUP_AND_HANDLE', name: 'Cup & Handle (Structural)', enabled: activeFlags.ENABLE_S21, bucket: 'BUCKET_F_STRUCTURAL' },
        { id: 'S22_VOLATILITY_SQUEEZE', name: 'TTM Volatility Squeeze', enabled: activeFlags.ENABLE_S22, bucket: 'BUCKET_F_STRUCTURAL' },
        { id: 'S23_CLASSICAL_DOUBLE_BOTTOM', name: 'Classical Double Bottom', enabled: activeFlags.ENABLE_S23, bucket: 'BUCKET_D_MEAN_REVERSION' },
        { id: 'S24_DISTRIBUTION_EXIT', name: 'Double Top Distribution Exit', enabled: activeFlags.ENABLE_S24, bucket: 'HOLDING_EXIT_ONLY' }
      ]
    }
  });
});

/**
 * POST /strategies/evaluate-correlation-guard
 * Enforces single stock <=8%, sector <=25%, and correlation cluster <=30%
 */
router.post('/evaluate-correlation-guard', (req, res) => {
  try {
    const { existingPositions, candidateSymbol, candidateSector, candidateWeightPct, correlationMatrix } = req.body;
    const result = evaluatePortfolioCorrelationGuard(
      existingPositions || [],
      candidateSymbol || 'TATAMOTORS',
      candidateSector || 'Automobile',
      candidateWeightPct || 5.0,
      correlationMatrix
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /strategies/delivery-z-score
 * Computes 90-day normalized Delivery Z-Score
 */
router.post('/delivery-z-score', (req, res) => {
  try {
    const { currentDelivery, historicalSeries } = req.body;
    const result = calculateDeliveryZScore(currentDelivery || 50, historicalSeries || []);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /strategies/evaluate-orb
 * Evaluates 15-minute Opening Range Breakout (09:15-09:30 IST)
 */
router.post('/evaluate-orb', (req, res) => {
  try {
    const { symbol, intradayCandles, dailySetupActive, marketRegimePermitsLong, averageOpeningVolume20D } = req.body;
    const result = evaluateS10_IntradayORBConfirmation(
      symbol || 'TCS',
      intradayCandles || [],
      dailySetupActive ?? true,
      marketRegimePermitsLong ?? true,
      averageOpeningVolume20D || 50000
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /strategies/generate-audit-record
 * Generates an immutable, machine-readable signal audit record
 */
router.post('/generate-audit-record', (req, res) => {
  try {
    const auditRecord = generateSignalAuditRecord(req.body);
    res.json({ success: true, data: auditRecord });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export const strategiesRouter = router;
export default router;
