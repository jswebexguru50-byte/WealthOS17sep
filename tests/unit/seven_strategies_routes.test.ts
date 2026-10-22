import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { strategiesRouter } from '../../src/server/routes/strategies.js';
import { SevenStrategiesCandidatesService } from '../../src/server/services/SevenStrategiesCandidatesService.js';

vi.mock('../../src/server/services/SevenStrategiesCandidatesService.js', () => {
  return {
    SevenStrategiesCandidatesService: {
      getInstance: vi.fn()
    }
  };
});

describe('Seven Strategies Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.resetAllMocks();
    app = express();
    app.use('/strategies', strategiesRouter);
  });

  it('filters strategies and convergence candidates correctly', async () => {
    const mockPayload = {
      summary: {
        totalSignalsAcrossAll: 4,
        uniqueCandidatesCount: 2,
        convergenceCount: 1,
        strategyCounts: { S1a: 2, S2a: 2 }
      },
      strategies: {
        S1a: {
          strategyId: 'S1a',
          count: 2,
          candidates: [
            { symbol: 'A', strategyId: 'S1a', sector: 'IT', marketCapCategory: 'LARGE_CAP', signalDate: '2026-10-01' },
            { symbol: 'B', strategyId: 'S1a', sector: 'FINANCE', marketCapCategory: 'MID_CAP', signalDate: '2026-10-01' }
          ]
        },
        S2a: {
          strategyId: 'S2a',
          count: 2,
          candidates: [
            { symbol: 'A', strategyId: 'S2a', sector: 'IT', marketCapCategory: 'LARGE_CAP', signalDate: '2026-10-01' },
            { symbol: 'B', strategyId: 'S2a', sector: 'FINANCE', marketCapCategory: 'MID_CAP', signalDate: '2026-10-01' }
          ]
        }
      },
      convergence: [
        {
          symbol: 'A',
          convergenceCount: 2,
          distinctStrategyCount: 2,
          strategies: [{ strategyId: 'S1a' }, { strategyId: 'S2a' }],
          candidates: [
            { symbol: 'A', strategyId: 'S1a', sector: 'IT', marketCapCategory: 'LARGE_CAP', signalDate: '2026-10-01' },
            { symbol: 'A', strategyId: 'S2a', sector: 'IT', marketCapCategory: 'LARGE_CAP', signalDate: '2026-10-01' }
          ]
        },
        {
          symbol: 'B',
          convergenceCount: 2,
          distinctStrategyCount: 2,
          strategies: [{ strategyId: 'S1a' }, { strategyId: 'S2a' }],
          candidates: [
            { symbol: 'B', strategyId: 'S1a', sector: 'FINANCE', marketCapCategory: 'MID_CAP', signalDate: '2026-10-01' },
            { symbol: 'B', strategyId: 'S2a', sector: 'FINANCE', marketCapCategory: 'MID_CAP', signalDate: '2026-10-01' }
          ]
        }
      ]
    };

    const mockServiceInstance = {
      getCandidatesPayload: vi.fn().mockResolvedValue(mockPayload)
    };
    (SevenStrategiesCandidatesService.getInstance as any).mockReturnValue(mockServiceInstance);

    const res = await request(app).get('/strategies/seven-strategies-candidates?sector=IT');
    
    expect(res.status).toBe(200);
    expect(res.body.summary.uniqueCandidatesCount).toBe(1);
    expect(res.body.summary.convergenceCount).toBe(1); // Only 'A' left
    expect(res.body.summary.strategyCounts.S1a).toBe(1);
    
    expect(res.body.strategies.S1a.count).toBe(1);
    expect(res.body.strategies.S1a.candidates[0].symbol).toBe('A');

    expect(res.body.convergence.length).toBe(1);
    expect(res.body.convergence[0].symbol).toBe('A');
    expect(res.body.convergence[0].convergenceCount).toBe(2);
  });

  it('rejects invalid from/to dates with 400', async () => {
    const mockServiceInstance = {
      getCandidatesPayload: vi.fn().mockResolvedValue({ strategies: {}, convergence: [] })
    };
    (SevenStrategiesCandidatesService.getInstance as any).mockReturnValue(mockServiceInstance);

    const res = await request(app).get('/strategies/seven-strategies-candidates?from=2026-99-99');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Malformed from filter');
  });

  it('reports unknown query params in unsupportedFilters', async () => {
    const mockServiceInstance = {
      getCandidatesPayload: vi.fn().mockResolvedValue({ strategies: {}, convergence: [] })
    };
    (SevenStrategiesCandidatesService.getInstance as any).mockReturnValue(mockServiceInstance);

    const res = await request(app).get('/strategies/seven-strategies-candidates?unknownFilter=x');
    expect(res.status).toBe(200);
    expect(res.body.unsupportedFilters).toContain('unknownFilter');
  });
  it('supports early limit and query flags without flagging as unsupportedFilters', async () => {
    const mockServiceInstance = {
      getCandidatesPayload: vi.fn().mockResolvedValue({
        summary: { totalSignalsAcrossAll: 10, uniqueCandidatesCount: 5, convergenceCount: 1, strategyCounts: { S1a: 5 } },
        strategies: {
          S1a: {
            strategyId: 'S1a',
            count: 5,
            candidates: Array.from({ length: 5 }).map((_, i) => ({ symbol: `SYM_${i}`, strategyId: 'S1a', signalDate: '2026-10-01' }))
          }
        },
        convergence: []
      })
    };
    (SevenStrategiesCandidatesService.getInstance as any).mockReturnValue(mockServiceInstance);

    const res = await request(app).get('/strategies/seven-strategies-candidates?limit=2&offset=0&includeTechnicals=false&includeSectorMomentum=false&includeConvergence=false&includeActionReadiness=false');
    
    expect(res.status).toBe(200);
    expect(mockServiceInstance.getCandidatesPayload).toHaveBeenCalledWith({
      forceRefresh: false,
      limit: 2,
      offset: 0,
      includeTechnicals: false,
      includeSectorMomentum: false,
      includeConvergence: false,
      includeActionReadiness: false
    });

    expect(res.body.unsupportedFilters).toEqual([]);
    expect(res.body.filtersApplied.limit).toBe(2);
    expect(res.body.filtersApplied.includeTechnicals).toBe(false);
    expect(res.body.candidates.length).toBe(2);
  });

  it('rejects invalid limit and offset with 400', async () => {
    const mockServiceInstance = {
      getCandidatesPayload: vi.fn()
    };
    (SevenStrategiesCandidatesService.getInstance as any).mockReturnValue(mockServiceInstance);

    const res1 = await request(app).get('/strategies/seven-strategies-candidates?limit=-5');
    expect(res1.status).toBe(400);
    expect(res1.body.error).toContain('Malformed limit');

    const res2 = await request(app).get('/strategies/seven-strategies-candidates?offset=-1');
    expect(res2.status).toBe(400);
    expect(res2.body.error).toContain('Malformed offset');
  });
});
