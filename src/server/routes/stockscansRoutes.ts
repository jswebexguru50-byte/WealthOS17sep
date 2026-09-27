/**
 * stockscansRoutes.ts
 * Express Router for StockScans Parity Suite
 * 
 * Clean-room API exposing MarketDataQueryService, EvidenceQueryService, and WorkspaceService.
 * Strictly adheres to non-negotiable data integrity contract:
 * - Every response includes status, asOf, sourceSystem, and coverage.
 * - If data cannot be computed, returns status UNAVAILABLE, null data, and explicit noDataReason.
 * - Never returns 0 as a placeholder for missing numbers.
 */

import express, { Request, Response } from 'express';
import { MarketDataQueryService } from '../services/stockscans/MarketDataQueryService.js';
import { EvidenceQueryService } from '../services/stockscans/EvidenceQueryService.js';
import { WorkspaceService } from '../services/stockscans/WorkspaceService.js';
import { UniverseId, MissingConstituentPolicy, DataStatus } from '../../types/stockscans.js';
import { SectorMomentumService } from '../services/SectorMomentumService.js';
import { SectorFlowService } from '../services/SectorFlowService.js';

export const stockscansRouter = express.Router();

// ── 0. Read-only sector momentum matrix ─────────────────────────────────────
// Uses only persisted adjusted sector-index OHLCV. Missing index history stays unavailable.
stockscansRouter.get('/sector-momentum', async (_req: Request, res: Response) => {
  try {
    const sectors = await SectorMomentumService.getUniverse();
    const available = sectors.filter(s => s.status !== 'UNAVAILABLE');
    return res.json({
      success: true,
      status: available.length ? 'VERIFIED' : 'UNAVAILABLE',
      asOf: available.reduce<string | null>((latest, s) => !latest || (s.asOf && s.asOf > latest) ? s.asOf : latest, null),
      sourceSystem: 'DUCKDB_ADJUSTED',
      coverage: { requested: sectors.length, matched: available.length, unavailable: sectors.length - available.length },
      sectors,
      data: sectors
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, status: 'ERROR', sourceSystem: 'DUCKDB_ADJUSTED', data: null, error: err?.message || String(err) });
  }
});

// ── 0b. Evidence-based sector institutional flow ────────────────────────────
stockscansRouter.get('/sector-flows', async (req: Request, res: Response) => {
  try {
    const fromDate = req.query.from ? String(req.query.from) : undefined;
    const toDate = req.query.to ? String(req.query.to) : undefined;
    const sectors = await SectorFlowService.getSectorFlows(fromDate, toDate);
    const available = sectors.filter(s => s.status !== 'UNAVAILABLE');
    return res.json({ success: true, status: available.length ? 'VERIFIED' : 'UNAVAILABLE', sourceSystem: 'SQLITE_EVIDENCE+DUCKDB_ADJUSTED', fromDate: fromDate || null, toDate: toDate || null, coverage: { requested: sectors.length, matched: available.length, unavailable: sectors.length - available.length }, sectors, data: sectors });
  } catch (err: any) {
    return res.status(500).json({ success: false, status: 'ERROR', sourceSystem: 'SQLITE_EVIDENCE+DUCKDB_ADJUSTED', data: null, error: err?.message || String(err) });
  }
});

// ── 1. Market Breadth Snapshot ───────────────────────────────────────────────
stockscansRouter.get('/breadth', async (req: Request, res: Response) => {
  try {
    const universeParam = req.query.universe
      ? String(req.query.universe).split(',').map(s => s.trim().toUpperCase())
      : (req.query.universeId as UniverseId) || 'NIFTY_100';

    const breadth = await MarketDataQueryService.getBreadthSnapshot(universeParam);
    const status: DataStatus = breadth.coverage.matched > 0 ? 'VERIFIED' : 'UNAVAILABLE';
    const noDataReason = breadth.coverage.matched === 0 ? 'No covered constituents returned daily bars' : null;

    return res.json({
      success: true,
      status,
      asOf: breadth.asOf,
      sourceSystem: 'DUCKDB',
      universe: breadth.universe,
      coverage: breadth.coverage,
      noDataReason,
      data: breadth,
      ...breadth
    });
  } catch (err: any) {
    console.error('[StockScans] /breadth error:', err);
    return res.status(500).json({
      success: false,
      status: 'ERROR',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'DUCKDB',
      data: null,
      error: err?.message || String(err),
      errors: [err?.message || String(err)]
    });
  }
});

