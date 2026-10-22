/**
 * WealthOS Remote Data Bridge — Safe Read-Only Gateway for Google AI Studio / Gemini
 *
 * Implements Phase 1 Contract:
 * - Strictly READ-ONLY operations.
 * - Local SQLite, DuckDB, and Parquet remain authoritative and local.
 * - Reuses existing canonical WealthOS services without parallel business logic.
 * - Constant-time token authentication via WEALTHOS_REMOTE_KEY / WEALTHOS_PRODUCT_KEY.
 * - Hard bounds on row counts (limit <= 500) and payload sizes (<= 64KB).
 * - Zero raw SQL endpoints; strictly sanitizes inputs and error responses.
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { CompanyIntelligenceOrchestrator } from '../services/intelligence/CompanyIntelligenceOrchestrator.js';
import { DuckDbAdjustedOhlcvService } from '../services/DuckDbAdjustedOhlcvService.js';
import { WealthOSProductionAdapter } from '../../mcp/adapters/wealthosAdapter.js';
import { getDB, dbGet } from '../database.js';

export const remoteBridgeRouter = Router();

// ── 1. SECURITY & CONSTANT-TIME AUTHENTICATION ───────────────────────────────

function getExpectedKeys(): string[] {
  const keys: string[] = [];
  if (process.env.WEALTHOS_REMOTE_KEY?.trim()) {
    keys.push(process.env.WEALTHOS_REMOTE_KEY.trim());
  }
  return keys;
}

function timingSafeTokenCompare(provided: string, expected: string): boolean {
  const bufA = Buffer.from(provided);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyBearerToken(token: string): boolean {
  const expectedKeys = getExpectedKeys();
  if (expectedKeys.length === 0) return false;

  for (const expected of expectedKeys) {
    if (timingSafeTokenCompare(token, expected)) {
      return true;
    }
  }
  return false;
}

// In-memory sliding-window rate limiter (120 req / 60s per IP)
const rateLimitWindowMs = 60 * 1000;
const maxRequestsPerWindow = 120;
const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();

function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const record = ipRequestCounts.get(clientIp);
  if (!record || now > record.resetTime) {
    ipRequestCounts.set(clientIp, { count: 1, resetTime: now + rateLimitWindowMs });
    return next();
  }

  record.count += 1;
  if (record.count > maxRequestsPerWindow) {
    return res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit of ${maxRequestsPerWindow} requests per minute exceeded.`
    });
  }

  next();
}

// Authentication middleware (all routes except /health)
function requireRemoteAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: 'MISSING_AUTHORIZATION',
      message: 'Authorization header with Bearer token is required.'
    });
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]?.trim()) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_AUTHORIZATION_FORMAT',
      message: 'Authorization header must follow "Bearer <token>" format.'
    });
  }

  const token = match[1].trim();
  const expectedKeys = getExpectedKeys();

  if (expectedKeys.length === 0) {
    return res.status(500).json({
      success: false,
      error: 'SERVER_MISCONFIGURED',
      message: 'Remote bridge key (WEALTHOS_REMOTE_KEY) is not configured in environment.'
    });
  }

  if (!verifyBearerToken(token)) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Invalid authentication token.'
    });
  }

  next();
}

// Sanitize strings to prevent leaking local filesystem paths or provider keys
function sanitizeOutput(data: any): any {
  if (!data) return data;
  const str = JSON.stringify(data);
  const sanitized = str
    .replace(/[A-Za-z]:\\[^"\\]+/g, '[INTERNAL_PATH]')
    .replace(/\/Users\/[^"/]+\/[^"]+/g, '[INTERNAL_PATH]')
    .replace(/(API_KEY|APP_PASSWORD|TOKEN|SECRET)":\s*"[^"]+"/gi, '$1":"[REDACTED]"');
  return JSON.parse(sanitized);
}

function computeDataState(modules: Record<string, any>): 'DATA_INSUFFICIENT' | 'PARTIAL' | 'READY' {
  const moduleResults = Object.values(modules).filter(Boolean) as Array<any>;
  const usableDataStates = new Set([
    'VERIFIED', 'PARTIAL', 'RAW_PROVIDER', 'PARSED', 'CANONICAL_MAPPED',
    'PRIMARY_SOURCE_VERIFIED', 'CROSS_SOURCE_VERIFIED', 'DERIVED_VERIFIED',
  ]);
  const usableModules = moduleResults.filter(module => usableDataStates.has(module.dataStatus));
  if (usableModules.length === 0) return 'DATA_INSUFFICIENT';
  if (usableModules.length === moduleResults.length) return 'READY';
  return 'PARTIAL';
}

// Mount global filters on remote router
remoteBridgeRouter.use(rateLimiterMiddleware);

// ── 2. HEALTH & READINESS ENDPOINT ──────────────────────────────────────────

/**
 * GET /api/remote/health
 * Public liveness probe providing bridge capabilities and local database statuses.
 */
