import { Router, Request, Response } from 'express';
import type {
  GetFactsResponse,
  BatchFactsRequest,
  BatchFactsResponse,
  PlatformHealthResponse,
  ProvenanceResponse,
  RefreshRequest,
  RefreshResponse,
} from '../types/ApiContract.js';
import { DataSource, NullReason } from '../types/DataPoint.js';
import { CircuitBreakerRegistry } from '../services/CircuitBreaker.js';
import { BudgetGuard } from '../services/BudgetGuard.js';

export const factsRouter = Router();

// ─── GET /api/v2/facts/:symbol ────────────────────────────────────────────────
factsRouter.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const forceRefresh = req.query.forceRefresh === 'true';

    if (!symbol || typeof symbol !== 'string') {
      res.status(400).json({ success: false, error: 'symbol is required', code: 'INVALID_PARAMS' });
      return;
    }

    // Stub: real implementation delegates to UnifiedDataResolver
    const response: GetFactsResponse = {
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        resolvedAt: new Date().toISOString(),
        lastPrice: { value: null, source: DataSource.UPSTOX_API_V2, fetchedAt: new Date().toISOString(), ageHours: 0, isEstimated: false, nullReason: NullReason.EXCHANGE_FEED_UNAVAILABLE },
        marketCap: { value: null, source: DataSource.SCREENER_IN, fetchedAt: new Date().toISOString(), ageHours: 0, isEstimated: false, nullReason: NullReason.EXCHANGE_FEED_UNAVAILABLE },
        peRatio: { value: null, source: DataSource.SCREENER_IN, fetchedAt: new Date().toISOString(), ageHours: 0, isEstimated: false },
        eps: { value: null, source: DataSource.SCREENER_IN, fetchedAt: new Date().toISOString(), ageHours: 0, isEstimated: false },
        bookValue: { value: null, source: DataSource.SCREENER_IN, fetchedAt: new Date().toISOString(), ageHours: 0, isEstimated: false },
        dividendYield: { value: null, source: DataSource.SCREENER_IN, fetchedAt: new Date().toISOString(), ageHours: 0, isEstimated: false },
        revenue: { value: null, source: DataSource.SCREENER_IN, fetchedAt: new Date().toISOString(), ageHours: 0, isEstimated: false },
        netProfit: { value: null, source: DataSource.SCREENER_IN, fetchedAt: new Date().toISOString(), ageHours: 0, isEstimated: false },
        debtToEquity: { value: null, source: DataSource.SCREENER_IN, fetchedAt: new Date().toISOString(), ageHours: 0, isEstimated: false },
        roce: { value: null, source: DataSource.SCREENER_IN, fetchedAt: new Date().toISOString(), ageHours: 0, isEstimated: false },
        roe: { value: null, source: DataSource.SCREENER_IN, fetchedAt: new Date().toISOString(), ageHours: 0, isEstimated: false },
      },
    };

    res.json(response);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, code: 'INTERNAL_ERROR' });
  }
});

// ─── GET /api/v2/facts/batch ──────────────────────────────────────────────────
factsRouter.get('/batch', async (req: Request, res: Response) => {
  try {
    const symbolsParam = req.query.symbols;
    if (!symbolsParam) {
      res.status(400).json({ success: false, error: 'symbols query param is required', code: 'INVALID_PARAMS' });
      return;
    }

    const symbols = (Array.isArray(symbolsParam) ? symbolsParam : [symbolsParam]) as string[];

    if (symbols.length === 0 || symbols.length > 100) {
      res.status(400).json({ success: false, error: 'symbols must have 1–100 entries', code: 'INVALID_PARAMS' });
      return;
    }

    const response: BatchFactsResponse = {
      success: true,
      data: [],
      meta: { total: symbols.length, resolved: 0, failed: symbols.length },
    };

    res.json(response);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, code: 'INTERNAL_ERROR' });
  }
});

// ─── GET /api/platform/health ─────────────────────────────────────────────────
export const platformRouter = Router();

platformRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const providers = ['UPSTOX_API_V2', 'YAHOO_FINANCE', 'NSE_BHAVCOPY', 'SCREENER_IN'];

    const providerHealth = providers.map((name) => {
      const cb = CircuitBreakerRegistry.get(name);
      return {
        provider: name,
        status: cb.state === 'OPEN' ? 'down' as const : cb.state === 'HALF_OPEN' ? 'degraded' as const : 'healthy' as const,
        circuitBreakerState: cb.state,
      };
    });

    const allDown = providerHealth.every((p) => p.status === 'down');
    const anyDegraded = providerHealth.some((p) => p.status !== 'healthy');

    const response: PlatformHealthResponse = {
      success: true,
      data: {
        status: allDown ? 'down' : anyDegraded ? 'degraded' : 'healthy',
        providers: providerHealth,
        cacheHitRate: 0,
        monthlyCostInr: 0,
        budgetRemainingInr: 2000,
        featureFlags: {},
        uptimeSeconds: process.uptime(),
      },
    };

    res.json(response);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, code: 'INTERNAL_ERROR' });
  }
});

// ─── GET /api/platform/provenance/:symbol ────────────────────────────────────
platformRouter.get('/provenance/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;

    const response: ProvenanceResponse = {
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        resolvedAt: new Date().toISOString(),
        entries: [],
      },
    };

    res.json(response);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, code: 'INTERNAL_ERROR' });
  }
});

// ─── POST /api/platform/refresh ───────────────────────────────────────────────
platformRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { symbols, providers }: RefreshRequest = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      res.status(400).json({ success: false, error: 'symbols array is required', code: 'INVALID_PARAMS' });
      return;
    }

    const response: RefreshResponse = {
      success: true,
      data: {
        queued: symbols,
        skipped: [],
      },
    };

    res.json(response);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, code: 'INTERNAL_ERROR' });
  }
});