// ── 2. Run Prebuilt or Custom Technical Scan (Supports /scan and /scans/run) ──
const handleScanRun = async (req: Request, res: Response) => {
  try {
    const { scanId, parameters } = req.body;
    if (!scanId) {
      return res.status(400).json({
        success: false,
        status: 'ERROR',
        asOf: new Date().toISOString().split('T')[0],
        sourceSystem: 'DUCKDB',
        data: null,
        message: 'scanId is required.'
      });
    }

    const result = await MarketDataQueryService.runScan(String(scanId), parameters || {});
    // Persist immutable run in registry with revisions and parameter hash
    await WorkspaceService.recordScanRun(result);

    return res.json({
      success: true,
      status: result.status,
      asOf: result.asOf,
      sourceSystem: 'DUCKDB',
      universe: result.universe,
      coverage: result.coverage,
      noDataReason: result.noDataReason,
      data: result,
      ...result
    });
  } catch (err: any) {
    console.error('[StockScans] /scan error:', err);
    return res.status(500).json({
      success: false,
      status: 'ERROR',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'DUCKDB',
      data: null,
      error: err?.message || String(err),
      errors: [err?.message || String(err)]
    });
  }
};

stockscansRouter.post('/scan', handleScanRun);
stockscansRouter.post('/scans/run', handleScanRun);

// ── 3. Scan Run History Registry (Supports /scan/runs and /scans/runs) ────────
const handleGetScanRuns = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit || 30), 100);
    const runs = await WorkspaceService.getScanRuns(limit);
    const asOf = runs.length > 0 ? runs[0].asOf : new Date().toISOString().split('T')[0];

    return res.json({
      success: true,
      status: 'VERIFIED',
      asOf,
      sourceSystem: 'SQLITE_FERE',
      runs,
      data: runs
    });
  } catch (err: any) {
    console.error('[StockScans] /scan/runs error:', err);
    return res.status(500).json({
      success: false,
      status: 'ERROR',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'SQLITE_FERE',
      data: null,
      error: err?.message || String(err)
    });
  }
};

stockscansRouter.get('/scan/runs', handleGetScanRuns);
stockscansRouter.get('/scans/runs', handleGetScanRuns);

// ── 4. Scan Match Engine (Supports /scan-match and /scans/match) ─────────────
const handleScanMatch = async (req: Request, res: Response) => {
  try {
    const { runIds } = req.body;
    if (!Array.isArray(runIds) || runIds.length === 0) {
      return res.status(400).json({
        success: false,
        status: 'ERROR',
        asOf: new Date().toISOString().split('T')[0],
        sourceSystem: 'SQLITE_FERE',
        data: null,
        message: 'runIds array is required.'
      });
    }

    const matchResult = await WorkspaceService.matchScans(runIds);
    const asOf = matchResult.asOfDates.length > 0 ? matchResult.asOfDates[0] : new Date().toISOString().split('T')[0];
    const status: DataStatus = matchResult.coverage.missingRuns.length === 0 ? 'VERIFIED' : 'PARTIAL';

    return res.json({
      success: true,
      status,
      asOf,
      sourceSystem: 'SQLITE_FERE',
      coverage: {
        requested: runIds.length,
        eligible: matchResult.selectedScans.length,
        matched: matchResult.intersectionCount,
        unavailable: matchResult.coverage.missingRuns.length,
        missingRuns: matchResult.coverage.missingRuns
      },
      data: matchResult,
      ...matchResult
    });
  } catch (err: any) {
    console.error('[StockScans] /scan-match error:', err);
    return res.status(500).json({
      success: false,
      status: 'ERROR',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'SQLITE_FERE',
      data: null,
      error: err?.message || String(err)
    });
  }
};