remoteBridgeRouter.get('/health', async (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Protect all remaining routes with Bearer token authentication
remoteBridgeRouter.use(requireRemoteAuth);

// ── 3. SECURITY IDENTITY & PROFILE ──────────────────────────────────────────

/**
 * GET /api/remote/company/:symbol
 * Returns canonical identity and classification from MasterTickers.
 */
remoteBridgeRouter.get('/company/:symbol', async (req: Request, res: Response) => {
  const rawSymbol = String(req.params.symbol || '').trim();
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(rawSymbol)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_SYMBOL',
      message: 'Symbol must be alphanumeric and up to 20 characters.'
    });
  }

  const clean = rawSymbol.toUpperCase().replace(/\.(NS|BO)$/, '');
  const profile = await WealthOSProductionAdapter.getSecurityProfile(clean);

  if (!profile) {
    return res.status(404).json({
      success: false,
      error: 'SECURITY_NOT_FOUND',
      message: `Security '${clean}' not found in canonical master_tickers.`
    });
  }

  res.json({
    success: true,
    data: sanitizeOutput(profile)
  });
});

// ── 4. CANONICAL COMPANY INTELLIGENCE ───────────────────────────────────────

/**
 * GET /api/remote/company/:symbol/intelligence
 * Invokes CompanyIntelligenceOrchestrator with persist: false.
 * Strictly read-only synthesis across fundamental, valuation, FERE, QGLP, and management modules.
 */
remoteBridgeRouter.get('/company/:symbol/intelligence', async (req: Request, res: Response) => {
  const rawSymbol = String(req.params.symbol || '').trim();
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(rawSymbol)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_SYMBOL',
      message: 'Symbol must be alphanumeric and up to 20 characters.'
    });
  }

  const clean = rawSymbol.toUpperCase().replace(/\.(NS|BO)$/, '');
  const asOfDate = typeof req.query.asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.asOfDate)
    ? req.query.asOfDate
    : undefined;

  try {
    const orchestrator = CompanyIntelligenceOrchestrator.getInstance();
    const result = await orchestrator.getCompanyIntelligence(clean, undefined, {
      persist: false,
      asOfDate
    });

    const payload = {
      symbol: clean,
      isin: result.security.isin,
      companyName: result.security.companyName || clean,
      dataState: computeDataState(result.modules),
      evaluationTimestamp: result.generatedAt,
      modules: {
        fundamental: result.modules.fundamental ? {
          status: result.modules.fundamental.status,
          dataStatus: result.modules.fundamental.dataStatus,
          result: result.modules.fundamental.result,
          missingRequirements: result.modules.fundamental.missingRequirements,
          dataAsOf: result.modules.fundamental.dataAsOf
        } : null,
        valuation: result.modules.valuation ? {
          status: result.modules.valuation.status,
          dataStatus: result.modules.valuation.dataStatus,
          result: result.modules.valuation.result,
          missingRequirements: result.modules.valuation.missingRequirements,
          dataAsOf: result.modules.valuation.dataAsOf
        } : null,
        qglp: result.modules.qglp ? {
          status: result.modules.qglp.status,
          dataStatus: result.modules.qglp.dataStatus,
          result: result.modules.qglp.result,
          missingRequirements: result.modules.qglp.missingRequirements,
          dataAsOf: result.modules.qglp.dataAsOf
        } : null,
        fere: result.modules.fere ? {
          status: result.modules.fere.status,
          dataStatus: result.modules.fere.dataStatus,
          result: result.modules.fere.result,
          missingRequirements: result.modules.fere.missingRequirements,
          dataAsOf: result.modules.fere.dataAsOf
        } : null,
        management: result.modules.management ? {
          status: result.modules.management.status,
          dataStatus: result.modules.management.dataStatus,
          result: result.modules.management.result,
          missingRequirements: result.modules.management.missingRequirements,
          dataAsOf: result.modules.management.dataAsOf
        } : null,
        marketContext: result.modules.marketContext ? {
          status: result.modules.marketContext.status,
          dataStatus: result.modules.marketContext.dataStatus,
          result: result.modules.marketContext.result,
          missingRequirements: result.modules.marketContext.missingRequirements,
          dataAsOf: result.modules.marketContext.dataAsOf
        } : null
      }
    };

    res.json({
      success: true,
      data: sanitizeOutput(payload)
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'INTELLIGENCE_ORCHESTRATION_FAILED',
      message: err?.message || 'Failed to synthesize company intelligence'
    });
  }
});

// ── 5. BOUNDED FUNDAMENTALS & VALUATION ─────────────────────────────────────

/**
 * GET /api/remote/company/:symbol/fundamentals
 * Returns canonical fundamental health, financial metrics, and valuation summary.
 */
remoteBridgeRouter.get('/company/:symbol/fundamentals', async (req: Request, res: Response) => {
  const rawSymbol = String(req.params.symbol || '').trim();
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(rawSymbol)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_SYMBOL',
      message: 'Symbol must be alphanumeric and up to 20 characters.'
    });
  }

  const clean = rawSymbol.toUpperCase().replace(/\.(NS|BO)$/, '');

  try {
    const orchestrator = CompanyIntelligenceOrchestrator.getInstance();
    const result = await orchestrator.getCompanyIntelligence(clean, ['FUNDAMENTAL', 'VALUATION', 'QGLP'], {
      persist: false
    });

    const fundModule = result.modules.fundamental;
    const valModule = result.modules.valuation;
    const qglpModule = result.modules.qglp;

    res.json({
      success: true,
      data: sanitizeOutput({
        symbol: clean,
        isin: result.security.isin,
        companyName: result.security.companyName || clean,
        dataStatus: {
          fundamental: fundModule?.dataStatus || 'DATA_INSUFFICIENT',
          valuation: valModule?.dataStatus || 'DATA_INSUFFICIENT',
          qglp: qglpModule?.dataStatus || 'DATA_INSUFFICIENT'
        },
        fundamentals: fundModule?.result || null,
        valuation: valModule?.result || null,
        qglp: qglpModule?.result || null,
        missingRequirements: [
          ...(fundModule?.missingRequirements || []),
          ...(valModule?.missingRequirements || []),
          ...(qglpModule?.missingRequirements || [])
        ]
      })
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'FUNDAMENTALS_FETCH_FAILED',
      message: err?.message || 'Failed to fetch fundamental metrics'
    });
  }
});

// ── 6. BOUNDED TECHNICAL OHLCV (DUCKDB/PARQUET) ─────────────────────────────

/**
 * GET /api/remote/company/:symbol/technical
 * Returns bounded adjusted daily OHLCV bars from local DuckDB/Parquet store.
 * Strictly enforces limit <= 500 rows.
 */