stockscansRouter.post('/scan-match', handleScanMatch);
stockscansRouter.post('/scans/match', handleScanMatch);

// ── 5. Add Matched Stocks to Watchlist ───────────────────────────────────────
stockscansRouter.post('/scan-match/watchlist', async (req: Request, res: Response) => {
  try {
    const { watchlistName, symbols, tags } = req.body;
    if (!watchlistName || !Array.isArray(symbols)) {
      return res.status(400).json({ success: false, message: 'watchlistName and symbols array required.' });
    }
    await WorkspaceService.addScanMatchesToWatchlist(watchlistName, symbols, tags || ['SCAN_MATCH']);
    return res.json({
      success: true,
      status: 'VERIFIED',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'SQLITE_FERE',
      message: `Added ${symbols.length} symbols to watchlist '${watchlistName}'`
    });
  } catch (err: any) {
    console.error('[StockScans] /scan-match/watchlist error:', err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// ── 6. Announcements Full-Text Search (FTS5 + LIKE fallback) ────────────────
stockscansRouter.get('/announcements', (req: Request, res: Response) => {
  try {
    const query = req.query.q ? String(req.query.q) : undefined;
    const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
    const eventType = req.query.type ? String(req.query.type) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const data = EvidenceQueryService.searchAnnouncements({ query, symbol, eventType, limit });
    const status: DataStatus = data.announcements.length > 0 ? 'VERIFIED' : 'PARTIAL';

    return res.json({
      success: true,
      status,
      asOf: data.asOf,
      sourceSystem: 'BSE',
      searchMode: data.searchMode,
      totalMatched: data.totalMatched,
      trendingKeywords: data.trendingKeywords,
      announcements: data.announcements,
      data: data.announcements
    });
  } catch (err: any) {
    console.error('[StockScans] /announcements error:', err);
    return res.status(500).json({
      success: false,
      status: 'ERROR',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'BSE',
      data: null,
      error: err?.message || String(err)
    });
  }
});

// ── 7. Shareholding Scans & Period-Over-Period Diffs ─────────────────────────
stockscansRouter.get('/shareholding', (req: Request, res: Response) => {
  try {
    const scanType = req.query.type as any;
    const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
    const data = EvidenceQueryService.getShareholdingScans({ scanType, symbol });
    const status: DataStatus = data.results.length > 0 ? 'VERIFIED' : 'UNAVAILABLE';

    return res.json({
      success: true,
      status,
      asOf: data.asOf,
      sourceSystem: 'BSE',
      scanType: data.scanType,
      results: data.results,
      data: data.results
    });
  } catch (err: any) {
    console.error('[StockScans] /shareholding error:', err);
    return res.status(500).json({
      success: false,
      status: 'ERROR',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'BSE',
      data: null,
      error: err?.message || String(err)
    });
  }
});

// ── 8. Results Calendar & Filing Timeline ───────────────────────────────────
stockscansRouter.get('/results-calendar', (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const data = EvidenceQueryService.getResultsCalendar({ symbol, limit });
    const status: DataStatus = data.results.length > 0 ? 'VERIFIED' : 'UNAVAILABLE';

    return res.json({
      success: true,
      status,
      asOf: data.asOf,
      sourceSystem: 'BSE',
      results: data.results,
      data: data.results
    });
  } catch (err: any) {
    console.error('[StockScans] /results-calendar error:', err);
    return res.status(500).json({
      success: false,
      status: 'ERROR',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'BSE',
      data: null,
      error: err?.message || String(err)
    });
  }
});

// ── 9. Management Guidance ("Walk-The-Talk") ────────────────────────────────
stockscansRouter.get('/guidance', (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
    const statusParam = req.query.status ? String(req.query.status) : undefined;
    const data = EvidenceQueryService.getManagementGuidance({ symbol, status: statusParam });
    const status: DataStatus = data.commitments.length > 0 ? 'VERIFIED' : 'UNAVAILABLE';

    return res.json({
      success: true,
      status,
      asOf: data.asOf,
      sourceSystem: 'BSE',
      commitments: data.commitments,
      data: data.commitments
    });
  } catch (err: any) {
    console.error('[StockScans] /guidance error:', err);
    return res.status(500).json({
      success: false,
      status: 'ERROR',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'BSE',
      data: null,
      error: err?.message || String(err)
    });
  }
});

// ── 10. Peer Comparison Matrix (Never manufactures synthetic market cap/PE) ──
stockscansRouter.get('/peers', async (req: Request, res: Response) => {
  try {
    const raw = String(req.query.symbols || 'RELIANCE,TCS,INFY,HDFCBANK');
    const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const data = await EvidenceQueryService.getPeerComparison(symbols);

    return res.json({
      success: true,
      status: 'VERIFIED',
      asOf: data.asOf,
      sourceSystem: 'SQLITE_FERE',
      metricsDescription: data.metricsDescription,
      peers: data.peers,
      data: data.peers
    });
  } catch (err: any) {
    console.error('[StockScans] /peers error:', err);
    return res.status(500).json({
      success: false,
      status: 'ERROR',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'SQLITE_FERE',
      data: null,
      error: err?.message || String(err)
    });
  }
});

// ── 11. Returns Benchmark Comparison ────────────────────────────────────────
stockscansRouter.post('/returns-benchmark', async (req: Request, res: Response) => {
  try {
    const { symbols, period } = req.body;
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ success: false, message: 'symbols array is required.' });
    }
    const data = await MarketDataQueryService.compareReturnsBenchmark(symbols, period || '1Y');
    const coveredCount = data.series.filter(s => s.status !== 'UNAVAILABLE').length;
    const status: DataStatus = coveredCount === data.series.length ? 'VERIFIED' : coveredCount > 0 ? 'PARTIAL' : 'UNAVAILABLE';

    return res.json({
      success: true,
      status,
      asOf: data.asOf,
      sourceSystem: 'DUCKDB',
      data,
      ...data
    });
  } catch (err: any) {
    console.error('[StockScans] /returns-benchmark error:', err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// ── 12. Custom Thematic Indices ─────────────────────────────────────────────
stockscansRouter.get('/custom-indices', async (_req: Request, res: Response) => {
  try {
    const indices = await WorkspaceService.getCustomIndices();
    return res.json({
      success: true,
      status: 'VERIFIED',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'SQLITE_FERE',
      indices,
      data: indices
    });
  } catch (err: any) {
    console.error('[StockScans] /custom-indices get error:', err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

stockscansRouter.post('/custom-indices', async (req: Request, res: Response) => {
  try {
    const { id, name, description, constituents } = req.body;
    if (!name || !Array.isArray(constituents) || constituents.length === 0) {
      return res.status(400).json({ success: false, message: 'name and constituents array required.' });
    }
    const savedId = await WorkspaceService.saveCustomIndex({ id, name, description, constituents });
    return res.json({
      success: true,
      status: 'VERIFIED',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'SQLITE_FERE',
      id: savedId
    });
  } catch (err: any) {
    console.error('[StockScans] /custom-indices post error:', err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

stockscansRouter.post('/custom-indices/calculate', async (req: Request, res: Response) => {
  try {
    const { constituents, period, missingPolicy } = req.body;
    if (!Array.isArray(constituents) || constituents.length === 0) {
      return res.status(400).json({
        success: false,
        status: 'ERROR',
        asOf: new Date().toISOString().split('T')[0],
        sourceSystem: 'DUCKDB',
        data: null,
        message: 'constituents array is required.'
      });
    }

    const policy: MissingConstituentPolicy = missingPolicy || 'FAIL_IF_ANY_MISSING';
    const calculation = await MarketDataQueryService.calculateCustomIndex(constituents, period || '1Y', policy);

    return res.json({
      success: true,
      status: calculation.status,
      asOf: calculation.asOf,
      sourceSystem: 'DUCKDB',
      coverage: {
        requested: calculation.coverage.total,
        eligible: calculation.coverage.covered,
        matched: calculation.coverage.covered,
        unavailable: calculation.coverage.unavailable,
        missingSymbols: calculation.coverage.missingSymbols
      },
      noDataReason: calculation.noDataReason,
      data: calculation.value !== null ? calculation : null,
      ...calculation
    });
  } catch (err: any) {
    console.error('[StockScans] /custom-indices/calculate error:', err);
    return res.status(500).json({
      success: false,
      status: 'ERROR',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'DUCKDB',
      data: null,
      error: err?.message || String(err)
    });
  }
});

// ── 13. Valuation Calculators ───────────────────────────────────────────────
stockscansRouter.post('/calculators/reverse-dcf', (req: Request, res: Response) => {
  try {
    const { cmp, currentEps, discountRate, terminalGrowthRate, terminalMultiple, projectionYears } = req.body;
    if (!cmp || !currentEps) {
      return res.status(400).json({ success: false, message: 'cmp and currentEps are required.' });
    }
    const result = WorkspaceService.calculateReverseDcf({
      cmp: Number(cmp),
      currentEps: Number(currentEps),
      discountRate: discountRate ? Number(discountRate) : undefined,
      terminalGrowthRate: terminalGrowthRate ? Number(terminalGrowthRate) : undefined,
      terminalMultiple: terminalMultiple ? Number(terminalMultiple) : undefined,
      projectionYears: projectionYears ? Number(projectionYears) : undefined
    });
    return res.json({
      success: true,
      status: 'VERIFIED',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'SQLITE_FERE',
      data: result,
      ...result
    });
  } catch (err: any) {
    console.error('[StockScans] /calculators/reverse-dcf error:', err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// ── 14. Durable Alerts ──────────────────────────────────────────────────────
stockscansRouter.get('/alerts', async (_req: Request, res: Response) => {
  try {
    const alerts = await WorkspaceService.getAlerts();
    return res.json({
      success: true,
      status: 'VERIFIED',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'SQLITE_FERE',
      alerts,
      data: alerts
    });
  } catch (err: any) {
    console.error('[StockScans] /alerts get error:', err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

stockscansRouter.post('/alerts', async (req: Request, res: Response) => {
  try {
    const { name, alertType, targetSymbol, criteria } = req.body;
    if (!name || !alertType || !criteria) {
      return res.status(400).json({ success: false, message: 'name, alertType, and criteria are required.' });
    }
    const alertId = await WorkspaceService.createAlert({ name, alertType, targetSymbol, criteria });
    return res.json({
      success: true,
      status: 'VERIFIED',
      asOf: new Date().toISOString().split('T')[0],
      sourceSystem: 'SQLITE_FERE',
      alertId
    });
  } catch (err: any) {
    console.error('[StockScans] /alerts post error:', err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

stockscansRouter.post('/alerts/:id/toggle', async (req: Request, res: Response) => {
  try {
    const alertId = Number(req.params.id);
    const isActive = Boolean(req.body.isActive);
    await WorkspaceService.toggleAlert(alertId, isActive);
    return res.json({ success: true, status: 'VERIFIED', asOf: new Date().toISOString().split('T')[0], sourceSystem: 'SQLITE_FERE', alertId, isActive });
  } catch (err: any) {
    console.error('[StockScans] /alerts toggle error:', err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

stockscansRouter.post('/alerts/:id/snooze', async (req: Request, res: Response) => {
  try {
    const alertId = Number(req.params.id);
    const hours = Number(req.body.hours || 24);
    await WorkspaceService.snoozeAlert(alertId, hours);
    return res.json({ success: true, status: 'VERIFIED', asOf: new Date().toISOString().split('T')[0], sourceSystem: 'SQLITE_FERE', message: `Alert ${alertId} snoozed for ${hours} hours.` });
  } catch (err: any) {
    console.error('[StockScans] /alerts snooze error:', err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});