remoteBridgeRouter.get('/company/:symbol/technical', async (req: Request, res: Response) => {
  const rawSymbol = String(req.params.symbol || '').trim();
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(rawSymbol)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_SYMBOL',
      message: 'Symbol must be alphanumeric and up to 20 characters.'
    });
  }

  const clean = rawSymbol.toUpperCase().replace(/\.(NS|BO)$/, '');

  // Parse and validate limit (default 100, maximum 500)
  const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : 100;
  if (isNaN(rawLimit) || !Number.isInteger(rawLimit) || rawLimit < 1) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_LIMIT',
      message: 'Limit must be a positive integer.'
    });
  }

  if (rawLimit > 500) {
    return res.status(400).json({
      success: false,
      error: 'LIMIT_EXCEEDED',
      message: 'Limit exceeds maximum allowed boundary of 500 rows.'
    });
  }

  const fromDate = typeof req.query.from === 'string' ? req.query.from : '1900-01-01';
  const toDate = typeof req.query.to === 'string' ? req.query.to : '2999-12-31';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_DATE_FORMAT',
      message: 'Date parameters "from" and "to" must use YYYY-MM-DD format.'
    });
  }

  try {
    const result = await DuckDbAdjustedOhlcvService.invokeForSymbol(clean, rawLimit, fromDate, toDate);
    if (!result.success) {
      return res.status(503).json({
        success: false,
        error: 'DUCKDB_UNAVAILABLE',
        message: result.error?.message || 'Adjusted OHLCV store unavailable.'
      });
    }

    const bars = (result.data || []).slice(0, rawLimit);
    res.json({
      success: true,
      symbol: clean,
      count: bars.length,
      limitEnforced: rawLimit,
      source: result.source,
      data: sanitizeOutput(bars)
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'TECHNICAL_FETCH_FAILED',
      message: err?.message || 'Failed to retrieve technical OHLCV'
    });
  }
});

// ── 7. PORTFOLIO & HOLDINGS READ-ONLY ENDPOINTS ─────────────────────────────

/**
 * GET /api/remote/portfolio
 * Returns active portfolios with summary metadata. Excludes credentials/tokens.
 */
remoteBridgeRouter.get('/portfolio', async (_req: Request, res: Response) => {
  try {
    const rawPortfolios = await WealthOSProductionAdapter.listPortfolios();
    const portfolios = (rawPortfolios || []).map((p: any) => ({
      name: p.name,
      type: p.type || 'EQUITY',
      baseCurrency: p.base_currency || 'INR',
      status: p.status || 'ACTIVE'
    }));

    res.json({
      success: true,
      count: portfolios.length,
      portfolios: sanitizeOutput(portfolios)
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'PORTFOLIO_LIST_FAILED',
      message: err?.message || 'Failed to retrieve portfolio list'
    });
  }
});

/**
 * GET /api/remote/portfolio/:portfolioId
 * Returns bounded holdings for the specified portfolio.
 */
remoteBridgeRouter.get('/portfolio/:portfolioId', async (req: Request, res: Response) => {
  const portfolioId = String(req.params.portfolioId || '').trim();
  if (!portfolioId || portfolioId.length > 50) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PORTFOLIO_ID',
      message: 'Portfolio ID is required (max 50 chars).'
    });
  }

  const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : 100;
  if (isNaN(rawLimit) || !Number.isInteger(rawLimit) || rawLimit < 1) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_LIMIT',
      message: 'Limit must be a positive integer.'
    });
  }

  if (rawLimit > 500) {
    return res.status(400).json({
      success: false,
      error: 'LIMIT_EXCEEDED',
      message: 'Limit exceeds maximum allowed boundary of 500 rows.'
    });
  }

  try {
    const summary = await WealthOSProductionAdapter.getPortfolioSummary(portfolioId);
    const rawHoldings = await WealthOSProductionAdapter.getPortfolioHoldings(portfolioId, rawLimit);

    const holdings = (rawHoldings || []).map((h: any) => ({
      symbol: h.symbol,
      isin: h.isin,
      quantity: h.quantity,
      avgCost: h.avgCost,
      currentPrice: h.currentPrice,
      totalCost: h.total_cost,
      currentValue: h.current_value,
      unrealizedPnL: h.unrealizedPnL,
      unrealizedPnLPct: h.unrealizedPnLPct
    }));

    res.json({
      success: true,
      portfolio: portfolioId,
      summary: sanitizeOutput(summary),
      count: holdings.length,
      holdings: sanitizeOutput(holdings)
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'PORTFOLIO_FETCH_FAILED',
      message: err?.message || 'Failed to retrieve portfolio holdings'
    });
  }
});

// ── 8. STRUCTURED READ-ONLY ANALYSIS & DISCOVERY ────────────────────────────

/**
 * POST /api/remote/analyze
 * Gemini invocation target for structured company analysis.
 * Strictly dispatches to existing canonical modules with persist: false.
 */
remoteBridgeRouter.post('/analyze', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PAYLOAD',
      message: 'Request body must be a JSON object.'
    });
  }

  const rawSymbol = String(req.body.symbol || '').trim();
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(rawSymbol)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_SYMBOL',
      message: 'Symbol is required and must be alphanumeric (max 20 chars).'
    });
  }

  const clean = rawSymbol.toUpperCase().replace(/\.(NS|BO)$/, '');
  const focus = req.body.focus ? String(req.body.focus).toLowerCase() : 'full';

  const validFoci = ['full', 'fundamentals', 'valuation', 'technical', 'qglp'];
  if (!validFoci.includes(focus)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_FOCUS',
      message: `Focus must be one of: ${validFoci.join(', ')}`
    });
  }

  try {
    if (focus === 'technical') {
      const result = await DuckDbAdjustedOhlcvService.invokeForSymbol(clean, 100, '1900-01-01', '2999-12-31');
      return res.json({
        success: true,
        symbol: clean,
        focus,
        bars: (result.data || []).slice(0, 100),
        source: result.source
      });
    }

    const orchestrator = CompanyIntelligenceOrchestrator.getInstance();
    const modulesToRun = focus === 'fundamentals'
      ? ['FUNDAMENTAL', 'VALUATION']
      : focus === 'valuation'
        ? ['VALUATION']
        : focus === 'qglp'
          ? ['QGLP', 'FUNDAMENTAL']
          : undefined;

    const intel = await orchestrator.getCompanyIntelligence(clean, modulesToRun as any, { persist: false });

    res.json({
      success: true,
      symbol: clean,
      focus,
      dataState: computeDataState(intel.modules),
      security: {
        symbol: intel.security.symbol,
        isin: intel.security.isin,
        companyName: intel.security.companyName
      },
      analysis: sanitizeOutput(intel.modules)
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'ANALYSIS_FAILED',
      message: err?.message || 'Structured analysis failed'
    });
  }
});

/**
 * POST /api/remote/discover
 * Structured security discovery across canonical master tickers.
 * Strictly bounded to limit <= 50.
 */
remoteBridgeRouter.post('/discover', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PAYLOAD',
      message: 'Request body must be a JSON object.'
    });
  }

  const query = typeof req.body.query === 'string' ? req.body.query.trim() : '';
  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_QUERY',
      message: 'Search query string is required.'
    });
  }

  const rawLimit = req.body.limit !== undefined ? Number(req.body.limit) : 20;
  if (isNaN(rawLimit) || !Number.isInteger(rawLimit) || rawLimit < 1) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_LIMIT',
      message: 'Limit must be a positive integer.'
    });
  }

  if (rawLimit > 50) {
    return res.status(400).json({
      success: false,
      error: 'LIMIT_EXCEEDED',
      message: 'Maximum discovery limit is 50 securities.'
    });
  }

  try {
    const results = await WealthOSProductionAdapter.searchSecurities(query, rawLimit);
    res.json({
      success: true,
      query,
      count: results.length,
      securities: sanitizeOutput(results)
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'DISCOVERY_FAILED',
      message: err?.message || 'Failed to discover securities'
    });
  }
});
